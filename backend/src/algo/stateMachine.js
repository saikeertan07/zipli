/**
 * @file stateMachine.js
 * @description Pure order state machine transition table for Zipli Pro.
 * Enforces valid lifecycle transitions and business invariant checks without I/O.
 */

const ORDER_STATES = Object.freeze({
  PLACED: 'placed',
  CONFIRMED: 'confirmed',
  PACKED: 'packed',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
});

/**
 * Valid state transitions mapping:
 * Source State -> Set of allowed Target States
 */
const TRANSITION_TABLE = Object.freeze({
  [ORDER_STATES.PLACED]: Object.freeze([ORDER_STATES.CONFIRMED, ORDER_STATES.CANCELLED]),
  [ORDER_STATES.CONFIRMED]: Object.freeze([ORDER_STATES.PACKED, ORDER_STATES.CANCELLED]),
  [ORDER_STATES.PACKED]: Object.freeze([ORDER_STATES.OUT_FOR_DELIVERY, ORDER_STATES.CANCELLED]),
  [ORDER_STATES.OUT_FOR_DELIVERY]: Object.freeze([ORDER_STATES.DELIVERED]),
  [ORDER_STATES.DELIVERED]: Object.freeze([]),
  [ORDER_STATES.CANCELLED]: Object.freeze([]),
});

const TERMINAL_STATES = Object.freeze(new Set([ORDER_STATES.DELIVERED, ORDER_STATES.CANCELLED]));

/**
 * Checks whether an order transition from current state to target state is legally permissible.
 *
 * Time Complexity: O(1) - hash lookup and bounded array scan (max 2 items)
 * Space Complexity: O(1) - constant memory
 *
 * @param {string} fromState - The current order state.
 * @param {string} toState - The requested target order state.
 * @returns {boolean} True if the transition is allowed; false otherwise.
 */
function canTransition(fromState, toState) {
  if (!fromState || !toState) return false;
  const allowed = TRANSITION_TABLE[fromState];
  if (!allowed) return false;
  return allowed.includes(toState);
}

/**
 * Retrieves the list of valid next states from the given state.
 *
 * Time Complexity: O(1)
 * Space Complexity: O(1)
 *
 * @param {string} state - The current order state.
 * @returns {string[]} Array of permissible next states.
 */
function getAllowedTransitions(state) {
  return TRANSITION_TABLE[state] ? [...TRANSITION_TABLE[state]] : [];
}

/**
 * Determines whether a given state is terminal (cannot transition further).
 *
 * Time Complexity: O(1)
 * Space Complexity: O(1)
 *
 * @param {string} state - Order state to check.
 * @returns {boolean}
 */
function isTerminalState(state) {
  return TERMINAL_STATES.has(state);
}

/**
 * Executes a state transition. Throws an error if the transition is invalid.
 *
 * Time Complexity: O(1)
 * Space Complexity: O(1)
 *
 * @param {string} currentState - The existing state of the order.
 * @param {string} nextState - The intended state.
 * @returns {{ from: string, to: string, timestamp: number, isTerminal: boolean }}
 * @throws {Error} If transition is disallowed.
 */
function transition(currentState, nextState) {
  if (!canTransition(currentState, nextState)) {
    const allowed = getAllowedTransitions(currentState);
    const allowedStr = allowed.length ? allowed.join(', ') : 'none (terminal state)';
    const error = new Error(
      `Illegal order transition: cannot transition from "${currentState}" to "${nextState}". Allowed: [${allowedStr}].`
    );
    error.statusCode = 409;
    error.code = 'INVALID_STATE_TRANSITION';
    throw error;
  }

  return {
    from: currentState,
    to: nextState,
    timestamp: Date.now(),
    isTerminal: isTerminalState(nextState),
  };
}

module.exports = {
  ORDER_STATES,
  TRANSITION_TABLE,
  canTransition,
  getAllowedTransitions,
  isTerminalState,
  transition,
};
