/**
 * Sijang - Database (SQLite)
 * Stores user data, conversation history, and memory
 */

const Database = require('better-sqlite3')
const path = require('path')

const db = new Database(path.join(__dirname, '..', 'sijang.db'))

// Initialize tables
function initDb() {
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      personality_mode TEXT DEFAULT 'adaptive',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Conversation history (for context)
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Long-term memory
    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(telegram_id, key)
    );

    -- Reminders
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      remind_at DATETIME NOT NULL,
      is_sent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_messages_telegram_id ON messages(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_memory_telegram_id ON memory(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);
  `)
  
  console.log('💾 Database initialized')
}

// User functions
function getOrCreateUser(telegramId, username, firstName) {
  let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId)
  
  if (!user) {
    db.prepare('INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)')
      .run(telegramId, username, firstName)
    user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId)
    console.log(`✨ New user: ${firstName || username} (${telegramId})`)
  } else {
    db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP, username = ?, first_name = ? WHERE telegram_id = ?')
      .run(username, firstName, telegramId)
  }
  
  return user
}

// Message history functions
function addMessage(telegramId, role, content) {
  db.prepare('INSERT INTO messages (telegram_id, role, content) VALUES (?, ?, ?)')
    .run(telegramId, role, content)
}

function getRecentMessages(telegramId, limit = 20) {
  return db.prepare(`
    SELECT role, content FROM messages 
    WHERE telegram_id = ? 
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(telegramId, limit).reverse()
}

function clearHistory(telegramId) {
  db.prepare('DELETE FROM messages WHERE telegram_id = ?').run(telegramId)
}

// Memory functions
function remember(telegramId, key, value) {
  db.prepare(`
    INSERT INTO memory (telegram_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(telegram_id, key) DO UPDATE SET value = ?, created_at = CURRENT_TIMESTAMP
  `).run(telegramId, key, value, value)
}

function recall(telegramId, key) {
  const row = db.prepare('SELECT value FROM memory WHERE telegram_id = ? AND key = ?').get(telegramId, key)
  return row?.value
}

function getAllMemories(telegramId) {
  return db.prepare('SELECT key, value FROM memory WHERE telegram_id = ?').all(telegramId)
}

function forget(telegramId, key) {
  db.prepare('DELETE FROM memory WHERE telegram_id = ? AND key = ?').run(telegramId, key)
}

// Reminder functions
function addReminder(telegramId, message, remindAt) {
  const result = db.prepare('INSERT INTO reminders (telegram_id, message, remind_at) VALUES (?, ?, ?)')
    .run(telegramId, message, remindAt)
  return result.lastInsertRowid
}

function getDueReminders() {
  return db.prepare(`
    SELECT * FROM reminders 
    WHERE is_sent = 0 AND datetime(remind_at) <= datetime('now')
  `).all()
}

function markReminderSent(id) {
  db.prepare('UPDATE reminders SET is_sent = 1 WHERE id = ?').run(id)
}

function getUserReminders(telegramId) {
  return db.prepare(`
    SELECT * FROM reminders 
    WHERE telegram_id = ? AND is_sent = 0 
    ORDER BY remind_at ASC
  `).all(telegramId)
}

function deleteReminder(id, telegramId) {
  db.prepare('DELETE FROM reminders WHERE id = ? AND telegram_id = ?').run(id, telegramId)
}

module.exports = {
  db,
  initDb,
  getOrCreateUser,
  addMessage,
  getRecentMessages,
  clearHistory,
  remember,
  recall,
  getAllMemories,
  forget,
  addReminder,
  getDueReminders,
  markReminderSent,
  getUserReminders,
  deleteReminder
}
