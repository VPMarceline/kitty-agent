const { DatabaseSync } = require("node:sqlite");

const DEFAULT_AGENT = {
  name: "巨山超力霸",
  coatColor: "#8f8178",
  image: "",
};

function sanitizeProfile(input = {}) {
  const name = String(input.name || "")
    .replace(/[\r\n<>]/g, "")
    .trim()
    .slice(0, 20);
  const coatColor = /^#[0-9a-f]{6}$/i.test(String(input.coatColor || ""))
    ? String(input.coatColor).toLowerCase()
    : DEFAULT_AGENT.coatColor;
  const image = String(input.image || "");
  const safeImage =
    image === "" ||
    (/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(image) &&
      image.length <= 350_000)
      ? image
      : "";

  return {
    name: name || DEFAULT_AGENT.name,
    coatColor,
    image: safeImage,
  };
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function createAgentStore(databasePath) {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_profiles (
      user_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      coat_color TEXT NOT NULL,
      image_data TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '默认对话',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      safety_json TEXT,
      sources_json TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversation_summaries (
      conversation_id INTEGER PRIMARY KEY,
      summary TEXT NOT NULL DEFAULT '',
      summarized_through_message_id INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_default
      ON conversations(user_id, title);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages(conversation_id, id);
  `);

  const statements = {
    findProfile: db.prepare("SELECT * FROM agent_profiles WHERE user_id = ?"),
    insertProfile: db.prepare(`
      INSERT INTO agent_profiles (user_id, name, coat_color, image_data, created_at, updated_at)
      VALUES (?, ?, ?, '', ?, ?)
    `),
    updateProfile: db.prepare(`
      UPDATE agent_profiles
      SET name = ?, coat_color = ?, image_data = ?, updated_at = ?
      WHERE user_id = ?
    `),
    findConversation: db.prepare(
      "SELECT * FROM conversations WHERE user_id = ? AND title = '默认对话'"
    ),
    insertConversation: db.prepare(`
      INSERT INTO conversations (user_id, title, created_at, updated_at)
      VALUES (?, '默认对话', ?, ?)
    `),
    touchConversation: db.prepare(
      "UPDATE conversations SET updated_at = ? WHERE id = ?"
    ),
    insertMessage: db.prepare(`
      INSERT INTO messages
        (conversation_id, role, content, safety_json, sources_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    recentMessages: db.prepare(`
      SELECT * FROM (
        SELECT id, role, content, safety_json, sources_json, created_at
        FROM messages
        WHERE conversation_id = ?
        ORDER BY id DESC
        LIMIT ?
      ) ORDER BY id ASC
    `),
    deleteMessages: db.prepare("DELETE FROM messages WHERE conversation_id = ?"),
    findSummary: db.prepare(
      "SELECT * FROM conversation_summaries WHERE conversation_id = ?"
    ),
    saveSummary: db.prepare(`
      INSERT INTO conversation_summaries
        (conversation_id, summary, summarized_through_message_id, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(conversation_id) DO UPDATE SET
        summary = excluded.summary,
        summarized_through_message_id = excluded.summarized_through_message_id,
        updated_at = excluded.updated_at
    `),
    deleteSummary: db.prepare(
      "DELETE FROM conversation_summaries WHERE conversation_id = ?"
    ),
    messagesAfterSummary: db.prepare(`
      SELECT id, role, content, created_at
      FROM messages
      WHERE conversation_id = ? AND id > ?
      ORDER BY id ASC
    `),
    latestMessage: db.prepare(
      "SELECT id FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1"
    ),
    listMemories: db.prepare(`
      SELECT id, content, created_at, updated_at
      FROM user_memories
      WHERE user_id = ?
      ORDER BY id ASC
      LIMIT ?
    `),
    findMemory: db.prepare(
      "SELECT id FROM user_memories WHERE user_id = ? AND content = ?"
    ),
    insertMemory: db.prepare(`
      INSERT INTO user_memories (user_id, content, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `),
    deleteMemory: db.prepare(
      "DELETE FROM user_memories WHERE id = ? AND user_id = ?"
    ),
    deleteMemories: db.prepare("DELETE FROM user_memories WHERE user_id = ?"),
  };

  function getOrCreateProfile(userId) {
    let row = statements.findProfile.get(userId);
    if (!row) {
      const now = new Date().toISOString();
      statements.insertProfile.run(
        userId,
        DEFAULT_AGENT.name,
        DEFAULT_AGENT.coatColor,
        now,
        now
      );
      row = statements.findProfile.get(userId);
    }
    return {
      name: row.name,
      coatColor: row.coat_color,
      image: row.image_data,
      updatedAt: row.updated_at,
    };
  }

  function getOrCreateConversation(userId) {
    let row = statements.findConversation.get(userId);
    if (!row) {
      const now = new Date().toISOString();
      const result = statements.insertConversation.run(userId, now, now);
      row = { id: Number(result.lastInsertRowid), user_id: userId };
    }
    return row;
  }

  function getMessages(userId, limit = 100) {
    const conversation = getOrCreateConversation(userId);
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    return statements.recentMessages.all(conversation.id, safeLimit).map((row) => ({
      id: row.id,
      role: row.role,
      content: row.content,
      safety: parseJson(row.safety_json, undefined),
      sources: parseJson(row.sources_json, []),
      createdAt: row.created_at,
    }));
  }

  function getMemories(userId, limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 50);
    return statements.listMemories.all(userId, safeLimit);
  }

  return {
    getState(userId) {
      const conversation = getOrCreateConversation(userId);
      const summary = statements.findSummary.get(conversation.id);
      return {
        profile: getOrCreateProfile(userId),
        messages: getMessages(userId),
        memories: getMemories(userId),
        hasSummary: Boolean(summary?.summary),
      };
    },

    getProfile(userId) {
      return getOrCreateProfile(userId);
    },

    updateProfile(userId, input) {
      getOrCreateProfile(userId);
      const profile = sanitizeProfile(input);
      statements.updateProfile.run(
        profile.name,
        profile.coatColor,
        profile.image,
        new Date().toISOString(),
        userId
      );
      return getOrCreateProfile(userId);
    },

    addMessage(userId, message) {
      const conversation = getOrCreateConversation(userId);
      const role = message.role === "assistant" ? "assistant" : "user";
      const content = String(message.content || "").trim().slice(0, 12_000);
      if (!content) throw new Error("消息不能为空");
      const now = new Date().toISOString();
      const result = statements.insertMessage.run(
        conversation.id,
        role,
        content,
        message.safety ? JSON.stringify(message.safety) : null,
        Array.isArray(message.sources) ? JSON.stringify(message.sources) : null,
        now
      );
      statements.touchConversation.run(now, conversation.id);
      return Number(result.lastInsertRowid);
    },

    getMessagesForModel(userId, limit = 30) {
      return getMessages(userId, limit).map(({ role, content }) => ({ role, content }));
    },

    getContext(userId, recentLimit = 16) {
      const conversation = getOrCreateConversation(userId);
      const summary = statements.findSummary.get(conversation.id);
      return {
        summary: String(summary?.summary || ""),
        memories: getMemories(userId).map((item) => item.content),
        messages: getMessages(userId, recentLimit).map(({ role, content }) => ({
          role,
          content,
        })),
      };
    },

    getSummaryBatch(userId, options = {}) {
      const conversation = getOrCreateConversation(userId);
      const summary = statements.findSummary.get(conversation.id);
      const keepRecent = Math.min(Math.max(Number(options.keepRecent) || 12, 4), 30);
      const minUnsummarized = Math.max(Number(options.minUnsummarized) || 24, keepRecent + 2);
      const rows = statements.messagesAfterSummary.all(
        conversation.id,
        Number(summary?.summarized_through_message_id || 0)
      );
      if (rows.length < minUnsummarized) return null;
      const batch = rows.slice(0, -keepRecent).slice(0, 30);
      if (batch.length === 0) return null;
      return {
        previousSummary: String(summary?.summary || ""),
        messages: batch,
        throughMessageId: batch[batch.length - 1].id,
      };
    },

    saveSummary(userId, summary, throughMessageId) {
      const conversation = getOrCreateConversation(userId);
      const cleanSummary = String(summary || "").trim().slice(0, 3000);
      statements.saveSummary.run(
        conversation.id,
        cleanSummary,
        Number(throughMessageId) || 0,
        new Date().toISOString()
      );
    },

    addMemory(userId, content) {
      const cleanContent = String(content || "").replace(/[\r\n]+/g, " ").trim().slice(0, 500);
      if (!cleanContent) throw new Error("记忆内容不能为空");
      const existing = statements.findMemory.get(userId, cleanContent);
      if (existing) return { id: existing.id, content: cleanContent, duplicate: true };
      const now = new Date().toISOString();
      const result = statements.insertMemory.run(userId, cleanContent, now, now);
      return { id: Number(result.lastInsertRowid), content: cleanContent, duplicate: false };
    },

    getMemories,

    deleteMemory(userId, memoryId) {
      return Number(statements.deleteMemory.run(Number(memoryId), userId).changes);
    },

    clearLongTermContext(userId) {
      const conversation = getOrCreateConversation(userId);
      const latest = statements.latestMessage.get(conversation.id);
      statements.deleteMemories.run(userId);
      statements.saveSummary.run(
        conversation.id,
        "",
        Number(latest?.id || 0),
        new Date().toISOString()
      );
    },

    clearMessages(userId) {
      const conversation = getOrCreateConversation(userId);
      const changes = Number(statements.deleteMessages.run(conversation.id).changes);
      statements.deleteSummary.run(conversation.id);
      return changes;
    },

    close() {
      db.close();
    },
  };
}

module.exports = { DEFAULT_AGENT, createAgentStore, sanitizeProfile };
