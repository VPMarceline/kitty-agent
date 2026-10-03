import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = process.cwd();
const sourcePath = join(
  projectRoot,
  "data",
  "raw",
  "SoulChatCorpus",
  "SoulChatCorpus-sft-multi-Turn.json"
);
const outputDir = join(projectRoot, "data", "processed", "soulchat-v1");
const trainPath = join(outputDir, "train.jsonl");
const validationPath = join(outputDir, "validation.jsonl");
const reviewPath = join(outputDir, "manual-review-sample.jsonl");

const systemPrompt =
  "你是一只温暖、耐心的AI心理支持小猫。你不是持证心理咨询师或医生，不能诊断疾病、调整药物或替代专业服务。先倾听和确认感受，再询问用户希望得到倾听、梳理还是建议。每次最多提出一个主要问题，不鼓励依赖；遇到自伤、伤人或暴力风险时，优先确认安全并建议现实紧急求助。";

const patterns = {
  pii: [
    /\b1[3-9]\d{9}\b/,
    /\b\d{17}[\dXx]\b/,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
    /(?:微信|QQ|手机号|电话)[：:\s]*[A-Za-z0-9_-]{5,}/i,
  ],
  abusiveAssistant: [
    /傻逼|废物|蠢货|弱小的自卑者|你活该|闭嘴|去死/,
  ],
  dependencyAssistant: [
    /我会一直(在|陪|支持)/,
    /永远(陪着|支持|守护)你/,
    /随时(都)?可以(来)?找我/,
    /你只需要我|只有我理解你|不要告诉别人/,
  ],
  diagnosisAssistant: [
    /你(就是|一定是|肯定是|已经)(得了|患有)?[^，。]{0,12}(抑郁症|焦虑症|躁郁症|双相|精神分裂)/,
    /我诊断你|可以确诊/,
  ],
  medicationAssistant: [
    /(?:应该|建议你|可以)(?:立即)?(?:停药|换药|加量|减量|增加剂量|减少剂量)/,
    /不用问医生|不需要看医生/,
  ],
  crisisUser: [
    /自杀|自伤|割腕|跳楼|上吊|服药自杀|结束生命|不想活|想死|活不下去/,
    /杀了他|杀了她|杀人|伤害别人|伤害他人/,
    /正在被.{0,6}(打|殴打|家暴|性侵|威胁)|被囚禁|不让我离开/,
  ],
  safeCrisisAssistant: [
    /立即|紧急|安全|求助|急诊|医院|120|110/,
    /可信任|身边的人|专业(人员|帮助|支持)|心理咨询师|不要独处/,
  ],
};

const stats = {
  scanned: 0,
  structurallyValid: 0,
  safeCandidates: 0,
  trainWritten: 0,
  validationWritten: 0,
  reviewWritten: 0,
  rejected: {},
};

function reject(reason) {
  stats.rejected[reason] = (stats.rejected[reason] || 0) + 1;
  return { ok: false, reason };
}

function matchesAny(text, expressions) {
  return expressions.some((expression) => expression.test(text));
}

function validateConversation(record) {
  if (!Array.isArray(record.messages) || record.messages.length < 2) {
    return reject("invalid_messages");
  }

  if (record.messages.length > 30) {
    return reject("too_many_turns");
  }

  for (let index = 0; index < record.messages.length; index += 1) {
    const message = record.messages[index];
    const expectedRole = index % 2 === 0 ? "user" : "assistant";
    if (message?.role !== expectedRole || typeof message.content !== "string") {
      return reject("invalid_role_order");
    }
    const content = message.content.trim();
    if (!content || content.length > 2000) {
      return reject("invalid_message_length");
    }
    if (matchesAny(content, patterns.pii)) {
      return reject("possible_pii");
    }

    if (message.role === "assistant") {
      if (matchesAny(content, patterns.abusiveAssistant)) {
        return reject("abusive_assistant");
      }
      if (matchesAny(content, patterns.dependencyAssistant)) {
        return reject("dependency_assistant");
      }
      if (matchesAny(content, patterns.diagnosisAssistant)) {
        return reject("diagnosis_assistant");
      }
      if (matchesAny(content, patterns.medicationAssistant)) {
        return reject("medication_assistant");
      }
    }
  }

  for (let index = 0; index < record.messages.length; index += 2) {
    const userText = record.messages[index].content;
    if (!matchesAny(userText, patterns.crisisUser)) continue;
    const assistantText = record.messages[index + 1]?.content || "";
    if (!matchesAny(assistantText, patterns.safeCrisisAssistant)) {
      return reject("unsafe_crisis_response");
    }
  }

  stats.structurallyValid += 1;
  return { ok: true };
}

