// ============================================================================
// ------------------- Authentication Routes -------------------
// Discord OAuth authentication routes
// ============================================================================

const express = require('express');
const passport = require('passport');
const logger = require('../../shared/utils/logger');
const { env, isProduction } = require('../../shared/config/env');

const router = express.Router();

// ------------------- Function: getAuthDebug -------------------
// Debug endpoint to check OAuth configuration
router.get('/debug', (req, res) => {
  res.json({
    isProduction: isProduction,
    domain: env.domain,
    callbackURL: env.discordCallbackUrl,
    discordCallbackUrl: process.env.DISCORD_CALLBACK_URL,
    nodeEnv: env.nodeEnv,
    port: env.port
  });
});

// ------------------- Function: initiateDiscordAuth -------------------
// Initiates Discord OAuth flow
router.get('/discord', (req, res, next) => {
  // Store the return URL in session if provided
  if (req.query.returnTo) {
    req.session.returnTo = req.query.returnTo;
    if (!isProduction) {
      logger.debug(`Storing returnTo in session: ${req.query.returnTo}`, null, 'auth.js');
      logger.debug(`Session ID: ${req.session.id}`, null, 'auth.js');
    }
    
    // Save session explicitly and wait for it to complete
    req.session.save((err) => {
      if (err) {
        logger.error('Error saving session', err, 'auth.js');
        return next(err);
      }
      if (!isProduction) {
        logger.debug('Session saved successfully', null, 'auth.js');
        logger.debug(`Initiating Discord auth with callback URL: ${env.discordCallbackUrl}`, null, 'auth.js');
      }
      passport.authenticate('discord')(req, res, next);
    });
  } else {
    const callbackUrl = env.discordCallbackUrl;
    if (!isProduction) {
      logger.debug(`Initiating Discord auth with callback URL: ${callbackUrl}`, null, 'auth.js');
    }
    passport.authenticate('discord')(req, res, next);
  }
});

// ------------------- Function: handleDiscordCallback -------------------
// Handles Discord OAuth callback
router.get('/discord/callback', (req, res, next) => {
  logger.info('Discord OAuth callback received', 'auth.js');
  logger.debug(`Query params: ${JSON.stringify(req.query)}`, null, 'auth.js');
  logger.debug(`Session ID: ${req.session?.id}`, null, 'auth.js');
  
  // Use custom callback pattern - user is passed as parameter, not req.user
  passport.authenticate('discord', (err, user, info) => {
    if (err) {
      logger.error('Discord OAuth authentication error', err, 'auth.js');
      return res.redirect(`/login?error=${encodeURIComponent(err.message)}`);
    }
    
    if (!user) {
      logger.warn('Discord OAuth authentication failed - no user returned', 'auth.js');
      return res.redirect('/login?error=auth_failed');
    }
    
    logger.debug(`Authenticated user: ${user?.username} (${user?.discordId})`, null, 'auth.js');
    
    // Store original session ID to ensure it doesn't change
    const originalSessionId = req.session.id;
    logger.debug(`Original session ID: ${originalSessionId}`, null, 'auth.js');
    
    // Manually set passport user in session - this is simpler and more reliable
    // than using req.login() which can regenerate the session ID
    if (!req.session.passport) {
      req.session.passport = {};
    }
    req.session.passport.user = user.discordId;
    
    // Mark session as modified
    req.session.touch();
    
    // Save session and redirect
    req.session.save((saveErr) => {
      if (saveErr) {
        logger.error('Error saving session', saveErr, 'auth.js');
        return res.redirect('/login?error=session_save_failed');
      }
      
      // Verify session ID didn't change
      if (req.session.id !== originalSessionId) {
        logger.warn(`Session ID changed from ${originalSessionId} to ${req.session.id}`, 'auth.js');
      }
      
      logger.success(`User authenticated: ${user.username} (${user.discordId})`, 'auth.js');
      logger.debug(`Session ID after save: ${req.session.id}`, null, 'auth.js');
      logger.debug(`Passport user in session: ${req.session.passport.user}`, null, 'auth.js');
      
      // Get returnTo from session or query, default to dashboard
      const returnTo = req.session.returnTo || req.query.returnTo || '/dashboard';
      delete req.session.returnTo; // Clean up
      
      // Build redirect URL
      const separator = returnTo.includes('?') ? '&' : '?';
      const redirectUrl = `${returnTo}${separator}login=success`;
      
      logger.info(`Redirecting to: ${redirectUrl}`, 'auth.js');
      res.redirect(redirectUrl);
    });
  })(req, res, next);
});

// ------------------- Function: logout -------------------
// Logs out the user
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      logger.error('Error during logout', err, 'auth.js');
      return res.status(500).json({ error: 'Logout failed' });
    }
    req.session.destroy((err) => {
      if (err) {
        logger.error('Error destroying session', err, 'auth.js');
        return res.status(500).json({ error: 'Session destruction failed' });
      }
      res.json({ success: true, message: 'Logged out successfully' });
    });
  });
});

// ------------------- Function: getAuthStatus -------------------
// Returns current authentication status
router.get('/status', (req, res) => {
  res.json({
    authenticated: req.isAuthenticated(),
    user: req.user ? {
      username: req.user.username,
      discordId: req.user.discordId,
      avatar: req.user.avatar
    } : null
  });
});

module.exports = router;

