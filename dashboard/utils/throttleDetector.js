// ============================================================================
// ------------------- Throttle Detector Utility -------------------
// Detects database throttling and implements automatic backoff and recovery
// ============================================================================

const logger = require('./logger');

// ============================================================================
// ------------------- Constants -------------------
// ============================================================================

const WINDOW_SIZE = 20; // Track last 20 queries
const SLOW_QUERY_THRESHOLD_MS = 1000; // Consider queries > 1s as slow
const FAILURE_RATE_THRESHOLD = 0.2; // 20% failure rate triggers throttling
const MAX_BACKOFF_MS = 2000; // Maximum backoff delay
const MIN_BACKOFF_MS = 100; // Minimum backoff delay
const CIRCUIT_BREAKER_FAILURES = 5; // Consecutive failures to open circuit
const CIRCUIT_BREAKER_TIMEOUT_MS = 30000; // 30 seconds before attempting recovery
const RECOVERY_THRESHOLD_MS = 500; // Average query time < 500ms to recover

// ============================================================================
// ------------------- Throttle Detector Class -------------------
// ============================================================================

class ThrottleDetector {
  constructor(queryName = 'database') {
    this.queryName = queryName;
    this.queryHistory = []; // Array of { success: boolean, duration: number, timestamp: number }
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.circuitOpenTime = null;
    this.backoffDelay = MIN_BACKOFF_MS;
    this.isThrottled = false;
  }

  // ------------------- recordQuery -------------------
  // Records a query result for performance tracking
  recordQuery(success, duration) {
    const now = Date.now();
    
    // Add to history
    this.queryHistory.push({
      success,
      duration,
      timestamp: now
    });

    // Keep only last WINDOW_SIZE queries
    if (this.queryHistory.length > WINDOW_SIZE) {
      this.queryHistory.shift();
    }

    // Update consecutive failures
    if (success) {
      this.consecutiveFailures = 0;
    } else {
      this.consecutiveFailures++;
    }

    // Check circuit breaker
    this._checkCircuitBreaker();

    // Check throttling status
    this._checkThrottling();
  }

  // ------------------- _checkCircuitBreaker -------------------
  // Checks if circuit breaker should open/close
  _checkCircuitBreaker() {
    const now = Date.now();

    // Open circuit if too many consecutive failures
    if (!this.circuitOpen && this.consecutiveFailures >= CIRCUIT_BREAKER_FAILURES) {
      this.circuitOpen = true;
      this.circuitOpenTime = now;
      logger.warn('THROTTLE', `Circuit breaker OPENED for ${this.queryName} after ${this.consecutiveFailures} consecutive failures`);
    }

    // Try to close circuit after timeout
    if (this.circuitOpen && this.circuitOpenTime) {
      const timeSinceOpen = now - this.circuitOpenTime;
      if (timeSinceOpen >= CIRCUIT_BREAKER_TIMEOUT_MS) {
        // Check if we have recent successful queries
        const recentSuccesses = this.queryHistory
          .filter(q => q.success && (now - q.timestamp) < CIRCUIT_BREAKER_TIMEOUT_MS)
          .length;
        
        if (recentSuccesses > 0 || this.consecutiveFailures === 0) {
          this.circuitOpen = false;
          this.circuitOpenTime = null;
          this.backoffDelay = MIN_BACKOFF_MS;
          logger.info('THROTTLE', `Circuit breaker CLOSED for ${this.queryName} - attempting recovery`);
        }
      }
    }
  }

  // ------------------- _checkThrottling -------------------
  // Checks if throttling conditions are met
  _checkThrottling() {
    if (this.queryHistory.length < 5) {
      // Need at least 5 queries to make a determination
      this.isThrottled = false;
      return;
    }

    // Calculate average query time
    const avgDuration = this.queryHistory.reduce((sum, q) => sum + q.duration, 0) / this.queryHistory.length;

    // Calculate failure rate
    const failures = this.queryHistory.filter(q => !q.success).length;
    const failureRate = failures / this.queryHistory.length;

    // Check if we should be throttled
    const shouldThrottle = avgDuration > SLOW_QUERY_THRESHOLD_MS || failureRate > FAILURE_RATE_THRESHOLD;

    if (shouldThrottle && !this.isThrottled) {
      // Enter throttled state
      this.isThrottled = true;
      logger.warn('THROTTLE', `Throttling detected for ${this.queryName} - avgDuration: ${Math.round(avgDuration)}ms, failureRate: ${(failureRate * 100).toFixed(1)}%`);
    } else if (!shouldThrottle && this.isThrottled) {
      // Exit throttled state
      this.isThrottled = false;
      this.backoffDelay = MIN_BACKOFF_MS;
      logger.info('THROTTLE', `Throttling cleared for ${this.queryName} - performance normalized`);
    }

    // Update backoff delay if throttled
    if (this.isThrottled) {
      // Exponential backoff, but cap at max
      this.backoffDelay = Math.min(this.backoffDelay * 1.5, MAX_BACKOFF_MS);
    } else if (avgDuration < RECOVERY_THRESHOLD_MS) {
      // Reduce backoff if performance is good
      this.backoffDelay = Math.max(this.backoffDelay * 0.8, MIN_BACKOFF_MS);
    }
  }

  // ------------------- shouldBlock -------------------
  // Returns true if circuit breaker is open and we should block the query
  shouldBlock() {
    return this.circuitOpen;
  }

  // ------------------- getBackoffDelay -------------------
  // Returns the current backoff delay in milliseconds
  getBackoffDelay() {
    if (this.circuitOpen) {
      // If circuit is open, use longer delay
      return CIRCUIT_BREAKER_TIMEOUT_MS;
    }
    return this.isThrottled ? this.backoffDelay : 0;
  }

  // ------------------- waitIfNeeded -------------------
  // Waits for backoff delay if throttling is active
  async waitIfNeeded() {
    const delay = this.getBackoffDelay();
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // ------------------- getStats -------------------
  // Returns current statistics for monitoring
  getStats() {
    if (this.queryHistory.length === 0) {
      return {
        queryCount: 0,
        avgDuration: 0,
        failureRate: 0,
        isThrottled: false,
        circuitOpen: false
      };
    }

    const avgDuration = this.queryHistory.reduce((sum, q) => sum + q.duration, 0) / this.queryHistory.length;
    const failures = this.queryHistory.filter(q => !q.success).length;
    const failureRate = failures / this.queryHistory.length;

    return {
      queryCount: this.queryHistory.length,
      avgDuration: Math.round(avgDuration),
      failureRate: (failureRate * 100).toFixed(1) + '%',
      isThrottled: this.isThrottled,
      circuitOpen: this.circuitOpen,
      consecutiveFailures: this.consecutiveFailures,
      backoffDelay: this.backoffDelay
    };
  }

  // ------------------- reset -------------------
  // Resets all tracking data (useful for testing or manual recovery)
  reset() {
    this.queryHistory = [];
    this.consecutiveFailures = 0;
    this.circuitOpen = false;
    this.circuitOpenTime = null;
    this.backoffDelay = MIN_BACKOFF_MS;
    this.isThrottled = false;
    logger.info('THROTTLE', `Throttle detector reset for ${this.queryName}`);
  }
}

// ============================================================================
// ------------------- Global Instances -------------------
// ============================================================================

// Create detector instances for different query types
const characterQueryDetector = new ThrottleDetector('character-queries');
const modCharacterQueryDetector = new ThrottleDetector('mod-character-queries');

// ============================================================================
// ------------------- Exports -------------------
// ============================================================================

module.exports = {
  ThrottleDetector,
  characterQueryDetector,
  modCharacterQueryDetector
};
