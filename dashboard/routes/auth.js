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
router.get('/discord/callback', 
  (req, res, next) => {
    // Log callback received (only in development)
    if (!isProduction) {
      logger.debug('Discord callback received', null, 'auth.js');
      logger.debug(`Query params: ${JSON.stringify(req.query)}`, null, 'auth.js');
      logger.debug(`Session ID: ${req.session?.id}`, null, 'auth.js');
    }
    
    // Proceed with authentication
    passport.authenticate('discord', { 
      failureRedirect: '/login?error=auth_failed',
      failureFlash: true 
    })(req, res, (err) => {
      if (err) {
        logger.error('Discord OAuth authentication error', err, 'auth.js');
        logger.error(`Error message: ${err.message}`, null, 'auth.js');
        logger.error(`Error stack: ${err.stack}`, null, 'auth.js');
        return res.redirect(`/login?error=${encodeURIComponent(err.message)}`);
      }
      next();
    });
  },
  (req, res) => {
    // Explicitly log the user in to establish the session
    // This is required when using passport.authenticate with a custom callback
    req.login(req.user, (err) => {
      if (err) {
        logger.error('Error logging in user after authentication', err, 'auth.js');
        return res.redirect('/login?error=login_failed');
      }
      
      logger.success(`User authenticated: ${req.user?.username} (${req.user?.discordId})`, 'auth.js');
      
      // Check if there's a returnTo parameter in the session or query
      const returnTo = req.session.returnTo || req.query.returnTo;
      
      // Only log debug info in development
      if (!isProduction) {
        logger.debug('Discord callback redirect:', null, 'auth.js');
        logger.debug(`returnTo from session: ${req.session.returnTo}`, null, 'auth.js');
        logger.debug(`returnTo from query: ${req.query.returnTo}`, null, 'auth.js');
        logger.debug(`final returnTo: ${returnTo}`, null, 'auth.js');
        logger.debug(`session ID: ${req.session.id}`, null, 'auth.js');
        logger.debug(`passport user: ${req.session.passport?.user}`, null, 'auth.js');
        logger.debug(`session exists: ${!!req.session}`, null, 'auth.js');
        logger.debug(`session keys: ${Object.keys(req.session || {})}`, null, 'auth.js');
        logger.debug(`isAuthenticated: ${req.isAuthenticated()}`, null, 'auth.js');
      }
      
      // Normalize returnTo - handle empty string, '/', or undefined
      let finalReturnTo = returnTo;
      if (!finalReturnTo || finalReturnTo === '/' || finalReturnTo.trim() === '') {
        finalReturnTo = '/dashboard';
      }
      
      // Clear the returnTo from session
      if (req.session.returnTo) {
        delete req.session.returnTo;
      }
      
      // Build redirect URL - check if returnTo already has query params
      const separator = finalReturnTo.includes('?') ? '&' : '?';
      const redirectUrl = finalReturnTo + separator + 'login=success';
      
      // Save session explicitly before redirecting to ensure authentication persists
      req.session.save((err) => {
        if (err) {
          logger.error('Error saving session after authentication', err, 'auth.js');
          return res.redirect('/login?error=session_save_failed');
        }
        
        // Redirect to the destination after session is saved
        if (!isProduction) {
          logger.debug(`Redirecting to: ${redirectUrl}`, null, 'auth.js');
        }
        res.redirect(redirectUrl);
      });
    });
  }
);

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

