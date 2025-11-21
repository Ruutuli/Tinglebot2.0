# Git Repository Setup for Railway Deployment

## Current Situation

The dashboard (`Tinglebot Dashboard/`) is currently a **nested git repository** with its own GitHub:
- Dashboard repo: `https://github.com/Ruutuli/Tinglebot-Dashboard.git`
- Main bot repo: (needs to be initialized or connected)

## Problem for Railway Deployment

Railway needs **one repository** to deploy both services. Having a nested git repo will cause issues because:

1. Railway connects to **one GitHub repository**
2. Railway deploys from that repository's root
3. A nested `.git` folder in `Tinglebot Dashboard/` will be ignored or cause conflicts

## Solution Options

### Option 1: Remove Dashboard's Git Repository (Recommended)

Since both services now share models and database code, they should be in the **same repository**:

1. **Remove the nested git repository**:
   ```bash
   cd "Tinglebot Dashboard"
   rm -rf .git
   ```

2. **Initialize main repository** (if not already done):
   ```bash
   cd "C:\Users\Ruu\Desktop\Tinglebot 2.0"
   git init
   git remote add origin <your-main-repo-url>
   ```

3. **Add all files to main repo**:
   ```bash
   git add .
   git commit -m "Merge dashboard into main repository"
   ```

### Option 2: Keep Separate Repos (Not Recommended for Railway)

If you want to keep them separate, you'd need:
- Two separate Railway projects
- Two separate deployments
- Manual synchronization of shared code

**This defeats the purpose of unifying the codebase.**

## Recommended Action

**Remove the dashboard's git repository** and use a single repository for both services. This allows:
- ✅ Single Railway project with two services
- ✅ Shared code in one place
- ✅ Easier maintenance
- ✅ Single source of truth

## Environment Variables Setup

### Shared Variables (Both Services Need)

These should be in **both** Railway services' environment variables:

```
# Database (Shared)
MONGODB_TINGLEBOT_URI_PROD=...
MONGODB_INVENTORIES_URI_PROD=...
MONGODB_VENDING_URI_PROD=...
MONGODB_URI=...

# Google Cloud (Shared)
GOOGLE_PROJECT_ID=...
GOOGLE_PRIVATE_KEY_ID=...
GOOGLE_PRIVATE_KEY=...
GOOGLE_CLIENT_EMAIL=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_X509_CERT_URL=...
GCP_PROJECT_ID=...
GCP_BUCKET_NAME=...
ITEMS_SPREADSHEET_ID=...
```

### Bot-Specific Variables

Only needed in **Bot Service**:

```
DISCORD_TOKEN=...
CLIENT_ID=...
GUILD_ID=...
PROD_GUILD_ID=...
NODE_ENV=production
RAILWAY_ENVIRONMENT=true
```

### Dashboard-Specific Variables

Only needed in **Dashboard Service**:

```
PORT=5001  # Railway sets automatically
NODE_ENV=production
RAILWAY_ENVIRONMENT=true
SESSION_SECRET=...  # Generate a secure random string
DOMAIN=tinglebot.xyz

# Discord OAuth
DISCORD_CLIENT_ID=...  # OAuth app client ID (different from bot)
DISCORD_CLIENT_SECRET=...  # OAuth app secret
DISCORD_CALLBACK_URL=https://your-dashboard.railway.app/auth/discord/callback
PROD_GUILD_ID=...
ADMIN_ROLE_ID=...

# Optional
FORCE_LOCALHOST=false
USE_LOCALHOST=false
```

## Local Development .env Files

For local development, you can have:
- **Root `.env`**: Shared variables + bot-specific
- **`Tinglebot Dashboard/.env`**: Shared variables + dashboard-specific

Or just use **one `.env`** in the root with all variables (both services can read it).

## Next Steps

1. **Remove dashboard's git repository**:
   ```bash
   Remove-Item -Recurse -Force "Tinglebot Dashboard\.git"
   ```

2. **Initialize main repository** (if needed):
   ```bash
   git init
   git remote add origin <your-github-repo-url>
   ```

3. **Add .gitignore** to ignore .env files (already done)

4. **Commit everything to main repo**

5. **Connect Railway to the main repository**

6. **Set up two services in Railway** with different root directories

