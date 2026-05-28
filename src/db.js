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
  
  // Long-term memory / facts learned about user
  db.run(`
    CREATE TABLE IF NOT EXISTS long_term_memory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      fact TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      source TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)
  
  // User preferences
  db.run(`
    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      pref_key TEXT NOT NULL,
      pref_value TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(telegram_id, pref_key)
    )
  `)
  
  // Conversation summaries (for context across sessions)
  db.run(`
    CREATE TABLE IF NOT EXISTS conversation_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      summary TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
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

// ========== LONG-TERM MEMORY ==========

// Categories: personal, preferences, facts, context, relationships
function learnFact(telegramId, category, fact, source = 'conversation') {
  // Check for similar existing fact
  const existing = get(
    `SELECT id, fact FROM long_term_memory 
     WHERE telegram_id = ? AND category = ? AND fact LIKE ?`,
    [telegramId, category, `%${fact.slice(0, 20)}%`]
  )
  
  if (existing) {
    // Update existing fact
    run(
      `UPDATE long_term_memory 
       SET fact = ?, updated_at = CURRENT_TIMESTAMP, confidence = MIN(confidence + 0.1, 1.0)
       WHERE id = ?`,
      [fact, existing.id]
    )
    return { updated: true, id: existing.id }
  } else {
    // Insert new fact
    run(
      `INSERT INTO long_term_memory (telegram_id, category, fact, source) 
       VALUES (?, ?, ?, ?)`,
      [telegramId, category, fact, source]
    )
    return { updated: false, id: null }
  }
}

function getFactsByCategory(telegramId, category) {
  return all(
    `SELECT * FROM long_term_memory 
     WHERE telegram_id = ? AND category = ? 
     ORDER BY confidence DESC, updated_at DESC`,
    [telegramId, category]
  )
}

function getAllFacts(telegramId) {
  return all(
    `SELECT * FROM long_term_memory 
     WHERE telegram_id = ? 
     ORDER BY category, confidence DESC`,
    [telegramId]
  )
}

function searchFacts(telegramId, query) {
  return all(
    `SELECT * FROM long_term_memory 
     WHERE telegram_id = ? AND fact LIKE ? 
     ORDER BY confidence DESC`,
    [telegramId, `%${query}%`]
  )
}

function deleteFact(id, telegramId) {
  run('DELETE FROM long_term_memory WHERE id = ? AND telegram_id = ?', [id, telegramId])
}

// ========== PREFERENCES ==========

function setPreference(telegramId, key, value) {
  const existing = get(
    'SELECT id FROM preferences WHERE telegram_id = ? AND pref_key = ?',
    [telegramId, key]
  )
  if (existing) {
    run('UPDATE preferences SET pref_value = ? WHERE id = ?', [value, existing.id])
  } else {
    run('INSERT INTO preferences (telegram_id, pref_key, pref_value) VALUES (?, ?, ?)',
      [telegramId, key, value])
  }
}

function getPreference(telegramId, key) {
  const row = get(
    'SELECT pref_value FROM preferences WHERE telegram_id = ? AND pref_key = ?',
    [telegramId, key]
  )
  return row?.pref_value
}

function getAllPreferences(telegramId) {
  return all('SELECT pref_key, pref_value FROM preferences WHERE telegram_id = ?', [telegramId])
}

// ========== CONVERSATION SUMMARIES ==========

function saveConversationSummary(telegramId, summary, messageCount) {
  run(
    'INSERT INTO conversation_summaries (telegram_id, summary, message_count) VALUES (?, ?, ?)',
    [telegramId, summary, messageCount]
  )
}

function getRecentSummaries(telegramId, limit = 5) {
  return all(
    `SELECT * FROM conversation_summaries 
     WHERE telegram_id = ? 
     ORDER BY created_at DESC LIMIT ?`,
    [telegramId, limit]
  )
}

// ========== CONTEXT BUILDER ==========

// Build a context string with everything we know about the user
function buildUserContext(telegramId) {
  const user = get('SELECT * FROM users WHERE telegram_id = ?', [telegramId])
  const facts = getAllFacts(telegramId)
  const prefs = getAllPreferences(telegramId)
  const summaries = getRecentSummaries(telegramId, 3)
  const memories = getAllMemories(telegramId)
  
  let context = ''
  
  // User basics
  if (user) {
    context += `User: ${user.first_name || user.username || 'Unknown'}\n`
  }
  
  // Facts by category
  if (facts.length > 0) {
    const byCategory = {}
    facts.forEach(f => {
      if (!byCategory[f.category]) byCategory[f.category] = []
      byCategory[f.category].push(f.fact)
    })
    
    context += '\nThings I know about this user:\n'
    for (const [cat, factList] of Object.entries(byCategory)) {
      context += `[${cat}]: ${factList.join('; ')}\n`
    }
  }
  
  // Preferences
  if (prefs.length > 0) {
    context += '\nUser preferences:\n'
    prefs.forEach(p => {
      context += `- ${p.pref_key}: ${p.pref_value}\n`
    })
  }
  
  // Explicit memories
  if (memories.length > 0) {
    context += '\nUser-saved memories:\n'
    memories.forEach(m => {
      context += `- ${m.key}: ${m.value}\n`
    })
  }
  
  // Recent conversation summaries
  if (summaries.length > 0) {
    context += '\nRecent conversation summaries:\n'
    summaries.forEach(s => {
      context += `- ${s.summary}\n`
    })
  }
  
  return context.trim()
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
  deleteReminder,
  // Long-term memory
  learnFact,
  getFactsByCategory,
  getAllFacts,
  searchFacts,
  deleteFact,
  // Preferences
  setPreference,
  getPreference,
  getAllPreferences,
  // Conversation summaries
  saveConversationSummary,
  getRecentSummaries,
  // Context builder
  buildUserContext
}
