// ============================================================================
// ------------------- Authentication Routes -------------------
// Discord OAuth authentication routes - Direct OAuth2 implementation
// ============================================================================

const express = require('express');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../shared/utils/logger');
const { env, isProduction } = require('../../shared/config/env');
const User = require('../../shared/models/UserModel');
const mongoose = require('mongoose');

const router = express.Router();

// Discord OAuth configuration
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_CALLBACK_URL || 
  (isProduction 
    ? `https://${env.domain || 'tinglebot.xyz'}/auth/discord/callback`
    : `http://localhost:5001/auth/discord/callback`);

const DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_URL = 'https://discord.com/api/users/@me';

// ------------------- Function: getAuthDebug -------------------
// Debug endpoint to check OAuth configuration
router.get('/debug', (req, res) => {
  res.json({
    isProduction: isProduction,
    domain: env.domain,
    callbackURL: DISCORD_REDIRECT_URI,
    discordCallbackUrl: process.env.DISCORD_CALLBACK_URL,
    nodeEnv: env.nodeEnv,
    port: env.port
  });
});

// ------------------- Function: generateAuthUrl -------------------
// Generates Discord authorization URL with state parameter for CSRF protection
function generateAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify email',
    state: state
  });
  return `${DISCORD_AUTH_URL}?${params.toString()}`;
}

