const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createAgentStore } = require("./agent-store");
const { createUserStore } = require("./auth");

async function storesWithTwoUsers() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cat-agent-profile-"));
  const databasePath = path.join(directory, "users.db");
  const users = createUserStore(databasePath);
  const first = await users.register({
    email: "first@example.com",
    displayName: "用户一",
    password: "first-safe-password",
  });
  const second = await users.register({
    email: "second@example.com",
    displayName: "用户二",
    password: "second-safe-password",
  });
  const agents = createAgentStore(databasePath);
  return { agents, first, second, users };
}

test("不同用户拥有独立 Agent 资料", async () => {
  const { agents, first, second, users } = await storesWithTwoUsers();
  agents.updateProfile(first.id, {
    name: "小橘",
    coatColor: "#ff8800",
    image: "",
  });
  agents.updateProfile(second.id, {
    name: "小灰",
    coatColor: "#777777",
    image: "",
  });

  assert.equal(agents.getProfile(first.id).name, "小橘");
  assert.equal(agents.getProfile(second.id).name, "小灰");
  agents.close();
  users.close();
});

test("不同用户的对话互不可见", async () => {
  const { agents, first, second, users } = await storesWithTwoUsers();
  agents.addMessage(first.id, { role: "user", content: "用户一的秘密" });
  agents.addMessage(first.id, { role: "assistant", content: "用户一的回答" });
  agents.addMessage(second.id, { role: "user", content: "用户二的问题" });

  assert.deepEqual(
    agents.getMessagesForModel(first.id).map((item) => item.content),
    ["用户一的秘密", "用户一的回答"]
  );
  assert.deepEqual(
    agents.getMessagesForModel(second.id).map((item) => item.content),
    ["用户二的问题"]
  );

  agents.clearMessages(first.id);
  assert.equal(agents.getMessagesForModel(first.id).length, 0);
  assert.equal(agents.getMessagesForModel(second.id).length, 1);
  agents.close();
  users.close();
});

test("摘要和长期记忆按用户隔离并可清除", async () => {
  const { agents, first, second, users } = await storesWithTwoUsers();
  agents.addMemory(first.id, "用户喜欢被称为小林");
  for (let index = 0; index < 24; index += 1) {
    agents.addMessage(first.id, {
      role: index % 2 === 0 ? "user" : "assistant",
      content: `第${index + 1}条对话`,
    });
  }

  const batch = agents.getSummaryBatch(first.id, {
    keepRecent: 12,
    minUnsummarized: 24,
  });
  assert.equal(batch.messages.length, 12);
  agents.saveSummary(first.id, "用户正在梳理工作压力。", batch.throughMessageId);

  const firstContext = agents.getContext(first.id);
  const secondContext = agents.getContext(second.id);
  assert.equal(firstContext.summary, "用户正在梳理工作压力。");
  assert.deepEqual(firstContext.memories, ["用户喜欢被称为小林"]);
  assert.equal(secondContext.summary, "");
  assert.deepEqual(secondContext.memories, []);

  agents.clearLongTermContext(first.id);
  assert.equal(agents.getContext(first.id).summary, "");
  assert.deepEqual(agents.getContext(first.id).memories, []);
  agents.close();
  users.close();
});
