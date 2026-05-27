/**
 * Sijang - AI Service (Groq primary, Gemini fallback)
 */

const { GoogleGenerativeAI } = require('@google/generative-ai')
const axios = require('axios')

const GROQ_API_KEY = process.env.GROQ_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null

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

Keep responses concise unless the user asks for detail. Be real, be helpful, be ${BOT_NAME}.`

// Groq chat (primary - free and fast)
async function chatWithGroq(messages, userMessage) {
  const groqMessages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.filter(m => m.content?.trim()).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    })),
    { role: 'user', content: userMessage }
  ]
  
  const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: 'llama-3.1-8b-instant',
    messages: groqMessages,
    max_tokens: 1024,
    temperature: 0.7
  }, {
    headers: {
      'Authorization': `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    }
  })
  
  return response.data.choices[0].message.content
}

// Gemini chat (fallback)
async function chatWithGemini(messages, userMessage) {
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    systemInstruction: SYSTEM_PROMPT
  })
  
  const history = messages
    .filter(m => m.content && m.content.trim())
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))
  
  if (history.length === 0) {
    const result = await model.generateContent(userMessage)
    return result.response.text()
  }
  
  const chat = model.startChat({ history })
  const result = await chat.sendMessage(userMessage)
  return result.response.text()
}

// Main chat function - tries Groq first, falls back to Gemini
async function chat(messages, userMessage) {
  // Try Groq first (free, fast, generous limits)
  if (GROQ_API_KEY) {
    try {
      return await chatWithGroq(messages, userMessage)
    } catch (error) {
      console.error('Groq error:', error.response?.data || error.message)
      // Fall through to Gemini
    }
  }
  
  // Try Gemini as fallback
  if (genAI) {
    try {
      return await chatWithGemini(messages, userMessage)
    } catch (error) {
      console.error('Gemini error:', error.message)
      throw error
    }
  }
  
  throw new Error('No AI provider configured. Set GROQ_API_KEY or GEMINI_API_KEY.')
}

// Image analysis (Gemini only for now)
async function chatWithImage(messages, userMessage, imageBuffer, mimeType = 'image/jpeg') {
  if (!genAI) {
    throw new Error('Image analysis requires Gemini API key')
  }
  
  try {
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.0-flash',
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