function bucketFor(record) {
  const digest = createHash("sha256")
    .update(`${record.id ?? ""}:${record.topic ?? ""}`)
    .digest();
  return digest.readUInt16BE(0) % 1000;
}

function toTrainingRecord(record) {
  return {
    source_id: record.id,
    topic: record.topic,
    messages: [
      { role: "system", content: systemPrompt },
      ...record.messages.map((message) => ({
        role: message.role,
        content: message.content.trim(),
      })),
    ],
  };
}

async function processObject(objectText, writers) {
  stats.scanned += 1;
  let record;
  try {
    record = JSON.parse(objectText);
  } catch {
    reject("json_parse_error");
    return;
  }

  if (!validateConversation(record).ok) return;
  stats.safeCandidates += 1;

  const bucket = bucketFor(record);
  const line = `${JSON.stringify(toTrainingRecord(record))}\n`;

  // 约 8% 训练集、0.5% 验证集；哈希抽样可覆盖完整原始文件而非只取开头主题。
  if (bucket < 80) {
    writers.train.write(line);
    stats.trainWritten += 1;
  } else if (bucket < 85) {
    writers.validation.write(line);
    stats.validationWritten += 1;
  }

  if (bucket >= 85 && bucket < 86 && stats.reviewWritten < 300) {
    writers.review.write(line);
    stats.reviewWritten += 1;
  }

  if (stats.scanned % 10000 === 0) {
    console.log(
      `已扫描 ${stats.scanned}，安全候选 ${stats.safeCandidates}，训练样本 ${stats.trainWritten}`
    );
  }
}

async function parseTopLevelArray(writers) {
  const stream = createReadStream(sourcePath, { encoding: "utf8" });
  let started = false;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objectText = "";

  for await (const chunk of stream) {
    for (const character of chunk) {
      if (!started) {
        if (character === "[") started = true;
        continue;
      }

      if (depth === 0) {
        if (character === "{") {
          depth = 1;
          objectText = "{";
          inString = false;
          escaped = false;
        }
        continue;
      }

      objectText += character;

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          await processObject(objectText, writers);
          objectText = "";
        }
      }
    }
  }

  if (depth !== 0 || objectText) {
    throw new Error("原始 JSON 在对象中途结束，文件可能不完整。");
  }
}

await mkdir(outputDir, { recursive: true });
const writers = {
  train: createWriteStream(trainPath, { encoding: "utf8" }),
  validation: createWriteStream(validationPath, { encoding: "utf8" }),
  review: createWriteStream(reviewPath, { encoding: "utf8" }),
};

try {
  await parseTopLevelArray(writers);
} finally {
  await Promise.all(
    Object.values(writers).map(
      (writer) => new Promise((resolve, rejectWriter) => {
        writer.on("error", rejectWriter);
        writer.end(resolve);
      })
    )
  );
}

const report = {
  generatedAt: new Date().toISOString(),
  source: sourcePath,
  policyVersion: "soulchat-v1",
  note:
    "这是自动过滤后的候选数据，仍须由具备心理健康专业知识的人员抽样审查后才能用于训练。",
  stats,
};

await writeFile(
  join(outputDir, "preparation-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);
await writeFile(
  join(outputDir, "README.md"),
  `# SoulChatCorpus 微调候选集\n\n- \`train.jsonl\`：确定性哈希抽取约 8% 的自动过滤候选。\n- \`validation.jsonl\`：与训练集互斥的约 0.5% 候选。\n- \`manual-review-sample.jsonl\`：用于人工审核过滤质量的样本。\n- \`preparation-report.json\`：处理统计和拒绝原因。\n\n这些文件不是经临床验证的数据。训练前必须人工审查，尤其关注危机应答、诊断/药物越界、依赖诱导、羞辱性语言和个人信息。\n`,
  "utf8"
);

console.log(JSON.stringify(report, null, 2));
