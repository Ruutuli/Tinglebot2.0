// ============================================================================
// ------------------- Authentication Middleware -------------------
// Consolidated authentication and authorization middleware
// ============================================================================

const fetch = require('node-fetch');
const logger = require('../../shared/utils/logger');

// ------------------- Function: requireAuth -------------------
// Middleware to require authentication for protected routes
function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  logger.warn(`Unauthenticated access attempt to ${req.path}`, 'auth.js');
  res.status(401).json({ error: 'Authentication required' });
}

// ------------------- Function: optionalAuth -------------------
// Middleware that adds user info to request if authenticated
// Always continues, but req.user will be available if authenticated
function optionalAuth(req, res, next) {
  // Always continue, but req.user will be available if authenticated
  next();
}

// ------------------- Function: checkAdminAccess -------------------
// Checks if the authenticated user has admin access via Discord roles
async function checkAdminAccess(req) {
  if (!req.isAuthenticated() || !req.user) {
    return false;
  }
  
  const guildId = process.env.PROD_GUILD_ID;
  const ADMIN_ROLE_ID = process.env.ADMIN_ROLE_ID;
  
  if (!guildId || !ADMIN_ROLE_ID) {
    logger.warn('Admin role check failed: Missing GUILD_ID or ADMIN_ROLE_ID', 'auth.js');
    return false;
  }
  
  try {
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${req.user.discordId}`, {
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const memberData = await response.json();
      const roles = memberData.roles || [];
      const isAdmin = roles.includes(ADMIN_ROLE_ID);
      
      if (isAdmin) {
        logger.debug(`Admin access granted for user ${req.user.username}`, null, 'auth.js');
      }
      
      return isAdmin;
    }
  } catch (error) {
    logger.error('Error checking admin access', error, 'auth.js');
  }
  
  return false;
}

// ------------------- Function: requireAdmin -------------------
// Middleware that requires admin access
async function requireAdmin(req, res, next) {
  if (!req.isAuthenticated() || !req.user) {
    logger.warn(`Unauthenticated admin access attempt to ${req.path}`, 'auth.js');
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const isAdmin = await checkAdminAccess(req);
  
  if (!isAdmin) {
    logger.warn(`Unauthorized admin access attempt by ${req.user.username} to ${req.path}`, 'auth.js');
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  checkAdminAccess,
  requireAdmin
};






