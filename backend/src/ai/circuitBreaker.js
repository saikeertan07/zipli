/**
 * @file circuitBreaker.js
 * @description Circuit breaker for external upstream LLM APIs (P0).
 * Prevents cascading timeouts and immediately routes to local Offline Fallback
 * when external providers degrade or fail repeatedly.
 */

const logger = require('../utils/logger');

const STATE = {
  CLOSED: 'CLOSED', // Normal operation
  OPEN: 'OPEN', // Tripped: skip external calls
  HALF_OPEN: 'HALF_OPEN', // Testing recovery
};

class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 3;
    this.cooldownMs = options.cooldownMs || 60000; // 60 seconds
    this.state = STATE.CLOSED;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
  }

  /**
   * Checks if external call should be bypassed.
   * @returns {boolean} True if circuit is OPEN.
   */
  isOpen() {
    if (this.state === STATE.OPEN) {
      const now = Date.now();
      if (now - this.lastFailureTime > this.cooldownMs) {
        this.state = STATE.HALF_OPEN;
        logger.info('Circuit Breaker transitioned to HALF_OPEN: probing upstream provider');
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * Records a successful upstream call.
   */
  recordSuccess() {
    if (this.state !== STATE.CLOSED) {
      logger.info('Circuit Breaker recovered: transitioned to CLOSED state');
    }
    this.consecutiveFailures = 0;
    this.state = STATE.CLOSED;
  }

  /**
   * Records an upstream error.
   */
  recordFailure(err) {
    this.consecutiveFailures++;
    this.lastFailureTime = Date.now();

    if (this.consecutiveFailures >= this.failureThreshold || this.state === STATE.HALF_OPEN) {
      this.state = STATE.OPEN;
      logger.error('Circuit Breaker tripped to OPEN: falling back to offline provider for 60s', {
        failures: this.consecutiveFailures,
        error: err ? err.message : 'Unknown error',
      });
    }
  }

  /**
   * Resets the breaker state (for tests).
   */
  reset() {
    this.state = STATE.CLOSED;
    this.consecutiveFailures = 0;
    this.lastFailureTime = null;
  }
}

const aiCircuitBreaker = new CircuitBreaker();

module.exports = {
  CircuitBreaker,
  aiCircuitBreaker,
  STATE,
};
