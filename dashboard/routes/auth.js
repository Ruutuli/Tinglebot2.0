// ============================================================================
// ------------------- Authentication Routes -------------------
// Modern Discord OAuth2 authentication implementation following 2025 standards
// Documentation: https://discord.com/developers/docs/topics/oauth2
// ============================================================================

const express = require('express');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../shared/utils/logger');
const { env, isProduction } = require('../../shared/config/env');
const User = require('../../shared/models/UserModel');
const mongoose = require('mongoose');

const router = express.Router();

// ============================================================================
// ------------------- Configuration -------------------
// Discord OAuth2 configuration following 2025 standards
// ============================================================================

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_CALLBACK_URL || 
  (isProduction 
    ? `https://${env.domain || 'tinglebot.xyz'}/auth/discord/callback`
    : `http://localhost:5001/auth/discord/callback`);

// Discord OAuth2 API endpoints (v10)
const DISCORD_AUTH_URL = 'https://discord.com/api/oauth2/authorize';
const DISCORD_TOKEN_URL = 'https://discord.com/api/oauth2/token';
const DISCORD_USER_URL = 'https://discord.com/api/v10/users/@me';

// Required OAuth2 scopes for user authentication
const OAUTH_SCOPES = 'identify email';

// ============================================================================
// ------------------- Helper Functions -------------------
// OAuth2 flow helper functions following Discord's 2025 documentation
// ============================================================================

// ------------------- Function: generateAuthUrl -------------------
// Generates Discord OAuth2 authorization URL with CSRF protection state parameter
// Documentation: https://discord.com/developers/docs/topics/oauth2#authorization-code-grant
function generateAuthUrl(state) {
  if (!DISCORD_CLIENT_ID) {
    throw new Error('DISCORD_CLIENT_ID environment variable is not set');
  }

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: OAUTH_SCOPES,
    state: state
  });

  return `${DISCORD_AUTH_URL}?${params.toString()}`;
}

