/**
 * Sijang - Crypto Price Service (CoinGecko)
 */

const axios = require('axios')

const COINGECKO_API = 'https://api.coingecko.com/api/v3'

// Common symbol to ID mapping
const SYMBOL_MAP = {
  'btc': 'bitcoin',
  'eth': 'ethereum',
  'bnb': 'binancecoin',
  'sol': 'solana',
  'xrp': 'ripple',
  'ada': 'cardano',
  'doge': 'dogecoin',
  'shib': 'shiba-inu',
  'avax': 'avalanche-2',
  'dot': 'polkadot',
  'matic': 'matic-network',
  'link': 'chainlink',
  'uni': 'uniswap',
  'atom': 'cosmos',
  'ltc': 'litecoin',
  'etc': 'ethereum-classic',
  'xlm': 'stellar',
  'near': 'near',
  'apt': 'aptos',
  'arb': 'arbitrum',
  'op': 'optimism',
  'sui': 'sui',
  'sei': 'sei-network',
  'inj': 'injective-protocol',
  'ton': 'the-open-network',
  'pepe': 'pepe',
  'wif': 'dogwifhat',
  'bonk': 'bonk'
}

async function getPrice(symbolOrId) {
  try {
    const id = SYMBOL_MAP[symbolOrId.toLowerCase()] || symbolOrId.toLowerCase()
    
    const response = await axios.get(`${COINGECKO_API}/simple/price`, {
      params: {
        ids: id,
        vs_currencies: 'usd',
        include_24hr_change: true,
        include_market_cap: true
      }
    })
    
    const data = response.data[id]
    if (!data) {
      return null
    }
    
    return {
      id,
      symbol: symbolOrId.toUpperCase(),
      price: data.usd,
      change24h: data.usd_24h_change,
      marketCap: data.usd_market_cap
    }
  } catch (error) {
    console.error('CoinGecko error:', error.message)
    return null
  }
}

async function getMultiplePrices(symbols) {
  try {
    const ids = symbols.map(s => SYMBOL_MAP[s.toLowerCase()] || s.toLowerCase()).join(',')
    
    const response = await axios.get(`${COINGECKO_API}/simple/price`, {
      params: {
        ids,
        vs_currencies: 'usd',
        include_24hr_change: true
      }
    })
    
    return response.data
  } catch (error) {
    console.error('CoinGecko error:', error.message)
    return {}
  }
}

async function getTrending() {
  try {
    const response = await axios.get(`${COINGECKO_API}/search/trending`)
    return response.data.coins.slice(0, 5).map(c => ({
      name: c.item.name,
      symbol: c.item.symbol,
      rank: c.item.market_cap_rank
    }))
  } catch (error) {
    console.error('CoinGecko trending error:', error.message)
    return []
  }
}

function formatPrice(price) {
  if (price >= 1) {
    return `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  } else if (price >= 0.01) {
    return `$${price.toFixed(4)}`
  } else {
    return `$${price.toFixed(8)}`
  }
}

function formatChange(change) {
  if (!change) return 'N/A'
  const sign = change >= 0 ? '+' : ''
  const emoji = change >= 0 ? '📈' : '📉'
  return `${emoji} ${sign}${change.toFixed(2)}%`
}

function formatMarketCap(mc) {
  if (!mc) return 'N/A'
  if (mc >= 1e12) return `$${(mc / 1e12).toFixed(2)}T`
  if (mc >= 1e9) return `$${(mc / 1e9).toFixed(2)}B`
  if (mc >= 1e6) return `$${(mc / 1e6).toFixed(2)}M`
  return `$${mc.toLocaleString()}`
}

module.exports = { 
  getPrice, 
  getMultiplePrices, 
  getTrending,
  formatPrice, 
  formatChange, 
  formatMarketCap 
}
