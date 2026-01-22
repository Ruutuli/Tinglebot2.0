// ============================================================================
// ------------------- Database Retry Strategy -------------------
// Purpose: Centralized retry logic with exponential backoff and jitter
// - Implements retry mechanism for database operations that fail due to transient errors
// - Uses exponential backoff with jitter to prevent thundering herd problems
// - Optimized for Railway with faster retry intervals
// - Handles both general operations and MongoDB transactions
// Used by: connectionManager.js (for all connection attempts)
// Dependencies: config/database.js (for retry config settings)
// ============================================================================

const dbConfig = require('../config/database');
const logger = require('../utils/logger');

// Railway-optimized retry config (faster retries for better responsiveness)
const isRailway = !!process.env.RAILWAY_ENVIRONMENT;
const { maxRetries, initialDelay, maxDelay, backoffMultiplier, jitter } = dbConfig.retryConfig;

// Railway: Use slightly faster retries (Railway network is more reliable)
const railwayRetryConfig = isRailway ? {
  maxRetries: 3,              // Same retries
  initialDelay: 500,          // Faster initial delay (500ms vs 1000ms)
  maxDelay: 5000,             // Lower max delay (5s vs 10s)
  backoffMultiplier: 2,       // Same multiplier
  jitter: true                // Keep jitter
} : null;

// ============================================================================
// ------------------- Retryable Error Detection -------------------
// ============================================================================

/**
 * Determines if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} - True if the error is retryable
 */
function isRetryableError(error) {
  // Network errors
  if (error.name === 'MongoNetworkError' || 
      error.name === 'MongoTimeoutError' ||
      error.name === 'MongoServerSelectionError') {
    return true;
  }

  // Transient transaction errors
  if (error.hasErrorLabel && (
    error.hasErrorLabel('TransientTransactionError') ||
    error.hasErrorLabel('UnknownTransactionCommitResult')
  )) {
    return true;
  }

  // Specific error codes
  const retryableCodes = [
    6,    // HostUnreachable
    7,    // HostNotFound
    89,   // NetworkTimeout
    91,   // ShutdownInProgress
    11000, // DuplicateKey (sometimes retryable)
    112,  // WriteConflict
    251,  // NoSuchTransaction
    40    // ConflictingUpdateOperators
  ];

  if (error.code && retryableCodes.includes(error.code)) {
    return true;
  }

  // Connection-related error messages
  if (error.message) {
    const connectionErrorPatterns = [
      'connection',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'socket',
      'network',
      'timeout'
    ];

    return connectionErrorPatterns.some(pattern => 
      error.message.toLowerCase().includes(pattern)
    );
  }

  return false;
}

// ============================================================================
// ------------------- Delay Calculation -------------------
// ============================================================================

/**
 * Calculates delay with exponential backoff and optional jitter
 * Optimized for Railway with faster retries
 * @param {number} attempt - Current attempt number (0-indexed)
 * @returns {number} - Delay in milliseconds
 */
function calculateDelay(attempt) {
  // Use Railway-optimized config if on Railway
  const config = railwayRetryConfig || { initialDelay, maxDelay, backoffMultiplier, jitter };
  
  let delay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
  
  // Cap at max delay
  delay = Math.min(delay, config.maxDelay);
  
  // Add jitter if enabled (random 0-20% of delay)
  if (config.jitter) {
    const jitterAmount = delay * 0.2 * Math.random();
    delay = delay + jitterAmount;
  }
  
  return Math.floor(delay);
}

// ============================================================================
// ------------------- Retry Functions -------------------
// ============================================================================

/**
 * Retries an operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retries (default: from config)
 * @param {string} options.operationName - Name of operation for logging
 * @param {Function} options.shouldRetry - Custom retry condition function
 * @returns {Promise<any>} - Result of the operation
 */
async function retryOperation(operation, options = {}) {
  const {
    maxRetries: customMaxRetries = maxRetries,
    operationName = 'operation',
    shouldRetry = isRetryableError
  } = options;

  let lastError;
  
  for (let attempt = 0; attempt <= customMaxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      const shouldRetryError = typeof shouldRetry === 'function' 
        ? shouldRetry(error) 
        : shouldRetry;
      
      // Don't retry on last attempt or if error is not retryable
      if (attempt >= customMaxRetries || !shouldRetryError) {
        throw error;
      }
      
      // Calculate delay and wait
      const delay = calculateDelay(attempt);
      
      logger.warn('RETRY', `${operationName} failed, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${customMaxRetries + 1})`, {
        error: error.message,
        errorCode: error.code,
        errorName: error.name
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// ============================================================================
// ------------------- Transaction Retry Helpers -------------------
// ============================================================================

/**
 * Retries a MongoDB transaction with proper error handling
 * @param {Function} transactionFn - Function that performs transaction operations
 * @param {Object} options - Retry options
 * @returns {Promise<any>} - Result of the transaction
 */
async function retryTransaction(transactionFn, options = {}) {
  const {
    maxRetries: customMaxRetries = maxRetries,
    operationName = 'transaction'
  } = options;

  return retryOperation(async () => {
    // Transaction should handle its own session management
    return await transactionFn();
  }, {
    maxRetries: customMaxRetries,
    operationName,
    shouldRetry: (error) => {
      // Transaction-specific retryable errors
      return (
        error.code === 40 ||   // ConflictingUpdateOperators
        error.code === 112 ||  // WriteConflict
        error.code === 251 ||  // NoSuchTransaction
        error.hasErrorLabel?.('TransientTransactionError') ||
        error.hasErrorLabel?.('UnknownTransactionCommitResult') ||
        (error.message && (
          error.message.includes('would create a conflict') ||
          error.message.includes('WriteConflict') ||
          error.message.includes('TransientTransactionError') ||
          error.message.includes('UnknownTransactionCommitResult')
        ))
      );
    }
  });
}

// ============================================================================
// ------------------- Module Exports -------------------
// ============================================================================

module.exports = {
  retryOperation,
  retryTransaction,
  isRetryableError,
  calculateDelay
};
