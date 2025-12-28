# Railway Deployment Guide

This guide explains how to deploy both the Tinglebot Discord bot and the Tinglebot Dashboard as separate services on Railway.

## Architecture Overview

<<<<<<< HEAD
- **Bot Service**: Deploys from `bot/` directory, runs `index.js`
=======
- **Bot Service**: Deploys from root directory, runs `index.js`
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d
- **Dashboard Service**: Deploys from `Tinglebot Dashboard/` directory, runs `server.js`

Both services share:
- The same `models/` directory (in root)
- The same `database/db.js` connection code (in root)
- The same `config/database.js` configuration
- The same MongoDB databases

## Railway Service Configuration

### Bot Service Setup

<<<<<<< HEAD
1. **Root Directory**: `bot/` (configure in Railway service settings)
2. **Start Command**: `npm run start` (runs `node index.js`)
3. **Build Command**: `npm install`
4. **Railway Config**: Uses `bot/railway.json`
=======
1. **Root Directory**: `/` (root of repository)
2. **Start Command**: `npm run start` (runs `node index.js`)
3. **Build Command**: `npm install`
4. **Railway Config**: Uses `railway.json` in root
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d

### Dashboard Service Setup

1. **Root Directory**: `Tinglebot Dashboard/` (configure in Railway service settings)
2. **Start Command**: `npm run start` (runs `node server.js`)
3. **Build Command**: `npm install`
4. **Railway Config**: Uses `Tinglebot Dashboard/railway.json`

<<<<<<< HEAD
**Important**: In Railway, you must set the **Root Directory** to:
- `bot/` for the bot service
- `Tinglebot Dashboard/` for the dashboard service
=======
**Important**: In Railway, you must set the **Root Directory** to `Tinglebot Dashboard` for the dashboard service.
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d

## Environment Variables

Both services need the same database environment variables. Set these in **both** Railway services:

### Required Environment Variables

```
# Database Configuration
MONGODB_TINGLEBOT_URI_PROD=mongodb+srv://...
MONGODB_INVENTORIES_URI_PROD=mongodb+srv://...
MONGODB_VENDING_URI_PROD=mongodb+srv://...
MONGODB_URI=mongodb+srv://...  # Fallback

# Bot Service Only
DISCORD_TOKEN=...
CLIENT_ID=...
GUILD_ID=...
PROD_GUILD_ID=...

# Dashboard Service Only
PORT=5001
RAILWAY_ENVIRONMENT=true
NODE_ENV=production
SESSION_SECRET=...
DOMAIN=tinglebot.xyz

# Google Cloud (Both Services)
GOOGLE_PROJECT_ID=...
GOOGLE_PRIVATE_KEY_ID=...
GOOGLE_PRIVATE_KEY=...
GOOGLE_CLIENT_EMAIL=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_X509_CERT_URL=...

# OAuth (Dashboard Service)
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
DISCORD_CALLBACK_URL=...

# Google Sheets (Both Services)
ITEMS_SPREADSHEET_ID=...
```

## Path Resolution

All relative paths are configured to work from each service's root:

<<<<<<< HEAD
### Bot Service (bot/ Directory)
- Models: `../models/` (goes up one level to root)
- Database: `../database/db.js` (goes up one level to root)
- Config: `../config/database.js` (goes up one level to root)
- Bot files: `./index.js`, `./commands/`, etc.
=======
### Bot Service (Root Directory)
- Models: `./models/` or `models/`
- Database: `./database/db.js`
- Config: `./config/database.js`
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d

### Dashboard Service (Tinglebot Dashboard/ Directory)
- Models: `../models/` (goes up one level to root)
- Database: `../database/db.js` (goes up one level to root)
- Config: `../config/database.js` (goes up one level to root)
- Dashboard files: `./server.js`, `./public/`, etc.

## Railway Setup Steps

### 1. Create Two Services in Railway

1. Go to your Railway project
2. Add a new service for the **Bot**
3. Add a new service for the **Dashboard**

### 2. Configure Bot Service

1. Connect to your GitHub repository
<<<<<<< HEAD
2. **Root Directory**: Set to `bot/` (critical!)
3. Railway will automatically detect `bot/railway.json`
4. Set environment variables (see above)

**To set Root Directory in Railway:**
- Go to service settings
- Scroll to "Root Directory"
- Enter: `bot/`

