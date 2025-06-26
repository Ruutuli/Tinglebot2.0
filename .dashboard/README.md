# Tinglebot Dashboard

A web dashboard for managing and viewing Tinglebot 2.0 data, statistics, and character information.

## 🚀 Railway Deployment

This dashboard is configured to deploy on Railway with the domain `tinglebot.xyz`.

### Prerequisites

- Railway account
- MongoDB Atlas database
- Google Cloud Storage bucket
- Domain configured (tinglebot.xyz)

### Environment Variables

Set these environment variables in Railway:

#### Required Variables
```bash
# Database Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/tinglebot
MONGODB_TINGLEBOT_URI_PROD=mongodb+srv://username:password@cluster.mongodb.net/tinglebot
MONGODB_INVENTORIES_URI_PROD=mongodb+srv://username:password@cluster.mongodb.net/inventories
MONGODB_VENDING_URI_PROD=mongodb+srv://username:password@cluster.mongodb.net/vendingInventories

# Google Cloud Storage
GCP_BUCKET_NAME=tinglebot

# Application
PORT=5001
NODE_ENV=production
```

#### Optional Variables (for future Discord OAuth)
```bash
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
DISCORD_CALLBACK_URL=https://tinglebot.xyz/auth/discord/callback
SESSION_SECRET=your_session_secret
```

### Deployment Steps

1. **Connect Repository**: Link your GitHub repository to Railway
2. **Set Environment Variables**: Add all required environment variables in Railway dashboard
3. **Deploy**: Railway will automatically build and deploy the application
4. **Configure Domain**: Set up custom domain `tinglebot.xyz` in Railway

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Start production server
npm start
```

## 🔒 Security Considerations

### Critical Security Issues Found

⚠️ **IMMEDIATE ACTION REQUIRED**: The following sensitive data was found in the codebase:

1. **Discord Bot Token** - Exposed in `.env` files
2. **MongoDB Credentials** - Database passwords exposed  
3. **Google Service Account** - Private key and credentials exposed
4. **Trello API Keys** - Exposed in `.env` files

### Security Fixes Applied

1. ✅ Created `.env.example` template without sensitive data
2. ✅ Added proper `.gitignore` to prevent committing secrets
3. ✅ Configured Railway to use environment variables
4. ✅ Removed hardcoded secrets from configuration files

### Required Actions

1. **Rotate All Secrets**: 
   - Generate new Discord bot token
   - Create new MongoDB user with new password
   - Generate new Google service account key
   - Generate new Trello API keys

2. **Update Environment Variables**:
   - Set all new secrets in Railway environment variables
   - Never commit `.env` files to version control

3. **Monitor Access**:
   - Check for unauthorized access to exposed credentials
   - Monitor database and API usage

## 📊 Features

- Character statistics and information
- Inventory management
- Item database
- Server statistics
- Real-time data from MongoDB
- Image proxy from Google Cloud Storage

## 🏗️ Architecture

- **Frontend**: HTML/CSS/JavaScript (SPA)
- **Backend**: Node.js with Express
- **Database**: MongoDB (multiple collections)
- **Storage**: Google Cloud Storage
- **Deployment**: Railway
- **Domain**: tinglebot.xyz

## 🔧 API Endpoints

- `GET /api/health` - Health check
- `GET /api/characters` - All characters
- `GET /api/character/:id` - Specific character
- `GET /api/inventory` - All inventory data
- `GET /api/items` - All items
- `POST /api/inventory/item` - Search inventory by item
- `GET /api/images/:filename` - Image proxy

## 📝 Logging

The application logs all operations with timestamps and context:
- Database connections
- API requests
- Errors and exceptions
- Performance metrics

## 🚨 Emergency Contacts

If you discover any security issues:
1. Immediately rotate all exposed credentials
2. Check for unauthorized access
3. Update environment variables
4. Monitor for suspicious activity

## Important Notes

- The dashboard server runs on port 3001
- Make sure port 3001 is not being used by another application
- The dashboard connects to MongoDB Atlas for data storage
- The Discord bot status is monitored in real-time

## MongoDB Connections

The dashboard is pre-configured with these MongoDB connections:

1. **Tinglebot Main**
   - URI: mongodb+srv://rudhuli:Billybest6@tinglebot.4cmc11t.mongodb.net/tinglebot
   - Database: tinglebot

2. **Tinglebot Production**
   - URI: mongodb+srv://rudhuli:Billybest6@tinglebot.4cmc11t.mongodb.net/tinglebot
   - Database: tinglebot

3. **Inventories**
   - URI: mongodb+srv://rudhuli:Billybest6@tinglebot.4cmc11t.mongodb.net/inventories
   - Database: inventories

4. **Vending Inventories**
   - URI: mongodb+srv://rudhuli:Billybest6@tinglebot.4cmc11t.mongodb.net/vendingInventories
   - Database: vendingInventories

## Features

### Overview Page
- Real-time Discord bot status
- Connection status monitoring
- Connection history graph

### Items Database
- Search items by name
- Filter by:
  - Category
  - Type
  - Rarity (1-10)
  - Price range
- Sort by:
  - Name
  - Price
  - Rarity
- Pagination support

## API Endpoints

All endpoints are available at `http://localhost:3001`:

- `GET /api/discord-info` - Get Discord bot status
- `GET /api/connection-status` - Get all connection statuses
- `GET /api/connection-history` - Get connection history
- `POST /api/test-connection` - Test MongoDB connection
- `GET /api/items` - Get items with filtering and pagination

## Troubleshooting

1. **Server Won't Start**
   - Check if port 3001 is available
   - Verify Node.js is installed
   - Check if all dependencies are installed
   - Try running `netstat -ano | findstr :3001` to check if port is in use

2. **Can't Connect to MongoDB**
   - Verify MongoDB connection strings
   - Check network connectivity
   - Ensure MongoDB Atlas IP whitelist includes your IP
   - Check if MongoDB Atlas cluster is running

3. **Dashboard Not Loading**
   - Check browser console for errors
   - Verify server is running at http://localhost:3001
   - Clear browser cache
   - Try a different browser

## Development

The dashboard uses:
- Express.js for the backend
- MongoDB for the database
- Chart.js for graphs
- Modern CSS with CSS variables
- Responsive design for all screen sizes

## Security Notes

- Never commit MongoDB credentials
- Keep your connection strings secure
- Use environment variables for sensitive data
- The dashboard should only be accessed from trusted networks 

http://localhost:3001