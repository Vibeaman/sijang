# Sijang 🤖

Adaptable AI Telegram Bot powered by Google Gemini.

## Features

- 💬 **Natural Chat** - Context-aware conversations
- 🖼️ **Image Analysis** - Send photos for AI analysis
- 💰 **Crypto Prices** - Real-time prices from CoinGecko
- 🔍 **Web Search** - DuckDuckGo instant answers
- 🧠 **Memory** - Remember things across sessions
- ⏰ **Reminders** - Set timed reminders
- 🔄 **Adaptive** - Matches your conversation style

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Start/restart conversation |
| `/help` | Show all commands |
| `/clear` | Clear chat history |
| `/crypto [symbol]` | Get crypto price |
| `/trending` | Trending cryptocurrencies |
| `/search [query]` | Search the web |
| `/define [word]` | Get word definition |
| `/remember [key] [value]` | Save to memory |
| `/recall [key]` | Retrieve from memory |
| `/memories` | List all memories |
| `/forget [key]` | Delete from memory |
| `/remind [time] [msg]` | Set reminder |
| `/reminders` | List pending reminders |
| `/cancel [id]` | Cancel a reminder |

## Setup

1. Clone this repo
2. Copy `.env.example` to `.env`
3. Fill in your tokens:
   - `BOT_TOKEN` - From @BotFather on Telegram
   - `GEMINI_API_KEY` - From Google AI Studio
4. Install dependencies: `npm install`
5. Run: `npm start`

## Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)

1. Connect your GitHub repo
2. Add environment variables in Railway dashboard
3. Deploy!

## Tech Stack

- Node.js
- node-telegram-bot-api
- Google Gemini 1.5 Flash
- better-sqlite3
- CoinGecko API
- DuckDuckGo API

## License

MIT
