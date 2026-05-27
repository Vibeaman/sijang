/**
 * Sijang - Web Search Service (DuckDuckGo)
 */

const axios = require('axios')

async function search(query, limit = 5) {
  try {
    // Use DuckDuckGo instant answer API
    const response = await axios.get('https://api.duckduckgo.com/', {
      params: {
        q: query,
        format: 'json',
        no_html: 1,
        skip_disambig: 1
      }
    })
    
    const data = response.data
    const results = []
    
    // Abstract (main answer)
    if (data.Abstract) {
      results.push({
        title: data.Heading || 'Answer',
        snippet: data.Abstract,
        url: data.AbstractURL
      })
    }
    
    // Related topics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics.slice(0, limit - results.length)) {
        if (topic.Text) {
          results.push({
            title: topic.Text.split(' - ')[0] || 'Related',
            snippet: topic.Text,
            url: topic.FirstURL
          })
        }
      }
    }
    
    return results
  } catch (error) {
    console.error('Search error:', error.message)
    return []
  }
}

async function getDefinition(word) {
  try {
    const response = await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`)
    const data = response.data[0]
    
    if (!data) return null
    
    const meanings = data.meanings.slice(0, 2).map(m => ({
      partOfSpeech: m.partOfSpeech,
      definition: m.definitions[0]?.definition,
      example: m.definitions[0]?.example
    }))
    
    return {
      word: data.word,
      phonetic: data.phonetic,
      meanings
    }
  } catch (error) {
    return null
  }
}

module.exports = { search, getDefinition }
