# Deployment Checklist for Railway

## Pre-Deployment Verification

### ✅ Code Changes Complete

- [x] Models moved to shared `models/` directory
- [x] Dashboard model imports updated to use `../models/`
- [x] Dashboard database imports updated to use `../database/db.js`
- [x] Dashboard config imports updated to use `../../config/database.js`
- [x] All utils files updated to use `../../models/`
- [x] Railway configuration files in place for both services

### 📋 Railway Service Configuration

#### Bot Service
<<<<<<< HEAD
- **Root Directory**: `bot/` ⚠️ **CRITICAL - Must be set in Railway**
- **railway.json**: Located in `bot/railway.json`
=======
- **Root Directory**: `/` (root of repo - default)
- **railway.json**: Located in root directory
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d
- **Start Command**: `npm run start` (runs `node index.js`)

#### Dashboard Service
- **Root Directory**: `Tinglebot Dashboard` ⚠️ **CRITICAL - Must be set in Railway**
- **railway.json**: Located in `Tinglebot Dashboard/railway.json`
- **Start Command**: `npm run start` (runs `node server.js`)
- **Health Check**: `/api/health`

### 🔧 Environment Variables Required

Set these in **BOTH** Railway services:

#### Shared Database Variables (Required for Both)
```
MONGODB_TINGLEBOT_URI_PROD=<your-mongodb-uri>
MONGODB_INVENTORIES_URI_PROD=<your-mongodb-uri>
MONGODB_VENDING_URI_PROD=<your-mongodb-uri>
MONGODB_URI=<your-mongodb-uri>  # Fallback
```

#### Bot Service Only
```
DISCORD_TOKEN=<bot-token>
CLIENT_ID=<discord-client-id>
GUILD_ID=<discord-guild-id>
PROD_GUILD_ID=<discord-guild-id>
NODE_ENV=production
RAILWAY_ENVIRONMENT=true
```

#### Dashboard Service Only
```
PORT=5001  # Railway sets this automatically
RAILWAY_ENVIRONMENT=true
NODE_ENV=production
SESSION_SECRET=<generate-a-secret-key>
DOMAIN=tinglebot.xyz

# Discord OAuth
DISCORD_CLIENT_ID=<oauth-client-id>
DISCORD_CLIENT_SECRET=<oauth-client-secret>
DISCORD_CALLBACK_URL=https://your-dashboard-url.railway.app/auth/discord/callback
PROD_GUILD_ID=<discord-guild-id>
ADMIN_ROLE_ID=<admin-role-id>
```

#### Google Cloud (Both Services)
```
GOOGLE_PROJECT_ID=<project-id>
GOOGLE_PRIVATE_KEY_ID=<key-id>
GOOGLE_PRIVATE_KEY=<private-key>
GOOGLE_CLIENT_EMAIL=<client-email>
GOOGLE_CLIENT_ID=<client-id>
GOOGLE_CLIENT_X509_CERT_URL=<cert-url>
GCP_PROJECT_ID=<project-id>
GCP_BUCKET_NAME=<bucket-name>
ITEMS_SPREADSHEET_ID=<spreadsheet-id>
```

### 📁 File Structure Verification

```
Tinglebot 2.0/
<<<<<<< HEAD
├── bot/                        ✅ Bot code
│   ├── index.js                ✅ Bot entry point
│   ├── railway.json            ✅ Bot Railway config
│   ├── package.json            ✅ Bot dependencies
│   └── ...
├── models/                     ✅ Shared models (all 37 models)
=======
├── index.js                    ✅ Bot entry point
├── railway.json                ✅ Bot Railway config
├── package.json                ✅ Bot dependencies
├── models/                     ✅ Shared models (all 36 models)
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d
│   ├── CharacterModel.js
│   ├── UserModel.js
│   ├── MessageTrackingModel.js
│   ├── CharacterOfWeekModel.js
│   ├── MemberLoreModel.js
│   ├── PinModel.js
│   ├── TableModel.js
│   ├── RelationshipModel.js
│   └── ... (all other models)
├── database/
│   └── db.js                   ✅ Shared database connection
├── config/
│   ├── database.js             ✅ Shared database config
│   └── gcsService.js
└── Tinglebot Dashboard/
    ├── server.js               ✅ Dashboard entry point
    ├── railway.json            ✅ Dashboard Railway config (updated)
    ├── package.json            ✅ Dashboard dependencies
    ├── database/
    │   └── db.js               ⚠️ References parent via ../../models/
    └── config/
        └── database.js         ⚠️ References parent via ../../config/
```

