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

const BASE_SYSTEM_PROMPT = `You are ${BOT_NAME}, an AI assistant on Telegram.

Your personality: ${BOT_PERSONALITY}

Key traits:
- Adapt your tone to match the user (casual if they're casual, formal if they're formal)
- Be helpful and direct - don't be overly verbose
- Use emojis naturally but don't overdo it
- Remember context from the conversation
- If you don't know something, say so honestly
- You can help with: general questions, coding, crypto prices, web searches, reminders, and more

Keep responses concise unless the user asks for detail. Be real, be helpful, be ${BOT_NAME}.

IMPORTANT: When you learn new facts about the user (their name, job, interests, preferences, location, relationships, etc.), include a JSON block at the END of your response like this:
<LEARN>{"category": "personal", "fact": "User's name is John", "confidence": 0.9}</LEARN>

Categories: personal (name, age, job), preferences (likes, dislikes), facts (things they mentioned), relationships (people they know), context (current situation)

Only include <LEARN> when you genuinely learn something new and meaningful. Don't include it in every message.`

// Build system prompt with user context
function buildSystemPrompt(userContext = '') {
  let prompt = BASE_SYSTEM_PROMPT
  if (userContext) {
    prompt += `\n\n=== WHAT YOU KNOW ABOUT THIS USER ===\n${userContext}\n===`
  }
  return prompt
}

// Parse learned facts from response
function parseLearnedFacts(response) {
  const facts = []
  const learnRegex = /<LEARN>({.*?})<\/LEARN>/gs
  let match
  
  while ((match = learnRegex.exec(response)) !== null) {
    try {
      const parsed = JSON.parse(match[1])
      if (parsed.category && parsed.fact) {
        facts.push({
          category: parsed.category,
          fact: parsed.fact,
          confidence: parsed.confidence || 0.8
        })
      }
    } catch (e) {
      // Ignore invalid JSON
    }
  }
  
  // Clean the response - remove <LEARN> tags
  const cleanResponse = response.replace(/<LEARN>.*?<\/LEARN>/gs, '').trim()
  
  return { cleanResponse, facts }
}

// Groq chat (primary - free and fast)
async function chatWithGroq(messages, userMessage, userContext = '') {
  const systemPrompt = buildSystemPrompt(userContext)
  const groqMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.filter(m => m.content?.trim()).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    })),
    { role: 'user', content: userMessage }
  ]
  
  const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: 'llama-3.3-70b-versatile',
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
async function chatWithGemini(messages, userMessage, userContext = '') {
  const systemPrompt = buildSystemPrompt(userContext)
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.0-flash',
    systemInstruction: systemPrompt
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
// Returns { response, facts } where facts are things learned about the user
async function chat(messages, userMessage, userContext = '') {
  let rawResponse = ''
  
  // Try Groq first (free, fast, generous limits)
  if (GROQ_API_KEY) {
    try {
      rawResponse = await chatWithGroq(messages, userMessage, userContext)
    } catch (error) {
      console.error('Groq error:', error.response?.data || error.message)
      // Fall through to Gemini
    }
  }
  
  // Try Gemini as fallback
  if (!rawResponse && genAI) {
    try {
      rawResponse = await chatWithGemini(messages, userMessage, userContext)
    } catch (error) {
      console.error('Gemini error:', error.message)
      throw error
    }
  }
  
  if (!rawResponse) {
    throw new Error('No AI provider configured. Set GROQ_API_KEY or GEMINI_API_KEY.')
  }
  
  // Parse any learned facts from the response
  const { cleanResponse, facts } = parseLearnedFacts(rawResponse)
  
  return { response: cleanResponse, facts }
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

module.exports = { chat, chatWithImage, parseLearnedFacts }