// ------------------- Function: exchangeCodeForToken -------------------
// Exchanges authorization code for access token using Discord OAuth2 token endpoint
// Documentation: https://discord.com/developers/docs/topics/oauth2#authorization-code-grant-exchange-example
async function exchangeCodeForToken(code) {
  if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
    throw new Error('Discord OAuth2 credentials are not configured');
  }

  if (!code || typeof code !== 'string') {
    throw new Error('Invalid authorization code provided');
  }

  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: DISCORD_REDIRECT_URI
  });

  try {
    const response = await fetch(DISCORD_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`Token exchange failed: ${response.status} - ${errorText}`, null, 'auth.js');
      throw new Error(`Token exchange failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.access_token) {
      throw new Error('Access token not received from Discord');
    }

    return data.access_token;
  } catch (error) {
    if (error.message.includes('Token exchange failed')) {
      throw error;
    }
    logger.error('Network error during token exchange', error, 'auth.js');
    throw new Error('Failed to exchange authorization code for token');
  }
}

// ------------------- Function: getUserInfo -------------------
// Fetches authenticated user information from Discord API v10
// Documentation: https://discord.com/developers/docs/resources/user#get-current-user
async function getUserInfo(accessToken) {
  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('Invalid access token provided');
  }

  try {
    const response = await fetch(DISCORD_USER_URL, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`User info fetch failed: ${response.status} - ${errorText}`, null, 'auth.js');
      throw new Error(`Failed to fetch user info: ${response.status} ${response.statusText}`);
    }

    const userData = await response.json();
    
    if (!userData.id) {
      throw new Error('Invalid user data received from Discord');
    }

    return userData;
  } catch (error) {
    if (error.message.includes('Failed to fetch user info')) {
      throw error;
    }
    logger.error('Network error during user info fetch', error, 'auth.js');
    throw new Error('Failed to fetch user information from Discord');
  }
}

// ------------------- Function: findOrCreateUser -------------------
// Finds existing user or creates new user in database from Discord user data
async function findOrCreateUser(discordUserData) {
  if (!discordUserData || !discordUserData.id) {
    throw new Error('Invalid Discord user data provided');
  }

  // Check database connection
  if (mongoose.connection.readyState !== 1) {
    throw new Error('Database connection not available');
  }

  try {
    let user = await User.findOne({ discordId: discordUserData.id });

    if (!user) {
      // Create new user with Discord data
      user = new User({
        discordId: discordUserData.id,
        username: discordUserData.username,
        email: discordUserData.email || null,
        avatar: discordUserData.avatar || null,
        discriminator: discordUserData.discriminator || null,
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
      // Update existing user's Discord information
      user.username = discordUserData.username;
      user.email = discordUserData.email || user.email;
      user.avatar = discordUserData.avatar || user.avatar;
      user.discriminator = discordUserData.discriminator || user.discriminator;
      user.status = 'active';
      user.statusChangedAt = new Date();

      await user.save();
      logger.debug(`Updated user: ${user.username} (${user.discordId})`, null, 'auth.js');
    }

    return user;
  } catch (error) {
    logger.error('Error finding or creating user', error, 'auth.js');
    throw new Error('Failed to process user data');
  }
}

// ------------------- Function: createSessionUser -------------------
// Creates session user object from database user
function createSessionUser(user) {
  return {
    id: user._id.toString(),
    discordId: user.discordId,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    discriminator: user.discriminator
  };
}

// ============================================================================
// ------------------- Route Handlers -------------------
// Express route handlers for Discord OAuth2 flow
// ============================================================================

// ------------------- Route: GET /auth/debug -------------------
// Debug endpoint to check OAuth2 configuration (development only)
router.get('/debug', (req, res) => {
  if (isProduction) {
    return res.status(404).json({ error: 'Not found' });
  }

  res.json({
    isProduction: isProduction,
    domain: env.domain,
    callbackURL: DISCORD_REDIRECT_URI,
    discordCallbackUrl: process.env.DISCORD_CALLBACK_URL,
    nodeEnv: env.nodeEnv,
    port: env.port,
    clientIdConfigured: !!DISCORD_CLIENT_ID,
    clientSecretConfigured: !!DISCORD_CLIENT_SECRET,
    redirectUri: DISCORD_REDIRECT_URI
  });
});

// ------------------- Route: GET /auth/discord -------------------
// Initiates Discord OAuth2 authorization code flow
// Documentation: https://discord.com/developers/docs/topics/oauth2#authorization-code-grant
router.get('/discord', (req, res, next) => {
  try {
    // Validate configuration
    if (!DISCORD_CLIENT_ID) {
      logger.error('DISCORD_CLIENT_ID not configured', null, 'auth.js');
      return res.redirect('/login?error=oauth_not_configured');
    }

    logger.info('Initiating Discord OAuth2 flow', 'auth.js');

    // Generate secure random state for CSRF protection
    const state = uuidv4();
    req.session.oauthState = state;

    // Store returnTo URL if provided for post-auth redirect
    if (req.query.returnTo) {
      req.session.returnTo = req.query.returnTo;
    }

    // Generate authorization URL
    const authUrl = generateAuthUrl(state);
    
    logger.debug(`OAuth2 state generated: ${state}`, null, 'auth.js');
    logger.info(`Redirecting to Discord OAuth2: ${authUrl}`, 'auth.js');

    // Save session before redirect to ensure state is persisted
    req.session.save((err) => {
      if (err) {
        logger.error('Error saving session before OAuth redirect', err, 'auth.js');
        return next(err);
      }

      res.redirect(authUrl);
    });
  } catch (error) {
    logger.error('Error initiating Discord OAuth', error, 'auth.js');
    res.redirect('/login?error=oauth_init_failed');
  }
});

// ------------------- Route: GET /auth/discord/callback -------------------
// Handles Discord OAuth2 callback and completes authentication flow
// Documentation: https://discord.com/developers/docs/topics/oauth2#authorization-code-grant-redirect-url-example
router.get('/discord/callback', async (req, res, next) => {
  try {
    const { code, state, error } = req.query;

    logger.info('Discord OAuth2 callback received', 'auth.js');

    // Check for OAuth error from Discord
    if (error) {
      logger.warn(`Discord OAuth2 error: ${error}`, 'auth.js');
      return res.redirect(`/login?error=${encodeURIComponent(error)}`);
    }

    // Validate state parameter (CSRF protection)
    if (!state) {
      logger.warn('Missing state parameter in OAuth callback', 'auth.js');
      return res.redirect('/login?error=missing_state');
    }

    if (!req.session || !req.session.oauthState) {
      logger.warn('Session oauthState not found', 'auth.js');
      return res.redirect('/login?error=session_expired');
    }

    if (state !== req.session.oauthState) {
      logger.warn(`State mismatch - Received: ${state}, Expected: ${req.session.oauthState}`, 'auth.js');
      return res.redirect('/login?error=invalid_state');
    }

    // Validate authorization code
    if (!code || typeof code !== 'string') {
      logger.warn('Missing or invalid authorization code', 'auth.js');
      return res.redirect('/login?error=missing_code');
    }

    // Check database connection
    if (mongoose.connection.readyState !== 1) {
      logger.error('Database not connected during OAuth callback', null, 'auth.js');
      return res.redirect('/login?error=database_unavailable');
    }

    // Step 1: Exchange authorization code for access token
    let accessToken;
    try {
      accessToken = await exchangeCodeForToken(code);
      logger.debug('Access token obtained successfully', null, 'auth.js');
    } catch (error) {
      logger.error('Token exchange failed', error, 'auth.js');
      return res.redirect('/login?error=token_exchange_failed');
    }

    // Step 2: Fetch user information from Discord API
    let discordUser;
    try {
      discordUser = await getUserInfo(accessToken);
      logger.debug(`Fetched Discord user: ${discordUser.username} (${discordUser.id})`, null, 'auth.js');
    } catch (error) {
      logger.error('Failed to fetch user info', error, 'auth.js');
      return res.redirect('/login?error=user_fetch_failed');
    }

    // Step 3: Find or create user in database
    let user;
    try {
      user = await findOrCreateUser(discordUser);
    } catch (error) {
      logger.error('Failed to process user data', error, 'auth.js');
      return res.redirect('/login?error=user_processing_failed');
    }

    // Step 4: Clear OAuth state from session (security best practice)
    delete req.session.oauthState;

    // Step 5: Store user in session
    req.session.user = createSessionUser(user);

    // Step 6: Save session and redirect to destination
    req.session.save((saveErr) => {
      if (saveErr) {
        logger.error('Error saving session after authentication', saveErr, 'auth.js');
        return res.redirect('/login?error=session_save_failed');
      }

      logger.success(`User authenticated: ${user.username} (${user.discordId})`, 'auth.js');

      // Determine redirect destination
      const returnTo = req.session.returnTo || req.query.returnTo || '/dashboard';
      delete req.session.returnTo;

      // Build redirect URL with success parameter
      const separator = returnTo.includes('?') ? '&' : '?';
      const redirectUrl = `${returnTo}${separator}login=success`;

      logger.info(`Redirecting authenticated user to: ${redirectUrl}`, 'auth.js');
      res.redirect(redirectUrl);
    });
  } catch (error) {
    logger.error('Unexpected error in Discord OAuth callback', error, 'auth.js');
    res.redirect('/login?error=authentication_failed');
  }
});

// ------------------- Route: GET /auth/logout -------------------
// Logs out the authenticated user by destroying the session
router.get('/logout', (req, res) => {
  try {
    const userId = req.session.user?.discordId || 'unknown';
    
    logger.info(`User logout requested: ${userId}`, 'auth.js');

    req.session.user = null;
    req.session.destroy((err) => {
      if (err) {
        logger.error('Error destroying session during logout', err, 'auth.js');
        return res.status(500).json({ 
          error: 'Session destruction failed',
          success: false 
        });
      }

      logger.success(`User logged out: ${userId}`, 'auth.js');
      res.json({ 
        success: true, 
        message: 'Logged out successfully' 
      });
    });
  } catch (error) {
    logger.error('Unexpected error during logout', error, 'auth.js');
    res.status(500).json({ 
      error: 'Logout failed',
      success: false 
    });
  }
});

// ------------------- Route: GET /auth/status -------------------
// Returns current authentication status and user information
router.get('/status', (req, res) => {
  try {
    const isAuthenticated = !!req.session.user;
    
    res.json({
      authenticated: isAuthenticated,
      user: isAuthenticated ? {
        username: req.session.user.username,
        discordId: req.session.user.discordId,
        avatar: req.session.user.avatar
      } : null
    });
  } catch (error) {
    logger.error('Error checking auth status', error, 'auth.js');
    res.status(500).json({
      authenticated: false,
      error: 'Failed to check authentication status'
    });
  }
});

module.exports = router;
