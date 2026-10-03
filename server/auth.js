const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const { DatabaseSync } = require("node:sqlite");

const scryptAsync = promisify(crypto.scrypt);
const SESSION_COOKIE = "cat_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SCRYPT_COST = 16384;

class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateRegistration({ email, password, displayName }) {
  const normalizedEmail = normalizeEmail(email);
  const name = String(displayName || "").replace(/[\r\n<>]/g, "").trim();
  const secret = String(password || "");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254) {
    throw new AuthError("请输入有效的邮箱地址");
  }
  if (name.length < 1 || name.length > 30) {
    throw new AuthError("显示名称需要1到30个字符");
  }
  if (secret.length < 10 || secret.length > 128) {
    throw new AuthError("密码需要10到128个字符");
  }

  return { email: normalizedEmail, password: secret, displayName: name };
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scryptAsync(password, salt, 64, {
    N: SCRYPT_COST,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${SCRYPT_COST}$8$1$${salt.toString("base64")}$${derived.toString("base64")}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, cost, blockSize, parallelization, saltValue, hashValue] = String(encoded).split("$");
  if (algorithm !== "scrypt" || !saltValue || !hashValue) return false;
  const expected = Buffer.from(hashValue, "base64");
  const actual = await scryptAsync(password, Buffer.from(saltValue, "base64"), expected.length, {
    N: Number(cost),
    r: Number(blockSize),
    p: Number(parallelization),
    maxmem: 64 * 1024 * 1024,
  });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function hashSessionToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

function createUserStore(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);

  const statements = {
    findUserByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
    insertUser: db.prepare(`
      INSERT INTO users (email, display_name, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `),
    findUserById: db.prepare("SELECT * FROM users WHERE id = ?"),
    updateLastLogin: db.prepare("UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?"),
    insertSession: db.prepare(`
      INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
      VALUES (?, ?, ?, ?)
    `),
    findSessionUser: db.prepare(`
      SELECT users.* FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?
    `),
    deleteSession: db.prepare("DELETE FROM sessions WHERE token_hash = ?"),
    deleteExpiredSessions: db.prepare("DELETE FROM sessions WHERE expires_at <= ?"),
  };

  statements.deleteExpiredSessions.run(new Date().toISOString());

  return {
    async register(input) {
      const validated = validateRegistration(input);
      if (statements.findUserByEmail.get(validated.email)) {
        throw new AuthError("该邮箱已经注册", 409);
      }
      const now = new Date().toISOString();
      const passwordHash = await hashPassword(validated.password);
      let result;
      try {
        result = statements.insertUser.run(
          validated.email,
          validated.displayName,
          passwordHash,
          now,
          now
        );
      } catch (error) {
        if (String(error.message).includes("UNIQUE constraint failed")) {
          throw new AuthError("该邮箱已经注册", 409);
        }
        throw error;
      }
      return publicUser(statements.findUserById.get(Number(result.lastInsertRowid)));
    },

    async authenticate(email, password) {
      const row = statements.findUserByEmail.get(normalizeEmail(email));
      // 用户不存在时仍执行一次哈希，减少通过耗时判断邮箱是否存在的差异。
      const fallbackHash =
        "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$8aHEohsK4iYcn35C35SVqbziAYWglcpVa1mSnU1pTRD3M5YQv9OYvPx6A8ZJ5PFJrrMZfmZo5rg6TVuaJQvCFw==";
      const valid = await verifyPassword(String(password || ""), row?.password_hash || fallbackHash);
      if (!row || !valid) {
        throw new AuthError("邮箱或密码错误", 401);
      }
      const now = new Date().toISOString();
      statements.updateLastLogin.run(now, now, row.id);
      return publicUser(statements.findUserById.get(row.id));
    },

    createSession(userId) {
      const token = crypto.randomBytes(32).toString("base64url");
      const now = new Date();
      const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
      statements.insertSession.run(
        hashSessionToken(token),
        userId,
        now.toISOString(),
        expiresAt.toISOString()
      );
      return { token, expiresAt };
    },

    getUserBySession(token) {
      if (!token) return null;
      const row = statements.findSessionUser.get(hashSessionToken(token), new Date().toISOString());
      return row ? publicUser(row) : null;
    },

    deleteSession(token) {
      if (token) statements.deleteSession.run(hashSessionToken(token));
    },

    close() {
      db.close();
    },
  };
}

function parseCookies(header) {
  const result = {};
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

function sessionCookie(token, expiresAt) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`;
}

function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function createAuth({ databasePath }) {
  const store = createUserStore(databasePath);
  const attempts = new Map();

  function limitAuthAttempts(req, res, next) {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const current = attempts.get(key);
    if (!current || current.resetAt <= now) {
      attempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
      return next();
    }
    current.count += 1;
    if (current.count > 20) {
      return res.status(429).json({ error: "尝试次数过多，请15分钟后再试" });
    }
    return next();
  }

  function readSession(req) {
    return parseCookies(req.headers.cookie)[SESSION_COOKIE] || "";
  }

  function requireAuth(req, res, next) {
    const user = store.getUserBySession(readSession(req));
    if (!user) return res.status(401).json({ error: "请先登录" });
    req.user = user;
    return next();
  }

  async function register(req, res) {
    try {
      const user = await store.register(req.body || {});
      const session = store.createSession(user.id);
      res.setHeader("Set-Cookie", sessionCookie(session.token, session.expiresAt));
      return res.status(201).json({ user });
    } catch (error) {
      const status = error instanceof AuthError ? error.status : 500;
      if (status === 500) console.error("注册失败：", error);
      return res.status(status).json({ error: status === 500 ? "注册暂时不可用" : error.message });
    }
  }

  async function login(req, res) {
    try {
      const user = await store.authenticate(req.body?.email, req.body?.password);
      const session = store.createSession(user.id);
      res.setHeader("Set-Cookie", sessionCookie(session.token, session.expiresAt));
      return res.json({ user });
    } catch (error) {
      const status = error instanceof AuthError ? error.status : 500;
      if (status === 500) console.error("登录失败：", error);
      return res.status(status).json({ error: status === 500 ? "登录暂时不可用" : error.message });
    }
  }

  function logout(req, res) {
    store.deleteSession(readSession(req));
    res.setHeader("Set-Cookie", clearSessionCookie());
    return res.status(204).end();
  }

  function me(req, res) {
    const user = store.getUserBySession(readSession(req));
    if (!user) return res.status(401).json({ error: "未登录" });
    return res.json({ user });
  }

  return { limitAuthAttempts, login, logout, me, register, requireAuth, store };
}

module.exports = {
  AuthError,
  SESSION_COOKIE,
  createAuth,
  createUserStore,
  hashPassword,
  normalizeEmail,
  parseCookies,
  validateRegistration,
  verifyPassword,
};
