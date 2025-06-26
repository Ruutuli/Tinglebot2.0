#!/bin/bash

# Tinglebot Dashboard Railway Deployment Script
# This script helps set up the dashboard for Railway deployment

echo "🚀 Tinglebot Dashboard Railway Deployment Setup"
echo "================================================"

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Please install it first:"
    echo "   npm install -g @railway/cli"
    echo "   Then run: railway login"
    exit 1
fi

# Check if we're in the dashboard directory
if [ ! -f "server.js" ]; then
    echo "❌ Please run this script from the .dashboard directory"
    exit 1
fi

echo "✅ Railway CLI found"
echo "✅ Dashboard directory confirmed"

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your actual credentials"
    echo "   DO NOT commit this file to version control!"
fi

echo ""
echo "🔧 Next Steps:"
echo "1. Edit .env file with your actual credentials"
echo "2. Run: railway login"
echo "3. Run: railway init"
echo "4. Set environment variables in Railway dashboard"
echo "5. Run: railway up"
echo ""
echo "🌐 Domain Configuration:"
echo "   - Set custom domain: tinglebot.xyz"
echo "   - Configure DNS to point to Railway"
echo ""
echo "🔒 Security Reminder:"
echo "   - Rotate all exposed credentials immediately"
echo "   - Never commit .env files"
echo "   - Use Railway environment variables for production"
echo ""
echo "📚 For more information, see README.md" 