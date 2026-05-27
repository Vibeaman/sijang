/**
 * Sijang - Gemini AI Service
 */

const { GoogleGenerativeAI } = require('@google/generative-ai')

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

const BOT_NAME = process.env.BOT_NAME || 'Sijang'
const BOT_PERSONALITY = process.env.BOT_PERSONALITY || 'adaptable, helpful, friendly'

const SYSTEM_PROMPT = `You are ${BOT_NAME}, an AI assistant on Telegram.

Your personality: ${BOT_PERSONALITY}

Key traits:
- Adapt your tone to match the user (casual if they're casual, formal if they're formal)
- Be helpful and direct - don't be overly verbose
- Use emojis naturally but don't overdo it
- Remember context from the conversation
- If you don't know something, say so honestly
- You can help with: general questions, coding, crypto prices, web searches, reminders, and more

Special commands the user can use:
- /start - Start/restart conversation
- /clear - Clear conversation history
- /remember [key] [value] - Save something to memory
- /recall [key] - Recall something from memory
- /forget [key] - Delete from memory
- /remind [time] [message] - Set a reminder
- /reminders - List pending reminders
- /crypto [symbol] - Get crypto price
- /help - Show available commands

When users ask about crypto prices, times, or things that need real-time data, let them know you'll check it for them.

Keep responses concise unless the user asks for detail. Be real, be helpful, be ${BOT_NAME}.`

async function chat(messages, userMessage) {
  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT
    })
    
    // Build chat history - filter out empty messages
    const history = messages
      .filter(m => m.content && m.content.trim())
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }))
    
    // If no history, just generate content directly
    if (history.length === 0) {
      const result = await model.generateContent(userMessage)
      return result.response.text()
    }
    
    const chat = model.startChat({ history })
    const result = await chat.sendMessage(userMessage)
    const response = result.response.text()
    
    return response
  } catch (error) {
    console.error('Gemini error:', error.message, error.stack)
    throw error
  }
}

async function chatWithImage(messages, userMessage, imageBuffer, mimeType = 'image/jpeg') {
  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT
    })
    
    const imagePart = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType
      }
    }
    
    const result = await model.generateContent([
      userMessage || 'What do you see in this image?',
      imagePart
    ])
    
    return result.response.text()
  } catch (error) {
    console.error('Gemini vision error:', error.message)
    throw error
  }
}

module.exports = { chat, chatWithImage }
