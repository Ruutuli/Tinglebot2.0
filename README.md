# Tinglebot 2.0

A Discord bot and web dashboard for managing a Zelda-inspired roleplay server.

## Features

- 🤖 Discord bot with slash commands
- 📊 Web dashboard for character and inventory management
- 🔄 Auto-restart on code changes (development mode)
- 🎮 Quest system, character management, and more

## Prerequisites

- Node.js (v16 or higher)
- npm
- MongoDB database
- Discord Bot Token
- Discord Application (for OAuth)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd "Tinglebot 2.0"
```

2. Install dependencies:
```bash
npm install
npm run install:dashboard
```

3. Create a `.env` file in the root directory with the required environment variables (see below).

## Environment Variables

Create a `.env` file in the root directory with the following variables:

### Required for Bot
```env
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id
GUILD_ID=your_discord_guild_id
MONGODB_URI=your_mongodb_connection_string
```

### Required for Dashboard
```env
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=your_oauth_callback_url
SESSION_SECRET=your_session_secret_key
MONGODB_URI=your_mongodb_connection_string
```

### Optional
```env
PORT=5001
NODE_ENV=development
DOMAIN=localhost
TRELLO_WISHLIST=your_trello_list_id
GCP_BUCKET_NAME=your_google_cloud_storage_bucket
ALLOWED_ORIGINS=http://localhost:5001,https://yourdomain.com
```

## Available Scripts

### Development Scripts (with Auto-Restart)

- **`npm run dev`** - Start both bot and dashboard with auto-restart
  - Watches for file changes in `bot/`, `dashboard/`, and `shared/` directories
  - Automatically restarts when code changes are detected

- **`npm run dev:bot`** - Start only the bot with auto-restart
  - Useful when you only need to work on bot code

- **`npm run dev:dashboard`** - Start only the dashboard with auto-restart
  - Useful when you only need to work on dashboard code

### Production Scripts

- **`npm start`** - Start the bot (production mode)
  - Runs the bot without file watching

### Utility Scripts

- **`npm run deploy:commands`** - Deploy Discord commands to your guild
  - Registers all slash commands from `bot/commands/` and `bot/embeds/`
  - Requires `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID` in your `.env`

- **`npm run install:dashboard`** - Install dashboard dependencies

## Development Workflow

1. **Start development mode:**
   ```bash
   npm run dev
   ```
   This will start both the bot and dashboard. Any changes you make to `.js` or `.json` files will automatically restart the affected service.

2. **Deploy commands after adding new commands:**
   ```bash
   npm run deploy:commands
   ```

3. **Work on individual services:**
   ```bash
   npm run dev:bot        # Only bot with auto-restart
   npm run dev:dashboard  # Only dashboard with auto-restart
   ```

## Project Structure

```
Tinglebot 2.0/
├── bot/                  # Discord bot code
│   ├── commands/         # Slash command handlers
│   ├── handlers/         # Event handlers
│   ├── modules/          # Bot modules
│   ├── scripts/          # Utility scripts (deploy-commands.js, etc.)
│   └── index.js          # Bot entry point
├── dashboard/            # Web dashboard
│   ├── routes/           # API routes
│   ├── public/           # Frontend files
│   └── server.js         # Dashboard server entry point
├── shared/               # Shared code between bot and dashboard
│   ├── models/           # Database models
│   ├── utils/             # Utility functions
│   └── services/          # Shared services
└── package.json          # Root package.json with scripts
```

## Auto-Restart Configuration

The project uses `nodemon` for automatic restarts during development. Configuration is in `nodemon.json`:

- **Watches:** `bot/`, `dashboard/`, and `shared/` directories
- **File extensions:** `.js` and `.json`
- **Ignores:** `node_modules/`, assets, images, and public files
- **Delay:** 1 second (prevents rapid restarts)

## Notes

- The bot and dashboard share the same MongoDB database
- Both services can run on the same port (5001) or different ports
- Auto-restart only works in development mode (`npm run dev`)
- Use `npm start` for production deployments

## Troubleshooting

- **Commands not deploying?** Check that `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID` are set in your `.env`
- **Auto-restart not working?** Make sure you're using `npm run dev` instead of `npm start`
- **Port already in use?** Change the `PORT` environment variable or stop other services using port 5001

