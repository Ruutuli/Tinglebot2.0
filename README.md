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

## Railway Deployment

This project is a **monorepo** that requires **two separate services** on Railway:
- **Bot Service**: Discord bot application
- **Dashboard Service**: Web dashboard application

Both services share code from the `shared/` directory and use the same MongoDB database.

### Service Overview

- **Bot Service** (`bot/` directory)
  - Entry point: `bot/index.js`
  - Configuration: `bot/railway.json`
  - Sleep enabled: Yes (can sleep when inactive)
  
- **Dashboard Service** (`dashboard/` directory)
  - Entry point: `dashboard/server.js`
  - Configuration: `dashboard/railway.json`
  - Sleep enabled: No (must stay awake for web requests)

### Step-by-Step Railway Setup

#### 1. Create Bot Service

1. Go to [Railway](https://railway.app) and create a new project
2. Click **"New Project"** → **"Deploy from GitHub repo"**
3. Select your repository
4. Railway will create the first service automatically
5. **Configure the Bot Service**:
   - Go to the service settings
   - **Important**: Leave **Root Directory** empty (or set to `/`) - this ensures `package.json` at the root is available during build
   - Railway will automatically detect `bot/railway.json` from the repo root
   - The service will use the start command: `node bot/index.js` (from `bot/railway.json`)

#### 2. Create Dashboard Service

1. In the same Railway project, click **"New Service"** → **"GitHub Repo"**
2. Select the **same repository** as the Bot Service
3. **Configure the Dashboard Service**:
   - Go to the service settings
   - **Important**: Leave **Root Directory** empty (or set to `/`) - this ensures `package.json` at the root is available during build
   - Railway will automatically detect `dashboard/railway.json` from the repo root
   - The service will use the start command: `node dashboard/server.js` (from `dashboard/railway.json`)

#### 3. Configure Watch Paths (Recommended)

To prevent unnecessary rebuilds, configure watch paths for each service:

**Bot Service Watch Paths:**
- `/bot/**`
- `/shared/**`

**Dashboard Service Watch Paths:**
- `/dashboard/**`
- `/shared/**`

This ensures each service only rebuilds when its own code or shared code changes.

#### 4. Environment Variables

Configure environment variables for each service in Railway's dashboard:

**Bot Service Environment Variables:**
```env
# Required
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id
GUILD_ID=your_discord_guild_id
MONGODB_URI=your_mongodb_connection_string
MONGODB_TINGLEBOT_URI_PROD=your_mongodb_tinglebot_uri
MONGODB_INVENTORIES_URI_PROD=your_mongodb_inventories_uri
MONGODB_VENDING_URI_PROD=your_mongodb_vending_uri

# Optional
PORT=5001
NODE_ENV=production
RAILWAY_ENVIRONMENT=true

# Google Cloud (if using)
GCP_PROJECT_ID=your_gcp_project_id
GCP_BUCKET_NAME=your_bucket_name
GOOGLE_PROJECT_ID=your_google_project_id
GOOGLE_PRIVATE_KEY_ID=your_private_key_id
GOOGLE_PRIVATE_KEY=your_private_key
GOOGLE_CLIENT_EMAIL=your_client_email
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_X509_CERT_URL=your_cert_url

# Spreadsheet IDs (if using)
ITEMS_SPREADSHEET_ID=your_items_spreadsheet_id
QUEST_SPREADSHEET_ID=your_quest_spreadsheet_id
TABLE_SPREADSHEET_ID=your_table_spreadsheet_id

# Trello (if using)
TRELLO_API_KEY=your_trello_api_key
TRELLO_TOKEN=your_trello_token
TRELLO_BOARD_ID=your_trello_board_id
TRELLO_LIST_ID=your_trello_list_id
TRELLO_WISHLIST=your_trello_wishlist_id

# Discord Channels & Roles (configure as needed)
# See your .env file for all available options
```

**Dashboard Service Environment Variables:**
```env
# Required
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=https://yourdomain.com/auth/discord/callback
SESSION_SECRET=your_session_secret_key
MONGODB_URI=your_mongodb_connection_string
MONGODB_TINGLEBOT_URI_PROD=your_mongodb_tinglebot_uri
MONGODB_INVENTORIES_URI_PROD=your_mongodb_inventories_uri
MONGODB_VENDING_URI_PROD=your_mongodb_vending_uri

# Required for Dashboard
PORT=5001
NODE_ENV=production
DOMAIN=yourdomain.com
RAILWAY_ENVIRONMENT=true

# Google Cloud (if using)
GCP_PROJECT_ID=your_gcp_project_id
GCP_BUCKET_NAME=your_bucket_name
GOOGLE_PROJECT_ID=your_google_project_id
GOOGLE_PRIVATE_KEY_ID=your_private_key_id
GOOGLE_PRIVATE_KEY=your_private_key
GOOGLE_CLIENT_EMAIL=your_client_email
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_X509_CERT_URL=your_cert_url

# Spreadsheet IDs (if using)
ITEMS_SPREADSHEET_ID=your_items_spreadsheet_id
QUEST_SPREADSHEET_ID=your_quest_spreadsheet_id
TABLE_SPREADSHEET_ID=your_table_spreadsheet_id

# Optional
ALLOWED_ORIGINS=https://yourdomain.com
ADMIN_ROLE_ID=your_admin_role_id
```

**Note**: Both services can share the same MongoDB connection strings and Google Cloud credentials. The main differences are:
- Bot service needs `DISCORD_TOKEN` and `GUILD_ID`
- Dashboard service needs `DISCORD_CLIENT_SECRET`, `DISCORD_CALLBACK_URL`, `SESSION_SECRET`, and `DOMAIN`

#### 5. Deploy and Verify

1. After configuring both services, Railway will automatically deploy them
2. Check the deployment logs for each service to ensure they start successfully
3. The Bot Service should connect to Discord
4. The Dashboard Service should be accessible via the Railway-provided domain or your custom domain

### Railway Configuration Files

- `bot/railway.json` - Bot service configuration
- `dashboard/railway.json` - Dashboard service configuration

**Important**: When Root Directory is set to root (`/`), you may need to manually specify the config file path in Railway service settings:
- For Bot Service: In service settings → Config File, specify `bot/railway.json`
- For Dashboard Service: In service settings → Config File, specify `dashboard/railway.json`

Alternatively, Railway may auto-detect the correct config file based on the start command. If auto-detection doesn't work, manually link the config file as described above.

### Troubleshooting Railway Deployment

- **Service not starting?** Check the deployment logs in Railway dashboard
- **Build failing with "package.json not found"?** Ensure Root Directory is **empty** (root `/`), not set to `bot` or `dashboard`. The root `package.json` must be accessible during build.
- **Environment variables not working?** Verify they're set in the correct service's environment variables section
- **Both services rebuilding unnecessarily?** Configure Watch Paths as described above
- **Bot not connecting?** Check that `DISCORD_TOKEN` is set correctly in Bot Service
- **Dashboard OAuth not working?** Verify `DISCORD_CALLBACK_URL` matches your Railway domain

## Troubleshooting

- **Commands not deploying?** Check that `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID` are set in your `.env`
- **Auto-restart not working?** Make sure you're using `npm run dev` instead of `npm start`
- **Port already in use?** Change the `PORT` environment variable or stop other services using port 5001