### ✅ Path Resolution Verification

<<<<<<< HEAD
#### Bot Service (bot/ Directory)
- ✅ Models: `../models/` → Goes up to root `models/`
- ✅ Database: `../database/db.js` → Goes up to root `database/db.js`
- ✅ Config: `../config/database.js` → Goes up to root `config/database.js`
- ✅ Bot files: `./index.js`, `./commands/` → Bot directory
=======
#### Bot Service (Root Directory)
- ✅ Models: `./models/` → `models/`
- ✅ Database: `./database/db.js` → `database/db.js`
- ✅ Config: `./config/database.js` → `config/database.js`
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d

#### Dashboard Service (Tinglebot Dashboard/ Directory)
- ✅ Models: `../models/` → Goes up to root `models/`
- ✅ Database: `../database/db.js` → Goes up to root `database/db.js`
- ✅ Config: `../../config/database.js` → Goes up two levels to root `config/`
- ✅ Dashboard files: `./server.js`, `./public/` → Dashboard directory

## Deployment Steps

### 1. Push to GitHub
```bash
git add .
git commit -m "Unify bot and dashboard models and database"
git push origin main
```

### 2. Configure Railway Services

#### Bot Service
1. Create/select service in Railway
2. Connect to GitHub repo
<<<<<<< HEAD
3. **Root Directory**: Set to `bot/` ⚠️ **CRITICAL**
=======
3. **Root Directory**: Leave empty (defaults to `/`)
>>>>>>> 936db428ccba1deb103d2940e3fa14eda8608e4d
4. Set environment variables (Bot Service Only + Shared)

#### Dashboard Service
1. Create/select service in Railway
2. Connect to same GitHub repo
3. **Root Directory**: Set to `Tinglebot Dashboard` ⚠️ **CRITICAL**
4. Set environment variables (Dashboard Service Only + Shared)

### 3. Verify Deployment

#### Bot Service Logs Should Show:
- `💾 DATABASE INITIALIZATION`
- `✅ Tinglebot database connected`
- `✅ Inventories database connected`
- Bot connects to Discord

#### Dashboard Service Logs Should Show:
- `TINGLEBOT DASHBOARD Initializing server components...`
- `✅ Tinglebot database connected`
- `✅ Inventories database connected`
- `Server is listening on 0.0.0.0:5001`

#### Health Check:
- Visit: `https://your-dashboard.railway.app/api/health`
- Should return: `{ status: 'OK', timestamp: '...', message: 'Server is running' }`

## Common Issues & Solutions

### ❌ Dashboard can't find models
**Error**: `Cannot find module '../models/...'`

**Solution**: 
- Verify Root Directory is set to `Tinglebot Dashboard` (not `/`)
- Check that files exist in root `models/` directory

### ❌ Database connection fails
**Error**: `Database configuration is incomplete`

**Solution**:
- Verify all `MONGODB_*_URI_PROD` variables are set
- Check that variables are set in **both** Railway services
- Verify MongoDB connection strings are correct

### ❌ Health check fails
**Error**: Railway reports service as unhealthy

**Solution**:
- Verify `/api/health` endpoint is accessible
- Check that `PORT` is set (Railway sets this automatically)
- Verify server is listening on `0.0.0.0:PORT` (not `localhost`)

### ❌ Build fails
**Error**: `npm install` fails

**Solution**:
- Verify `package.json` exists in both directories
- Check that Node version is compatible (both use Node >=18)
- Review build logs for specific errors

## Post-Deployment

- [ ] Verify bot is online in Discord
- [ ] Verify dashboard is accessible at Railway URL
- [ ] Test `/api/health` endpoint
- [ ] Verify database connections in both services
- [ ] Test model operations (e.g., character queries)
- [ ] Monitor logs for errors

## Notes

- Both services deploy from the same repository
- Models are shared - changes to models affect both services
- Database connections are shared - both services use same MongoDB
- Environment variables must be set in **both** services for shared resources
- Railway automatically redeploys on git push

