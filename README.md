# Tinglebot 2.0

## Setup for Development

1. Clone the repository
2. Copy the template files:
   ```bash
   cp scripts/deploy.template.js scripts/deploy.js
   ```
3. Set up your environment variables in `.env` (see `.env.template` for required variables)

## Deployment

### Automatic Deployment
The project is set up to automatically deploy to Railway when changes are pushed to the main branch. This is handled by GitHub Actions.

To set up automatic deployment for your fork:
1. Get your Railway token:
   ```bash
   railway whoami
   ```
2. Get your Project and Service IDs:
   ```bash
   railway status
   ```
3. Add these secrets to your GitHub repository:
   - `RAILWAY_TOKEN`: Your Railway authentication token
   - `RAILWAY_PROJECT_ID`: Your Railway project ID
   - `RAILWAY_SERVICE_ID`: Your Railway service ID

### Manual Deployment
If you need to deploy manually:

1. Install Railway CLI:
```bash
npm install -g @railway/cli
```

2. Login to Railway:
```bash
railway login
```

3. Link your project (first time only):
```bash
railway link
```

4. Deploy:
```bash
railway up
```

### Environment Variables
Make sure these environment variables are set in your Railway project:
- `RAILWAY_ENVIRONMENT=true`
- `GOOGLE_PROJECT_ID`
- `GOOGLE_PRIVATE_KEY_ID`
- `GOOGLE_PRIVATE_KEY`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_X509_CERT_URL`
- Other required environment variables from your `.env` file

### Monitoring
- View logs: `railway logs`
- Check status: `railway status`
- View deployment URL: Railway dashboard

## Security Notes
- Never commit sensitive files to the repository
- Keep your `.env` file and service account credentials secure
- The following files should never be committed:
  - `scripts/deploy.js`
  - `railway.json`
  - `.env`
  - `config/service_account.json`
  - `config/credentials.json`
  - `config/token.json` 