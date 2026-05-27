/**
 * Sijang - Database (sql.js - no native bindings)
 * Stores user data, conversation history, and memory
 */

const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')

const DB_PATH = path.join(__dirname, '..', 'sijang.db')

let db = null

// Initialize database
async function initDb() {
  const SQL = await initSqlJs()
  
  // Try to load existing database
  try {
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH)
      db = new SQL.Database(buffer)
    } else {
      db = new SQL.Database()
    }
  } catch (e) {
    db = new SQL.Database()
  }
  
  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER UNIQUE NOT NULL,
      username TEXT,
      first_name TEXT,
      personality_mode TEXT DEFAULT 'adaptive',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  db.run(`
    CREATE TABLE IF NOT EXISTS memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(telegram_id, key)
    )
  `)
  
  db.run(`
    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      remind_at DATETIME NOT NULL,
      is_sent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  saveDb()
  console.log('💾 Database initialized')
}

// Save database to file
function saveDb() {
  if (!db) return
  try {
    const data = db.export()
    const buffer = Buffer.from(data)
    fs.writeFileSync(DB_PATH, buffer)
  } catch (e) {
    console.error('DB save error:', e.message)
  }
}

// Helper to run queries
function run(sql, params = []) {
  db.run(sql, params)
  saveDb()
}

function get(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    return row
  }
  stmt.free()
  return null
}

function all(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

// User functions
function getOrCreateUser(telegramId, username, firstName) {
  let user = get('SELECT * FROM users WHERE telegram_id = ?', [telegramId])
  
  if (!user) {
    run('INSERT INTO users (telegram_id, username, first_name) VALUES (?, ?, ?)',
      [telegramId, username, firstName])
    user = get('SELECT * FROM users WHERE telegram_id = ?', [telegramId])
    console.log(`✨ New user: ${firstName || username} (${telegramId})`)
  } else {
    run('UPDATE users SET last_seen = CURRENT_TIMESTAMP, username = ?, first_name = ? WHERE telegram_id = ?',
      [username, firstName, telegramId])
  }
  
  return user
}

// Message history functions
function addMessage(telegramId, role, content) {
  run('INSERT INTO messages (telegram_id, role, content) VALUES (?, ?, ?)',
    [telegramId, role, content])
}

function getRecentMessages(telegramId, limit = 20) {
  return all(
    `SELECT role, content FROM messages 
     WHERE telegram_id = ? 
     ORDER BY created_at DESC 
     LIMIT ?`,
    [telegramId, limit]
  ).reverse()
}

function clearHistory(telegramId) {
  run('DELETE FROM messages WHERE telegram_id = ?', [telegramId])
}

// Memory functions
function remember(telegramId, key, value) {
  // Try update first, then insert
  const existing = get('SELECT id FROM memory WHERE telegram_id = ? AND key = ?', [telegramId, key])
  if (existing) {
    run('UPDATE memory SET value = ?, created_at = CURRENT_TIMESTAMP WHERE telegram_id = ? AND key = ?',
      [value, telegramId, key])
  } else {
    run('INSERT INTO memory (telegram_id, key, value) VALUES (?, ?, ?)',
      [telegramId, key, value])
  }
}

function recall(telegramId, key) {
  const row = get('SELECT value FROM memory WHERE telegram_id = ? AND key = ?', [telegramId, key])
  return row?.value
}

function getAllMemories(telegramId) {
  return all('SELECT key, value FROM memory WHERE telegram_id = ?', [telegramId])
}

function forget(telegramId, key) {
  run('DELETE FROM memory WHERE telegram_id = ? AND key = ?', [telegramId, key])
}

// Reminder functions
function addReminder(telegramId, message, remindAt) {
  run('INSERT INTO reminders (telegram_id, message, remind_at) VALUES (?, ?, ?)',
    [telegramId, message, remindAt])
  const row = get('SELECT last_insert_rowid() as id')
  return row?.id
}

function getDueReminders() {
  return all(
    `SELECT * FROM reminders 
     WHERE is_sent = 0 AND datetime(remind_at) <= datetime('now')`
  )
}

function markReminderSent(id) {
  run('UPDATE reminders SET is_sent = 1 WHERE id = ?', [id])
}

function getUserReminders(telegramId) {
  return all(
    `SELECT * FROM reminders 
     WHERE telegram_id = ? AND is_sent = 0 
     ORDER BY remind_at ASC`,
    [telegramId]
  )
}

function deleteReminder(id, telegramId) {
  run('DELETE FROM reminders WHERE id = ? AND telegram_id = ?', [id, telegramId])
}

module.exports = {
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