=======
2. **Root Directory**: Leave empty (defaults to root `/`)
3. Railway will automatically detect `railway.json` in root
4. Set environment variables (see above)

>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d
### 3. Configure Dashboard Service

1. Connect to the same GitHub repository
2. **Root Directory**: Set to `Tinglebot Dashboard` (critical!)
3. Railway will automatically detect `Tinglebot Dashboard/railway.json`
4. Set environment variables (see above)

**To set Root Directory in Railway:**
- Go to service settings
- Scroll to "Root Directory"
<<<<<<< HEAD
- Enter: `Tinglebot Dashboard` (for dashboard service)
=======
- Enter: `Tinglebot Dashboard`
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d

### 4. Health Checks

- **Bot Service**: No health check endpoint (Discord bot doesn't need one)
- **Dashboard Service**: Health check at `/api/health` (configured in `railway.json`)

## Deployment Verification

### Bot Service
- Check Railway logs for: `💾 DATABASE INITIALIZATION`
- Bot should connect to Discord and show as online

### Dashboard Service
- Check Railway logs for: `TINGLEBOT DASHBOARD Initializing server components...`
- Visit the deployed URL (Railway provides this)
- Visit `/api/health` endpoint - should return `{ status: 'OK', ... }`

## Common Issues

<<<<<<< HEAD
### Issue: Bot or Dashboard can't find models
=======
### Issue: Dashboard can't find models
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d

**Symptom**: `Error: Cannot find module '../models/...'`

**Solution**: 
<<<<<<< HEAD
- Verify Root Directory is set correctly:
  - Bot service: `bot/`
  - Dashboard service: `Tinglebot Dashboard/`
=======
- Verify Root Directory is set to `Tinglebot Dashboard` (not `/`)
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d
- Check that models exist in root `models/` directory

### Issue: Database connection fails

**Symptom**: `Database configuration is incomplete`

**Solution**:
- Verify `MONGODB_TINGLEBOT_URI_PROD`, `MONGODB_INVENTORIES_URI_PROD`, and `MONGODB_VENDING_URI_PROD` are set in Railway environment variables
- Check that variables are set in **both** services

### Issue: Dashboard health check fails

**Symptom**: Railway reports unhealthy service

**Solution**:
- Verify `/api/health` endpoint is accessible
- Check that `PORT` environment variable is set (Railway sets this automatically)
- Verify `NODE_ENV=production` or `RAILWAY_ENVIRONMENT=true` is set

## File Structure Reference

```
Tinglebot 2.0/
<<<<<<< HEAD
├── bot/                        # Bot code
│   ├── index.js                # Bot entry point
│   ├── railway.json            # Bot Railway config
│   ├── package.json            # Bot dependencies
│   ├── commands/
│   ├── handlers/
│   └── ...
├── Tinglebot Dashboard/        # Dashboard code
│   ├── server.js               # Dashboard entry point
│   ├── railway.json            # Dashboard Railway config
│   ├── package.json            # Dashboard dependencies
│   └── ...
├── models/                     # Shared models (used by both)
├── database/
│   └── db.js                   # Shared database connection
└── config/
    └── database.js             # Shared database config
=======
├── index.js                    # Bot entry point
├── railway.json                # Bot Railway config
├── package.json                # Bot dependencies
├── models/                     # Shared models (used by both)
├── database/
│   └── db.js                   # Shared database connection
├── config/
│   └── database.js             # Shared database config
└── Tinglebot Dashboard/
    ├── server.js               # Dashboard entry point
    ├── railway.json            # Dashboard Railway config
    ├── package.json            # Dashboard dependencies
    └── ...
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d
```

## Testing Locally

Before deploying, test the path resolution:

```bash
# Test Bot Service
<<<<<<< HEAD
cd "C:\Users\Ruu\Desktop\Tinglebot 2.0\bot"
=======
cd "C:\Users\Ruu\Desktop\Tinglebot 2.0"
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d
npm start

# Test Dashboard Service
cd "Tinglebot Dashboard"
npm start
```

Both should start without path errors.

## Git Commit & Deploy

1. Commit all changes to GitHub
2. Railway will automatically deploy both services on push
3. Monitor logs for both services in Railway dashboard

## Notes

- Both services share the same codebase and database
- Models are in the root `models/` directory - both services reference them
- Dashboard uses relative paths (`../`) to access root-level resources
- Railway deploys each service from its configured root directory
- Environment variables must be set in **both** Railway services for shared resources

