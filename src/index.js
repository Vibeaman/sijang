/**
 * Sijang - Adaptable AI Telegram Bot
 * Powered by Google Gemini
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') })
const TelegramBot = require('node-telegram-bot-api')
const axios = require('axios')
const { 
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
} = require('./db')
const { chat, chatWithImage } = require('./services/gemini')
const { getPrice, formatPrice, formatChange, formatMarketCap, getTrending } = require('./services/crypto')
const { search, getDefinition } = require('./services/search')
const github = require('./services/github')

const BOT_NAME = process.env.BOT_NAME || 'Sijang'
const OWNER_ID = process.env.OWNER_TELEGRAM_ID ? parseInt(process.env.OWNER_TELEGRAM_ID) : null

// Validate env
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN not set')
  process.exit(1)
}
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not set')
  process.exit(1)
}

// Create bot
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })
console.log(`🤖 ${BOT_NAME} starting...`)

// Initialize
initDb()

// Parse time strings like "5m", "2h", "1d", "tomorrow 9am"
function parseTime(timeStr) {
  const now = new Date()
  
  // Simple patterns: 5m, 2h, 1d
  const match = timeStr.match(/^(\d+)(m|min|h|hr|hour|d|day)s?$/i)
  if (match) {
    const num = parseInt(match[1])
    const unit = match[2].toLowerCase()
    
    if (unit.startsWith('m')) {
      return new Date(now.getTime() + num * 60 * 1000)
    } else if (unit.startsWith('h')) {
      return new Date(now.getTime() + num * 60 * 60 * 1000)
    } else if (unit.startsWith('d')) {
      return new Date(now.getTime() + num * 24 * 60 * 60 * 1000)
    }
  }
  
  // "tomorrow"
  if (timeStr.toLowerCase().includes('tomorrow')) {
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0) // Default to 9am
    return tomorrow
  }
  
  // Try parsing as date
  const parsed = new Date(timeStr)
  if (!isNaN(parsed.getTime()) && parsed > now) {
    return parsed
  }
  
  return null
}

// /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const username = msg.from.username
  const firstName = msg.from.first_name
  
  getOrCreateUser(userId, username, firstName)
  clearHistory(userId)
  
  await bot.sendMessage(chatId, 
    `Hey ${firstName || 'there'}! 👋\n\n` +
    `I'm ${BOT_NAME}, your AI assistant. I can help you with:\n\n` +
    `💬 Chat about anything\n` +
    `🖼️ Analyze images (just send one!)\n` +
    `💰 Crypto prices (/crypto btc)\n` +
    `🔍 Web search (/search query)\n` +
    `⏰ Reminders (/remind 30m check email)\n` +
    `🧠 Memory (/remember, /recall)\n\n` +
    `Just talk to me naturally or use /help for commands!`
  )
})

// /help command
bot.onText(/\/help/, async (msg) => {
  await bot.sendMessage(msg.chat.id,
    `*${BOT_NAME} Commands* 📚\n\n` +
    `*Chat*\n` +
    `Just send me a message!\n` +
    `/clear - Clear conversation history\n\n` +
    `*Crypto*\n` +
    `/crypto [symbol] - Get price (e.g. /crypto eth)\n` +
    `/trending - Trending coins\n\n` +
    `*Search*\n` +
    `/search [query] - Search the web\n` +
    `/define [word] - Get definition\n\n` +
    `*Memory*\n` +
    `/remember [key] [value] - Save something\n` +
    `/recall [key] - Retrieve it\n` +
    `/memories - List all memories\n` +
    `/forget [key] - Delete memory\n\n` +
    `*Reminders*\n` +
    `/remind [time] [message]\n` +
    `/reminders - List pending\n` +
    `/cancel [id] - Cancel reminder\n\n` +
    `*GitHub (Owner Only)*\n` +
    `/repos - List your repos\n` +
    `/newrepo [name] [desc] - Create repo\n` +
    `/files [repo] [path] - List files\n` +
    `/cat [repo] [file] - Read file\n` +
    `/push [repo] [file] - Push (reply to msg)\n` +
    `/gist [desc] - Create gist (reply to msg)`,
    { parse_mode: 'Markdown' }
  )
})

// /clear command
bot.onText(/\/clear/, async (msg) => {
  clearHistory(msg.from.id)
  await bot.sendMessage(msg.chat.id, '🧹 Conversation cleared! Fresh start.')
})

// /crypto command
bot.onText(/\/crypto(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const symbol = match[1]?.trim()
  
  if (!symbol) {
    await bot.sendMessage(chatId, 'Usage: /crypto [symbol]\nExample: /crypto btc')
    return
  }
  
  await bot.sendChatAction(chatId, 'typing')
  
  const data = await getPrice(symbol)
  if (!data) {
    await bot.sendMessage(chatId, `❌ Couldn't find price for "${symbol}"`)
    return
  }
  
  await bot.sendMessage(chatId,
    `*${data.symbol}* ${data.id}\n\n` +
    `💰 Price: ${formatPrice(data.price)}\n` +
    `📊 24h: ${formatChange(data.change24h)}\n` +
    `🏦 MCap: ${formatMarketCap(data.marketCap)}`,
    { parse_mode: 'Markdown' }
  )
})

// /trending command
bot.onText(/\/trending/, async (msg) => {
  const chatId = msg.chat.id
  await bot.sendChatAction(chatId, 'typing')
  
  const trending = await getTrending()
  if (trending.length === 0) {
    await bot.sendMessage(chatId, '❌ Could not fetch trending coins')
    return
  }
  
  let text = '🔥 *Trending Coins*\n\n'
  trending.forEach((coin, i) => {
    text += `${i + 1}. *${coin.name}* (${coin.symbol})\n`
  })
  
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
})

// /search command
bot.onText(/\/search(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const query = match[1]?.trim()
  
  if (!query) {
    await bot.sendMessage(chatId, 'Usage: /search [query]')
    return
  }
  
  await bot.sendChatAction(chatId, 'typing')
  
  const results = await search(query)
  if (results.length === 0) {
    await bot.sendMessage(chatId, `No results found for "${query}"`)
    return
  }
  
  let text = `🔍 *Search: ${query}*\n\n`
  results.slice(0, 3).forEach(r => {
    text += `*${r.title}*\n${r.snippet.slice(0, 200)}${r.snippet.length > 200 ? '...' : ''}\n\n`
  })
  
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
})

// /define command
bot.onText(/\/define(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const word = match[1]?.trim()
  
  if (!word) {
    await bot.sendMessage(chatId, 'Usage: /define [word]')
    return
  }
  
  await bot.sendChatAction(chatId, 'typing')
  
  const def = await getDefinition(word)
  if (!def) {
    await bot.sendMessage(chatId, `❌ No definition found for "${word}"`)
    return
  }
  
  let text = `📖 *${def.word}*`
  if (def.phonetic) text += ` ${def.phonetic}`
  text += '\n\n'
  
  def.meanings.forEach(m => {
    text += `_${m.partOfSpeech}_: ${m.definition}\n`
    if (m.example) text += `Example: "${m.example}"\n`
    text += '\n'
  })
  
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
})

// /remember command
bot.onText(/\/remember(?:\s+(\S+)(?:\s+(.+))?)?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const key = match[1]?.trim()
  const value = match[2]?.trim()
  
  if (!key || !value) {
    await bot.sendMessage(chatId, 'Usage: /remember [key] [value]\nExample: /remember birthday January 15')
    return
  }
  
  remember(userId, key, value)
  await bot.sendMessage(chatId, `🧠 Remembered: *${key}* = ${value}`, { parse_mode: 'Markdown' })
})

// /recall command
bot.onText(/\/recall(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const key = match[1]?.trim()
  
  if (!key) {
    await bot.sendMessage(chatId, 'Usage: /recall [key]')
    return
  }
  
  const value = recall(userId, key)
  if (value) {
    await bot.sendMessage(chatId, `🧠 *${key}*: ${value}`, { parse_mode: 'Markdown' })
  } else {
    await bot.sendMessage(chatId, `❓ I don't remember anything about "${key}"`)
  }
})

// /memories command
bot.onText(/\/memories/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  const memories = getAllMemories(userId)
  if (memories.length === 0) {
    await bot.sendMessage(chatId, '🧠 No memories yet. Use /remember to save things!')
    return
  }
  
  let text = '🧠 *Your Memories*\n\n'
  memories.forEach(m => {
    text += `• *${m.key}*: ${m.value}\n`
  })
  
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
})

// /forget command
bot.onText(/\/forget(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const key = match[1]?.trim()
  
  if (!key) {
    await bot.sendMessage(chatId, 'Usage: /forget [key]')
    return
  }
  
  forget(userId, key)
  await bot.sendMessage(chatId, `🗑️ Forgot "${key}"`)
})

// /remind command
bot.onText(/\/remind(?:\s+(\S+)(?:\s+(.+))?)?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const timeStr = match[1]
  const message = match[2]?.trim()
  
  if (!timeStr || !message) {
    await bot.sendMessage(chatId, 
      'Usage: /remind [time] [message]\n' +
      'Examples:\n' +
      '• /remind 30m check email\n' +
      '• /remind 2h call mom\n' +
      '• /remind 1d submit report'
    )
    return
  }
  
  const remindAt = parseTime(timeStr)
  if (!remindAt) {
    await bot.sendMessage(chatId, '❌ Could not parse time. Try: 30m, 2h, 1d, tomorrow')
    return
  }
  
  const id = addReminder(userId, message, remindAt.toISOString())
  await bot.sendMessage(chatId, 
    `⏰ Reminder set!\n\n` +
    `"${message}"\n` +
    `at ${remindAt.toLocaleString()}\n\n` +
    `ID: #${id}`
  )
})

// /reminders command
bot.onText(/\/reminders/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  const reminders = getUserReminders(userId)
  if (reminders.length === 0) {
    await bot.sendMessage(chatId, '⏰ No pending reminders.')
    return
  }
  
  let text = '⏰ *Your Reminders*\n\n'
  reminders.forEach(r => {
    const time = new Date(r.remind_at).toLocaleString()
    text += `#${r.id}: "${r.message}"\n   📅 ${time}\n\n`
  })
  text += '_Use /cancel [id] to remove_'
  
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
})

// /cancel command (for reminders)
bot.onText(/\/cancel(?:\s+#?(\d+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  const id = match[1]
  
  if (!id) {
    await bot.sendMessage(chatId, 'Usage: /cancel [id]')
    return
  }
  
  deleteReminder(parseInt(id), userId)
  await bot.sendMessage(chatId, `✅ Reminder #${id} cancelled`)
})

// Check reminders every minute
setInterval(async () => {
  const due = getDueReminders()
  for (const reminder of due) {
    try {
      await bot.sendMessage(reminder.telegram_id,
        `⏰ *Reminder!*\n\n${reminder.message}`,
        { parse_mode: 'Markdown' }
      )
      markReminderSent(reminder.id)
    } catch (e) {
      console.error('Reminder send error:', e.message)
      markReminderSent(reminder.id) // Mark anyway to avoid spam
    }
  }
}, 60 * 1000)

// ========== GITHUB COMMANDS ==========
// Owner-only check helper
function isOwner(userId) {
  if (!OWNER_ID) return true // If no owner set, allow all
  return userId === OWNER_ID
}

// /repos command - list repos
bot.onText(/\/repos/, async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (!isOwner(userId)) {
    await bot.sendMessage(chatId, '🔒 This command is owner-only.')
    return
  }
  
  if (!process.env.GITHUB_TOKEN) {
    await bot.sendMessage(chatId, '❌ GitHub not configured.')
    return
  }
  
  await bot.sendChatAction(chatId, 'typing')
  
  try {
    const repos = await github.listRepos(10)
    let text = `📦 *Your Repos* (${github.GITHUB_USERNAME})\n\n`
    repos.forEach(r => {
      const icon = r.private ? '🔒' : '📂'
      text += `${icon} *${r.name}*\n`
      if (r.description) text += `   ${r.description.slice(0, 50)}\n`
      text += `   ${r.url}\n\n`
    })
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', disable_web_page_preview: true })
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`)
  }
})

// /newrepo command - create repo
bot.onText(/\/newrepo(?:\s+(\S+)(?:\s+(.+))?)?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (!isOwner(userId)) {
    await bot.sendMessage(chatId, '🔒 This command is owner-only.')
    return
  }
  
  const name = match[1]?.trim()
  const description = match[2]?.trim() || ''
  
  if (!name) {
    await bot.sendMessage(chatId, 'Usage: /newrepo [name] [description]\nExample: /newrepo my-project A cool project')
    return
  }
  
  await bot.sendChatAction(chatId, 'typing')
  
  try {
    const repo = await github.createRepo(name, description)
    await bot.sendMessage(chatId,
      `✅ *Repo Created!*\n\n` +
      `📦 *${repo.name}*\n` +
      `🔗 ${repo.url}\n` +
      `📋 Clone: \`${repo.cloneUrl}\``,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    )
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`)
  }
})

// /gist command - create gist
bot.onText(/\/gist(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (!isOwner(userId)) {
    await bot.sendMessage(chatId, '🔒 This command is owner-only.')
    return
  }
  
  // Check if replying to a message
  if (!msg.reply_to_message?.text) {
    await bot.sendMessage(chatId,
      'Usage: Reply to a message with /gist [description]\n' +
      'The replied message will become the gist content.'
    )
    return
  }
  
  const description = match[1]?.trim() || 'Created by Sijang'
  const content = msg.reply_to_message.text
  
  await bot.sendChatAction(chatId, 'typing')
  
  try {
    const gist = await github.createGist(description, 'snippet.txt', content)
    await bot.sendMessage(chatId,
      `✅ *Gist Created!*\n\n` +
      `📝 ${description}\n` +
      `🔗 ${gist.url}`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    )
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`)
  }
})

// /push command - push file to repo
bot.onText(/\/push(?:\s+(\S+)(?:\s+(\S+))?)?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (!isOwner(userId)) {
    await bot.sendMessage(chatId, '🔒 This command is owner-only.')
    return
  }
  
  const repo = match[1]?.trim()
  const filepath = match[2]?.trim()
  
  if (!repo || !filepath || !msg.reply_to_message?.text) {
    await bot.sendMessage(chatId,
      'Usage: Reply to a message with /push [repo] [filepath]\n' +
      'Example: /push my-project src/hello.js\n\n' +
      'The replied message content will be pushed as the file.'
    )
    return
  }
  
  const content = msg.reply_to_message.text
  
  await bot.sendChatAction(chatId, 'typing')
  
  try {
    const result = await github.pushFile(repo, filepath, content, `Update ${filepath} via Sijang`)
    await bot.sendMessage(chatId,
      `✅ *Pushed!*\n\n` +
      `📄 \`${result.path}\`\n` +
      `📦 Repo: ${repo}\n` +
      `🔗 ${result.url}`,
      { parse_mode: 'Markdown', disable_web_page_preview: true }
    )
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`)
  }
})

// /files command - list files in repo
bot.onText(/\/files(?:\s+(\S+)(?:\s+(.+))?)?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (!isOwner(userId)) {
    await bot.sendMessage(chatId, '🔒 This command is owner-only.')
    return
  }
  
  const repo = match[1]?.trim()
  const path = match[2]?.trim() || ''
  
  if (!repo) {
    await bot.sendMessage(chatId, 'Usage: /files [repo] [path]\nExample: /files sijang src/')
    return
  }
  
  await bot.sendChatAction(chatId, 'typing')
  
  try {
    const files = await github.listFiles(repo, path)
    let text = `📁 *${repo}${path ? '/' + path : ''}*\n\n`
    files.forEach(f => {
      const icon = f.type === 'dir' ? '📁' : '📄'
      text += `${icon} ${f.name}\n`
    })
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' })
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`)
  }
})

// /cat command - read file from repo
bot.onText(/\/cat(?:\s+(\S+)(?:\s+(.+))?)?/, async (msg, match) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  if (!isOwner(userId)) {
    await bot.sendMessage(chatId, '🔒 This command is owner-only.')
    return
  }
  
  const repo = match[1]?.trim()
  const filepath = match[2]?.trim()
  
  if (!repo || !filepath) {
    await bot.sendMessage(chatId, 'Usage: /cat [repo] [filepath]\nExample: /cat sijang package.json')
    return
  }
  
  await bot.sendChatAction(chatId, 'typing')
  
  try {
    const file = await github.getFile(repo, filepath)
    if (!file) {
      await bot.sendMessage(chatId, '❌ File not found')
      return
    }
    
    // Truncate if too long
    let content = file.content
    if (content.length > 4000) {
      content = content.slice(0, 4000) + '\n\n... (truncated)'
    }
    
    await bot.sendMessage(chatId, `📄 *${filepath}*\n\n\`\`\`\n${content}\n\`\`\``, { parse_mode: 'Markdown' })
  } catch (error) {
    await bot.sendMessage(chatId, `❌ Error: ${error.message}`)
  }
})

// Handle photos
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id
  const userId = msg.from.id
  
  getOrCreateUser(userId, msg.from.username, msg.from.first_name)
  
  await bot.sendChatAction(chatId, 'typing')
  
  try {
    // Get largest photo
    const photo = msg.photo[msg.photo.length - 1]
    const file = await bot.getFile(photo.file_id)
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`
    
    // Download image
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' })
    const imageBuffer = Buffer.from(response.data)
    
    // Get caption or default prompt
    const prompt = msg.caption || 'What do you see in this image? Describe it.'
    
    // Get recent context
    const history = getRecentMessages(userId)
    
    // Analyze with Gemini
    const reply = await chatWithImage(history, prompt, imageBuffer)
    
    // Save to history
    addMessage(userId, 'user', `[Sent an image] ${prompt}`)
    addMessage(userId, 'assistant', reply)
    
    await bot.sendMessage(chatId, reply)
  } catch (error) {
    console.error('Photo handling error:', error.message)
    await bot.sendMessage(chatId, '❌ Sorry, I had trouble analyzing that image.')
  }
})

// Handle regular messages
bot.on('message', async (msg) => {
  // Skip commands and photos
  if (msg.text?.startsWith('/') || msg.photo) return
  if (!msg.text) return
  
  const chatId = msg.chat.id
  const userId = msg.from.id
  const text = msg.text
  
  getOrCreateUser(userId, msg.from.username, msg.from.first_name)
  
  await bot.sendChatAction(chatId, 'typing')
  
  try {
    // Get conversation history
    const history = getRecentMessages(userId)
    
    // Save user message
    addMessage(userId, 'user', text)
    
    // Get AI response
    const reply = await chat(history, text)
    
    // Save assistant response
    addMessage(userId, 'assistant', reply)
    
    await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' }).catch(() => {
      // If markdown fails, send as plain text
      bot.sendMessage(chatId, reply)
    })
  } catch (error) {
    console.error('Chat error:', error.message)
    await bot.sendMessage(chatId, '❌ Sorry, something went wrong. Try again?')
  }
})

console.log(`✅ ${BOT_NAME} is running!`)

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`👋 ${BOT_NAME} shutting down...`)
  bot.stopPolling()
  process.exit(0)
})
