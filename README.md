# Tinglebot 2.0 - Railway Deployment Guide

This project consists of two main services that need to be deployed separately on Railway:

1. **Bot Service** (`/bot`) - Discord bot application
2. **Dashboard Service** (`/dashboard`) - Web dashboard application

## 🚂 Railway Deployment Setup

### Prerequisites

- Railway account
- MongoDB database (Railway MongoDB plugin or external)
- Discord Bot Token
- All required environment variables (see below)

### Service Configuration

#### 1. Bot Service

**Service Settings:**
- **Root Directory:** `/bot`
- **Watch Paths:** `bot/**` (IMPORTANT: Only watch bot directory to prevent deploying when dashboard changes)
- **Start Command:** `npm start`
- **Healthcheck Path:** `/health`
- **Port:** Automatically assigned by Railway (uses `PORT` env var)

**Railway Configuration File:** `bot/railway.json`

#### 2. Dashboard Service

**Service Settings:**
- **Root Directory:** `/dashboard`
- **Watch Paths:** `dashboard/**` (IMPORTANT: Only watch dashboard directory to prevent deploying when bot changes)
- **Start Command:** `npm start`
- **Healthcheck Path:** `/health` (if implemented) or root `/`
- **Port:** Automatically assigned by Railway (uses `PORT` env var)

**Railway Configuration File:** `dashboard/railway.json`

### Environment Variables

Both services require environment variables to be set in Railway. Add these in the Railway dashboard for each service:

#### Bot Service Environment Variables

```env
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_client_id
GUILD_ID=your_discord_guild_id

# Database Configuration
MONGODB_URI=your_mongodb_connection_string
TINGLEBOT_DB_URI=your_tinglebot_database_uri
INVENTORIES_DB_URI=your_inventories_database_uri
VENDING_DB_URI=your_vending_database_uri

# Port (Railway will set this automatically, but you can override)
PORT=5001

# Optional: Other service URLs
DASHBOARD_URL=your_dashboard_url
```

#### Dashboard Service Environment Variables

```env
# Server Configuration
PORT=5001
NODE_ENV=production

# Database Configuration
MONGODB_URI=your_mongodb_connection_string
TINGLEBOT_DB_URI=your_tinglebot_database_uri
INVENTORIES_DB_URI=your_inventories_database_uri
VENDING_DB_URI=your_vending_database_uri

# Session Configuration
SESSION_SECRET=your_random_session_secret

# Google Cloud Storage (if used)
GOOGLE_CLOUD_PROJECT_ID=your_project_id
GOOGLE_CLOUD_KEYFILE=your_keyfile_json

# Discord OAuth (if used)
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_REDIRECT_URI=your_redirect_uri

# Other service URLs
BOT_URL=your_bot_url
```

### Deployment Steps

1. **Create Two Services in Railway:**
   - Create a new service for the Bot
   - Create a new service for the Dashboard

2. **Connect Repository:**
   - Connect your GitHub repository to both services
   - Railway will automatically detect the `railway.json` files

3. **Configure Service Settings:**
   - **Bot Service:**
     - Set Root Directory to `/bot`
     - Set Watch Paths to `bot/**` (CRITICAL: This prevents bot from deploying when only dashboard files change)
     - Set Healthcheck Path to `/health`
   - **Dashboard Service:**
     - Set Root Directory to `/dashboard`
     - Set Watch Paths to `dashboard/**` (CRITICAL: This prevents dashboard from deploying when only bot files change)
     - Set Healthcheck Path to `/` (or `/health` if implemented)

4. **Set Environment Variables:**
   - Add all required environment variables for each service
   - Use Railway's environment variable management or `.env` files

5. **Deploy:**
   - Railway will automatically build and deploy when you push to your connected branch
   - Monitor the deployment logs for any issues

### Health Checks

- **Bot Service:** Responds to `/health` endpoint with memory stats
- **Dashboard Service:** Responds to root `/` endpoint

### Monitoring

Both services include:
- Memory monitoring
- Error tracking
- Graceful shutdown handling
- Health check endpoints

### Troubleshooting

#### Bot Service Issues

- **Bot not starting:** Check `DISCORD_TOKEN` is set correctly
- **Database connection errors:** Verify MongoDB connection strings
- **Health check failing:** Check memory usage (service restarts if > 1GB)

#### Dashboard Service Issues

- **Server not starting:** Check `PORT` environment variable
- **Database connection errors:** Verify MongoDB connection strings
- **Session issues:** Ensure `SESSION_SECRET` is set

### Local Development

For local development, use the root-level scripts:

```bash
# Run both services
npm run dev

# Run bot only
npm run dev:bot

# Run dashboard only
npm run dev:dashboard

# Deploy commands (bot)
npm run deploy:commands
```

### Project Structure

```
Tinglebot 2.0/
├── bot/                    # Discord bot service
│   ├── commands/          # Bot commands
│   ├── handlers/          # Event handlers
│   ├── models/            # Database models
│   ├── modules/           # Bot modules
│   ├── index.js           # Bot entry point
│   ├── package.json       # Bot dependencies
│   └── railway.json       # Railway config
├── dashboard/             # Web dashboard service
│   ├── models/           # Database models
│   ├── routes/           # API routes
│   ├── public/           # Static files
│   ├── server.js         # Dashboard entry point
│   ├── package.json      # Dashboard dependencies
│   └── railway.json      # Railway config
├── package.json          # Root package.json (dev scripts)
└── README.md            # This file
```

### Notes

- Both services use the same MongoDB databases but may have different connection requirements
- The bot service includes a health check endpoint that monitors memory usage
- Both services support graceful shutdown on SIGTERM/SIGINT
- Railway automatically handles port assignment via the `PORT` environment variable
