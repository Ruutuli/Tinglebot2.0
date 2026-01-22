// ============================================================================
// ------------------- Database Health Monitor -------------------
// Purpose: Monitors health and performance of database connections
// - Performs periodic health checks on all database connections
// - Tracks response times, connection pool sizes, and failure counts
// - Alerts when connections become unhealthy
// - Optimized for Railway with more frequent but lighter checks
// Used by: connectionManager.js (automatically started during initialization)
// Dependencies: config/database.js (for health config settings)
// ============================================================================

const dbConfig = require('../config/database');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const { MongoClient } = require('mongodb');

const { checkInterval, pingTimeout, failureThreshold, alertCooldown } = dbConfig.healthConfig;

// ============================================================================
// ------------------- Health State -------------------
// ============================================================================

const healthState = {
  tinglebot: {
    status: 'unknown',
    lastCheck: null,
    consecutiveFailures: 0,
    lastAlert: null,
    metrics: {
      responseTime: null,
      poolSize: null
    }
  },
  inventories: {
    status: 'unknown',
    lastCheck: null,
    consecutiveFailures: 0,
    lastAlert: null,
    metrics: {
      responseTime: null,
      poolSize: null
    }
  },
  vending: {
    status: 'unknown',
    lastCheck: null,
    consecutiveFailures: 0,
    lastAlert: null,
    metrics: {
      responseTime: null,
      poolSize: null
    }
  }
};

// ============================================================================
// ------------------- Health Check Functions -------------------
// ============================================================================

/**
 * Checks health of a Mongoose connection
 * @param {mongoose.Connection} connection - Mongoose connection to check
 * @param {string} name - Name of the connection
 * @returns {Promise<Object>} - Health check result
 */
async function checkMongooseHealth(connection, name) {
  const startTime = Date.now();
  
  try {
    if (!connection || connection.readyState !== 1) {
      return {
        healthy: false,
        status: 'disconnected',
        error: 'Connection not ready',
        responseTime: null
      };
    }

    // Ping with timeout
    const pingPromise = connection.db.admin().ping();
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Ping timeout')), pingTimeout);
    });

    try {
      await Promise.race([pingPromise, timeoutPromise]);
    } finally {
      // Always clear the timeout to prevent leaks
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
    
    const responseTime = Date.now() - startTime;
    
    // Get pool size if available
    let poolSize = null;
    try {
      poolSize = connection.db?.serverConfig?.poolSize || 
                 connection.db?.serverConfig?.s?.pool?.totalConnectionCount || 
                 null;
    } catch (e) {
      // Ignore errors getting pool size
    }

    return {
      healthy: true,
      status: 'connected',
      responseTime,
      poolSize
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      healthy: false,
      status: 'error',
      error: error.message,
      responseTime
    };
  }
}

/**
 * Checks health of a native MongoClient connection
 * @param {MongoClient} client - MongoClient to check
 * @param {string} name - Name of the connection
 * @returns {Promise<Object>} - Health check result
 */
async function checkNativeClientHealth(client, name) {
  const startTime = Date.now();
  
  try {
    if (!client) {
      return {
        healthy: false,
        status: 'disconnected',
        error: 'Client not available',
        responseTime: null
      };
    }

    // Ping with timeout
    const pingPromise = client.db().admin().ping();
    let timeoutId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Ping timeout')), pingTimeout);
    });

    try {
      await Promise.race([pingPromise, timeoutPromise]);
    } finally {
      // Always clear the timeout to prevent leaks
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
    
    const responseTime = Date.now() - startTime;
    
    // Get pool size if available
    let poolSize = null;
    try {
      poolSize = client.topology?.s?.pool?.totalConnectionCount || null;
    } catch (e) {
      // Ignore errors getting pool size
    }

    return {
      healthy: true,
      status: 'connected',
      responseTime,
      poolSize
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      healthy: false,
      status: 'error',
      error: error.message,
      responseTime
    };
  }
}

/**
 * Performs health check for a connection
 * @param {string} name - Name of the connection
 * @param {mongoose.Connection|MongoClient} connection - Connection to check
 * @returns {Promise<void>}
 */
async function checkConnectionHealth(name, connection) {
  const state = healthState[name];
  if (!state) {
    logger.warn('HEALTH', `Unknown connection name: ${name}`);
    return;
  }

  let result;
  
  // Determine connection type and check accordingly
  if (connection instanceof mongoose.Connection || 
      (connection && connection.readyState !== undefined)) {
    // Mongoose connection
    result = await checkMongooseHealth(connection, name);
  } else if (connection instanceof MongoClient || 
             (connection && connection.db)) {
    // Native MongoClient
    result = await checkNativeClientHealth(connection, name);
  } else {
    result = {
      healthy: false,
      status: 'unknown',
      error: 'Unknown connection type',
      responseTime: null
    };
  }

  // Update state
  state.lastCheck = new Date();
  state.metrics.responseTime = result.responseTime;
  state.metrics.poolSize = result.poolSize;

  if (result.healthy) {
    state.status = 'healthy';
    state.consecutiveFailures = 0;
  } else {
    state.status = 'unhealthy';
    state.consecutiveFailures++;
    
    // Alert if threshold reached and cooldown passed
    const now = Date.now();
    const lastAlertTime = state.lastAlert ? new Date(state.lastAlert).getTime() : 0;
    
    if (state.consecutiveFailures >= failureThreshold && 
        (now - lastAlertTime) >= alertCooldown) {
      state.lastAlert = new Date();
      logger.error('HEALTH', `Connection ${name} is unhealthy (${state.consecutiveFailures} consecutive failures)`, {
        status: result.status,
        error: result.error,
        responseTime: result.responseTime
      });
    }
  }
}

/**
 * Gets current health status of all connections
 * @returns {Object} - Health status object
 */
function getHealthStatus() {
  return {
    ...healthState,
    overall: {
      healthy: Object.values(healthState).every(state => state.status === 'healthy'),
      timestamp: new Date()
    }
  };
}

/**
 * Gets health status for a specific connection
 * @param {string} name - Connection name
 * @returns {Object|null} - Health status or null if not found
 */
function getConnectionHealth(name) {
  return healthState[name] || null;
}

// ============================================================================
// ------------------- Periodic Health Checks -------------------
// ============================================================================

let healthCheckInterval = null;

/**
 * Starts periodic health checks
 * Optimized for Railway with more frequent checks but lighter operations
 * @param {Object} connections - Object with connection names as keys and connections as values
 */
function startHealthChecks(connections) {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  // Railway: More frequent but lighter checks
  const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
  const actualInterval = isRailway ? Math.min(checkInterval, 20000) : checkInterval; // Max 20s on Railway

  healthCheckInterval = setInterval(async () => {
    for (const [name, connection] of Object.entries(connections)) {
      if (connection) {
        await checkConnectionHealth(name, connection);
      }
    }
  }, actualInterval);

  logger.info('HEALTH', `Started periodic health checks (interval: ${actualInterval}ms${isRailway ? ', Railway optimized' : ''})`);
}

/**
 * Stops periodic health checks
 */
function stopHealthChecks() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    logger.info('HEALTH', 'Stopped periodic health checks');
  }
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
  checkConnectionHealth,
  getHealthStatus,
  getConnectionHealth,
  startHealthChecks,
  stopHealthChecks
};