// ------------------- Function: exchangeCodeForToken -------------------
// Exchanges authorization code for access token
async function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: DISCORD_REDIRECT_URI
  });

  const response = await fetch(DISCORD_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// ------------------- Function: getUserInfo -------------------
// Fetches user information from Discord API
async function getUserInfo(accessToken) {
  const response = await fetch(DISCORD_USER_URL, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`User info fetch failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}

// ------------------- Function: initiateDiscordAuth -------------------
// Initiates Discord OAuth flow
router.get('/discord', (req, res, next) => {
  try {
    logger.info('Initiating Discord OAuth', 'auth.js');
    logger.debug(`Session ID before state generation: ${req.session?.id}`, null, 'auth.js');
    
    // Generate random state for CSRF protection
    const state = uuidv4();
    req.session.oauthState = state;

    // Store returnTo if provided
    if (req.query.returnTo) {
      req.session.returnTo = req.query.returnTo;
    }

    logger.debug(`Generated state: ${state}`, null, 'auth.js');
    logger.debug(`Session ID after setting state: ${req.session.id}`, null, 'auth.js');

    // Mark session as modified and save before redirect
    req.session.touch();
    req.session.save((err) => {
      if (err) {
        logger.error('Error saving session before OAuth redirect', err, 'auth.js');
        return next(err);
      }

      logger.debug(`Session saved. Session ID: ${req.session.id}, State in session: ${req.session.oauthState}`, null, 'auth.js');
      
      const authUrl = generateAuthUrl(state);
      logger.info(`Redirecting to Discord OAuth: ${authUrl}`, 'auth.js');
      
      // Log cookie that will be sent
      const cookieName = 'tinglebot.sid';
      logger.debug(`Session cookie will be sent: ${cookieName}=${req.session.id}`, null, 'auth.js');
      
      res.redirect(authUrl);
    });
  } catch (error) {
    logger.error('Error initiating Discord OAuth', error, 'auth.js');
    res.redirect('/login?error=oauth_init_failed');
  }
});

// ------------------- Function: handleDiscordCallback -------------------
// Handles Discord OAuth callback
router.get('/discord/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;

    logger.info('Discord OAuth callback received', 'auth.js');
    logger.debug(`Query params - code: ${code ? 'present' : 'missing'}, state: ${state || 'missing'}, error: ${error || 'none'}`, null, 'auth.js');
    logger.debug(`Session ID: ${req.session?.id}`, null, 'auth.js');
    logger.debug(`Session oauthState: ${req.session?.oauthState || 'not set'}`, null, 'auth.js');
    logger.debug(`Cookie header: ${req.headers.cookie ? 'present' : 'missing'}`, null, 'auth.js');

    // Check for OAuth error
    if (error) {
      logger.warn(`Discord OAuth error: ${error}`, 'auth.js');
      return res.redirect(`/login?error=${encodeURIComponent(error)}`);
    }

    // Verify state parameter (CSRF protection)
    if (!state) {
      logger.warn('Missing state parameter in OAuth callback', 'auth.js');
      return res.redirect('/login?error=missing_state');
    }

    if (!req.session || !req.session.oauthState) {
      logger.warn(`Session oauthState not found. Session ID: ${req.session?.id}, Expected state: ${state}`, 'auth.js');
      return res.redirect('/login?error=session_state_mismatch');
    }

    if (state !== req.session.oauthState) {
      logger.warn(`State mismatch - Received: ${state}, Expected: ${req.session.oauthState}`, 'auth.js');
      return res.redirect('/login?error=invalid_state');
    }

    // Verify code is present
    if (!code) {
      logger.warn('Missing authorization code in OAuth callback', 'auth.js');
      return res.redirect('/login?error=missing_code');
    }

    logger.info('Discord OAuth callback received', 'auth.js');
    logger.debug(`Session ID: ${req.session.id}`, null, 'auth.js');

    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      logger.error('Database not connected during OAuth callback', null, 'auth.js');
      return res.redirect('/login?error=database_unavailable');
    }

    // Exchange code for access token
    const accessToken = await exchangeCodeForToken(code);
    logger.debug('Access token obtained successfully', null, 'auth.js');

    // Fetch user info from Discord
    const discordUser = await getUserInfo(accessToken);
    logger.debug(`Fetched Discord user: ${discordUser.username} (${discordUser.id})`, null, 'auth.js');

    // Find or create user in database
    let user = await User.findOne({ discordId: discordUser.id });

    if (!user) {
      // Create new user
      user = new User({
        discordId: discordUser.id,
        username: discordUser.username,
        email: discordUser.email,
        avatar: discordUser.avatar,
        discriminator: discordUser.discriminator,
        tokens: 0,
        tokenTracker: '',
        blightedcharacter: false,
        characterSlot: 2,
        status: 'active',
        statusChangedAt: new Date()
      });
      await user.save();
      logger.success(`Created new user: ${user.username} (${user.discordId})`, 'auth.js');
    } else {
      // Update existing user's Discord info
      user.username = discordUser.username;
      user.email = discordUser.email;
      user.avatar = discordUser.avatar;
      user.discriminator = discordUser.discriminator;
      user.status = 'active';
      user.statusChangedAt = new Date();
      await user.save();
      logger.debug(`Updated user: ${user.username} (${user.discordId})`, null, 'auth.js');
    }

    // Clear OAuth state from session
    delete req.session.oauthState;

    // Store user in session
    req.session.user = {
      id: user._id.toString(),
      discordId: user.discordId,
      username: user.username,
      email: user.email,
      avatar: user.avatar,
      discriminator: user.discriminator
    };

    // Save session and redirect
    req.session.save((saveErr) => {
      if (saveErr) {
        logger.error('Error saving session after authentication', saveErr, 'auth.js');
        return res.redirect('/login?error=session_save_failed');
      }

      logger.success(`User authenticated: ${user.username} (${user.discordId})`, 'auth.js');
      logger.debug(`Session ID after save: ${req.session.id}`, null, 'auth.js');

      // Get returnTo from session or query, default to dashboard
      const returnTo = req.session.returnTo || req.query.returnTo || '/dashboard';
      delete req.session.returnTo;

      // Build redirect URL
      const separator = returnTo.includes('?') ? '&' : '?';
      const redirectUrl = `${returnTo}${separator}login=success`;

      logger.info(`Redirecting to: ${redirectUrl}`, 'auth.js');
      res.redirect(redirectUrl);
    });
  } catch (error) {
    logger.error('Error in Discord OAuth callback', error, 'auth.js');
    logger.error(`Error details: ${error.message}`, null, 'auth.js');
    res.redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }
});

// ------------------- Function: logout -------------------
// Logs out the user
router.post('/logout', (req, res) => {
  req.session.user = null;
  req.session.destroy((err) => {
    if (err) {
      logger.error('Error destroying session', err, 'auth.js');
      return res.status(500).json({ error: 'Session destruction failed' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// ------------------- Function: getAuthStatus -------------------
// Returns current authentication status
router.get('/status', (req, res) => {
  res.json({
    authenticated: !!req.session.user,
    user: req.session.user ? {
      username: req.session.user.username,
      discordId: req.session.user.discordId,
      avatar: req.session.user.avatar
    } : null
  });
});

module.exports = router;
