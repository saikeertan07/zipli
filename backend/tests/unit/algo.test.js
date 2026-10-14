const {
  ORDER_STATES,
  canTransition,
  getAllowedTransitions,
  isTerminalState,
  transition,
} = require('../../src/algo/stateMachine');
const algoIndex = require('../../src/algo');

describe('Pure Order State Machine (/algo/stateMachine.js)', () => {
  it('exports stateMachine and Phase 6 modules from /algo/index', () => {
    expect(algoIndex.stateMachine).toBeDefined();
    expect(algoIndex.stateMachine.canTransition).toBe(canTransition);
    expect(algoIndex.geo).toBeDefined();
    expect(algoIndex.dispatchEngine).toBeDefined();
    expect(algoIndex.etaPredictor).toBeDefined();
    expect(algoIndex.driverSimulation).toBeDefined();
  });

  describe('canTransition & transition', () => {
    it('permits the standard forward delivery lifecycle transitions', () => {
      const transitions = [
        [ORDER_STATES.PLACED, ORDER_STATES.CONFIRMED],
        [ORDER_STATES.CONFIRMED, ORDER_STATES.PACKED],
        [ORDER_STATES.PACKED, ORDER_STATES.OUT_FOR_DELIVERY],
        [ORDER_STATES.OUT_FOR_DELIVERY, ORDER_STATES.DELIVERED],
      ];

      for (const [from, to] of transitions) {
        expect(canTransition(from, to)).toBe(true);
        const result = transition(from, to);
        expect(result.from).toBe(from);
        expect(result.to).toBe(to);
        expect(typeof result.timestamp).toBe('number');
      }
    });

    it('permits cancellation from placed, confirmed, and packed states', () => {
      const cancellable = [ORDER_STATES.PLACED, ORDER_STATES.CONFIRMED, ORDER_STATES.PACKED];

      for (const state of cancellable) {
        expect(canTransition(state, ORDER_STATES.CANCELLED)).toBe(true);
        const result = transition(state, ORDER_STATES.CANCELLED);
        expect(result.to).toBe(ORDER_STATES.CANCELLED);
        expect(result.isTerminal).toBe(true);
      }
    });

    it('rejects cancellation once order is out for delivery or delivered', () => {
      expect(canTransition(ORDER_STATES.OUT_FOR_DELIVERY, ORDER_STATES.CANCELLED)).toBe(false);
      expect(() => transition(ORDER_STATES.OUT_FOR_DELIVERY, ORDER_STATES.CANCELLED)).toThrow(
        /Illegal order transition/
      );

      expect(canTransition(ORDER_STATES.DELIVERED, ORDER_STATES.CANCELLED)).toBe(false);
      expect(() => transition(ORDER_STATES.DELIVERED, ORDER_STATES.CANCELLED)).toThrow(
        /Illegal order transition/
      );
    });

    it('rejects skipping states in the lifecycle', () => {
      expect(canTransition(ORDER_STATES.PLACED, ORDER_STATES.DELIVERED)).toBe(false);
      expect(() => transition(ORDER_STATES.PLACED, ORDER_STATES.DELIVERED)).toThrow(
        /cannot transition from "placed" to "delivered"/
      );

      expect(canTransition(ORDER_STATES.PLACED, ORDER_STATES.PACKED)).toBe(false);
      expect(() => transition(ORDER_STATES.PLACED, ORDER_STATES.PACKED)).toThrow();
    });

    it('rejects transitions from terminal states', () => {
      expect(canTransition(ORDER_STATES.DELIVERED, ORDER_STATES.PLACED)).toBe(false);
      expect(canTransition(ORDER_STATES.CANCELLED, ORDER_STATES.CONFIRMED)).toBe(false);
      expect(() => transition(ORDER_STATES.CANCELLED, ORDER_STATES.PLACED)).toThrow();
    });

    it('handles undefined or invalid states gracefully', () => {
      expect(canTransition(null, ORDER_STATES.CONFIRMED)).toBe(false);
      expect(canTransition(ORDER_STATES.PLACED, null)).toBe(false);
      expect(canTransition('unknown_state', ORDER_STATES.CONFIRMED)).toBe(false);
      expect(() => transition('invalid_from', 'invalid_to')).toThrow();
    });
  });

  describe('getAllowedTransitions & isTerminalState', () => {
    it('returns allowed next states correctly', () => {
      expect(getAllowedTransitions(ORDER_STATES.PLACED)).toEqual([
        ORDER_STATES.CONFIRMED,
        ORDER_STATES.CANCELLED,
      ]);
      expect(getAllowedTransitions(ORDER_STATES.OUT_FOR_DELIVERY)).toEqual([
        ORDER_STATES.DELIVERED,
      ]);
      expect(getAllowedTransitions(ORDER_STATES.DELIVERED)).toEqual([]);
      expect(getAllowedTransitions('unknown')).toEqual([]);
    });

    it('identifies terminal states correctly', () => {
      expect(isTerminalState(ORDER_STATES.DELIVERED)).toBe(true);
      expect(isTerminalState(ORDER_STATES.CANCELLED)).toBe(true);
      expect(isTerminalState(ORDER_STATES.PLACED)).toBe(false);
      expect(isTerminalState(ORDER_STATES.PACKED)).toBe(false);
      expect(isTerminalState(ORDER_STATES.OUT_FOR_DELIVERY)).toBe(false);
    });
  });
});
