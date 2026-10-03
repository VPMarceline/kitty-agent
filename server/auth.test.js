const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { AuthError, createUserStore, normalizeEmail } = require("./auth");

function temporaryDatabase() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cat-agent-auth-"));
  return createUserStore(path.join(directory, "users.db"));
}

test("邮箱会被规范化", () => {
  assert.equal(normalizeEmail("  CAT@Example.COM "), "cat@example.com");
});

test("注册时只存储密码哈希，并可以登录", async () => {
  const store = temporaryDatabase();
  const user = await store.register({
    email: "cat@example.com",
    displayName: "小猫用户",
    password: "very-safe-password",
  });

  assert.equal(user.email, "cat@example.com");
  const authenticated = await store.authenticate("CAT@example.com", "very-safe-password");
  assert.equal(authenticated.id, user.id);

  await assert.rejects(
    () => store.authenticate("cat@example.com", "wrong-password"),
    (error) => error instanceof AuthError && error.status === 401
  );
  store.close();
});

test("会话可以创建、查询和撤销", async () => {
  const store = temporaryDatabase();
  const user = await store.register({
    email: "session@example.com",
    displayName: "会话用户",
    password: "another-safe-password",
  });
  const session = store.createSession(user.id);

  assert.equal(store.getUserBySession(session.token).id, user.id);
  store.deleteSession(session.token);
  assert.equal(store.getUserBySession(session.token), null);
  store.close();
});

test("拒绝重复邮箱和过短密码", async () => {
  const store = temporaryDatabase();
  await store.register({
    email: "duplicate@example.com",
    displayName: "用户",
    password: "long-enough-password",
  });
  await assert.rejects(
    () =>
      store.register({
        email: "DUPLICATE@example.com",
        displayName: "另一个用户",
        password: "long-enough-password",
      }),
    (error) => error instanceof AuthError && error.status === 409
  );
  await assert.rejects(
    () =>
      store.register({
        email: "short@example.com",
        displayName: "用户",
        password: "123",
      }),
    (error) => error instanceof AuthError
  );
  store.close();
});
