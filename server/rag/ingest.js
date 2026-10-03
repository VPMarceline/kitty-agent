const fs = require("node:fs");
const path = require("node:path");

const {
  EMBED_MODEL,
  INDEX_PATH,
  embedTexts,
  parseFrontMatter,
  splitDocument,
} = require("./retrieve");

const DOCUMENTS_DIR = path.join(__dirname, "documents");
const MANIFEST_PATH = path.join(__dirname, "manifest.json");

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const approved = manifest.filter((item) => item.status === "approved");
  const chunks = [];

  for (const entry of approved) {
    const markdown = fs.readFileSync(path.join(DOCUMENTS_DIR, entry.file), "utf8");
    const { metadata, body } = parseFrontMatter(markdown);
    if (metadata.id !== entry.id) {
      throw new Error(`${entry.file} 的 id 与 manifest 不一致`);
    }
    if (metadata.review_status !== "approved") continue;
    if (metadata.expires_at && Date.parse(metadata.expires_at) < Date.now()) {
      throw new Error(`${entry.file} 已过复核有效期，请审核后更新 expires_at`);
    }

    splitDocument(body).forEach((text, index) => {
      chunks.push({
        chunkId: `${metadata.id}-${String(index + 1).padStart(2, "0")}`,
        documentId: metadata.id,
        title: metadata.title,
        topic: metadata.topic,
        text,
        sourceType: metadata.source_type,
        sourceOrg: metadata.source_org,
        sourceUrl: metadata.source_url,
        jurisdiction: metadata.jurisdiction,
        riskLevel: metadata.risk_level,
        reviewedAt: metadata.reviewed_at,
        expiresAt: metadata.expires_at,
      });
    });
  }

  console.log(`准备向量化：${approved.length} 份文档，${chunks.length} 个片段`);
  const batchSize = 12;
  for (let start = 0; start < chunks.length; start += batchSize) {
    const batch = chunks.slice(start, start + batchSize);
    const vectors = await embedTexts(batch.map((item) => item.text));
    if (vectors.length !== batch.length) {
      throw new Error("嵌入数量与文本片段数量不一致");
    }
    vectors.forEach((vector, index) => {
      batch[index].embedding = vector;
    });
    console.log(`已完成 ${Math.min(start + batch.length, chunks.length)}/${chunks.length}`);
  }

  const index = {
    version: 1,
    embeddingModel: EMBED_MODEL,
    createdAt: new Date().toISOString(),
    documentCount: approved.length,
    chunkCount: chunks.length,
    chunks,
  };
  fs.writeFileSync(INDEX_PATH, `${JSON.stringify(index)}\n`, "utf8");
  console.log(`索引已写入：${INDEX_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
