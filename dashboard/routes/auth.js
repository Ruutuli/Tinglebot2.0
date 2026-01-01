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
  // Log callback received
  logger.info('Discord OAuth callback received', 'auth.js');
  logger.debug(`Query params: ${JSON.stringify(req.query)}`, null, 'auth.js');
  logger.debug(`Session ID before auth: ${req.session?.id}`, null, 'auth.js');
  logger.debug(`Cookie header: ${req.headers.cookie ? 'present' : 'missing'}`, null, 'auth.js');
  
  // Use custom callback pattern - user is passed as parameter, not req.user
  passport.authenticate('discord', (err, user, info) => {
    if (err) {
      logger.error('Discord OAuth authentication error', err, 'auth.js');
      logger.error(`Error message: ${err.message}`, null, 'auth.js');
      logger.error(`Error stack: ${err.stack}`, null, 'auth.js');
      return res.redirect(`/login?error=${encodeURIComponent(err.message)}`);
    }
    
    if (!user) {
      logger.warn('Discord OAuth authentication failed - no user returned', 'auth.js');
      return res.redirect('/login?error=auth_failed');
    }
    
    logger.debug(`User object received: ${user?.username} (${user?.discordId})`, null, 'auth.js');
    logger.debug(`Session ID before login: ${req.session?.id}`, null, 'auth.js');
    
    // Check if there's a returnTo parameter in the session or query
    const returnTo = req.session.returnTo || req.query.returnTo;
    
    // Store session ID before login to check if it changes
    const sessionIdBeforeLogin = req.session.id;
    logger.debug(`Session ID before req.login: ${sessionIdBeforeLogin}`, null, 'auth.js');
    
    // Use req.login with keepSessionInfo to prevent session regeneration
    // This ensures the session ID doesn't change and the cookie is properly set
    req.login(user, { keepSessionInfo: true }, (err) => {
      if (err) {
        logger.error('Error logging in user after authentication', err, 'auth.js');
        logger.error(`Login error details: ${err.message}`, null, 'auth.js');
        return res.redirect('/login?error=login_failed');
      }
      
      logger.success(`User authenticated: ${user?.username} (${user?.discordId})`, 'auth.js');
      logger.debug(`Session ID after login: ${req.session.id}`, null, 'auth.js');
      logger.debug(`Session ID changed after req.login: ${sessionIdBeforeLogin !== req.session.id ? 'YES - WARNING!' : 'No'}`, null, 'auth.js');
      logger.debug(`Passport user in session: ${req.session.passport?.user}`, null, 'auth.js');
      logger.debug(`req.isAuthenticated(): ${req.isAuthenticated()}`, null, 'auth.js');
      logger.debug(`req.user exists: ${!!req.user}`, null, 'auth.js');
      logger.debug(`req.user details: ${req.user ? `${req.user.username} (${req.user.discordId})` : 'none'}`, null, 'auth.js');
      logger.debug(`Session keys: ${Object.keys(req.session || {}).join(', ')}`, null, 'auth.js');
      
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
      
      // Mark session as modified to ensure it's saved
      req.session.touch();
      
      // Save session explicitly before redirecting to ensure authentication persists
      req.session.save((err) => {
        if (err) {
          logger.error('Error saving session after authentication', err, 'auth.js');
          logger.error(`Session save error details: ${err.message}`, null, 'auth.js');
          return res.redirect('/login?error=session_save_failed');
        }
        
        logger.debug(`Session ID at redirect: ${req.session.id}`, null, 'auth.js');
        logger.debug(`Passport user at redirect: ${req.session.passport?.user}`, null, 'auth.js');
        logger.debug(`Session cookie settings: ${JSON.stringify(req.session.cookie)}`, null, 'auth.js');
        logger.info(`Redirecting authenticated user to: ${redirectUrl}`, 'auth.js');
        
        // Redirect - express-session will set the cookie automatically when response is sent
        res.redirect(redirectUrl);
      });
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

