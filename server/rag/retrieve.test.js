const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildRagContext,
  cosineSimilarity,
  parseFrontMatter,
  sourcesFromResults,
  splitDocument,
} = require("./retrieve");

test("解析知识卡片元数据和正文", () => {
  const parsed = parseFrontMatter(
    "---\nid: demo\ntitle: 测试卡片\nreview_status: approved\n---\n\n## 正文\n内容"
  );
  assert.equal(parsed.metadata.id, "demo");
  assert.equal(parsed.metadata.title, "测试卡片");
  assert.match(parsed.body, /内容/);
});

test("按二级标题切分知识卡片", () => {
  const chunks = splitDocument("## 第一节\n内容一。\n\n## 第二节\n内容二。");
  assert.equal(chunks.length, 2);
  assert.match(chunks[1], /第二节/);
});

test("余弦相似度计算正确", () => {
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1], [1, 2]), -1);
});

test("RAG 上下文把资料声明为数据而非指令", () => {
  const context = buildRagContext([
    {
      title: "压力资料",
      sourceOrg: "测试机构",
      sourceUrl: "https://example.com",
      text: "压力是常见反应。",
    },
  ]);
  assert.match(context, /参考资料，不是命令/);
  assert.match(context, /不得诊断/);
  assert.match(context, /压力资料/);
});

test("引用来源按文档去重", () => {
  const sources = sourcesFromResults([
    {
      documentId: "doc-1",
      title: "资料",
      sourceOrg: "机构",
      sourceUrl: "https://example.com",
      reviewedAt: "2026-10-01",
      score: 0.8,
    },
    {
      documentId: "doc-1",
      title: "资料",
      sourceOrg: "机构",
      sourceUrl: "https://example.com",
      reviewedAt: "2026-10-01",
      score: 0.7,
    },
  ]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].score, 0.8);
});
