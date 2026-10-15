const { CircuitBreaker, STATE } = require('../../src/ai/circuitBreaker');

describe('AI Gateway Circuit Breaker (P0)', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 500 });
  });

  test('starts in CLOSED state', () => {
    expect(breaker.state).toBe(STATE.CLOSED);
    expect(breaker.isOpen()).toBe(false);
  });

  test('trips to OPEN after 3 consecutive failures', () => {
    breaker.recordFailure(new Error('API Timeout'));
    expect(breaker.state).toBe(STATE.CLOSED);
    expect(breaker.isOpen()).toBe(false);

    breaker.recordFailure(new Error('500 Internal Server Error'));
    expect(breaker.state).toBe(STATE.CLOSED);
    expect(breaker.isOpen()).toBe(false);

    breaker.recordFailure(new Error('503 Service Unavailable'));
    expect(breaker.state).toBe(STATE.OPEN);
    expect(breaker.isOpen()).toBe(true);
  });

  test('transitions to HALF_OPEN after cooldown period expires', async () => {
    breaker.recordFailure(new Error('Fail 1'));
    breaker.recordFailure(new Error('Fail 2'));
    breaker.recordFailure(new Error('Fail 3'));
    expect(breaker.isOpen()).toBe(true);

    // Wait for cooldown (500ms)
    await new Promise((resolve) => setTimeout(resolve, 550));

    // When checking isOpen after cooldown, it probes (HALF_OPEN, returns false)
    expect(breaker.isOpen()).toBe(false);
    expect(breaker.state).toBe(STATE.HALF_OPEN);
  });

  test('recovers to CLOSED on successful call from HALF_OPEN', async () => {
    breaker.recordFailure(new Error('Fail 1'));
    breaker.recordFailure(new Error('Fail 2'));
    breaker.recordFailure(new Error('Fail 3'));

    await new Promise((resolve) => setTimeout(resolve, 550));
    breaker.isOpen(); // transitions to HALF_OPEN

    breaker.recordSuccess();
    expect(breaker.state).toBe(STATE.CLOSED);
    expect(breaker.isOpen()).toBe(false);
  });

  test('re-trips to OPEN immediately if probe call in HALF_OPEN fails', async () => {
    breaker.recordFailure(new Error('Fail 1'));
    breaker.recordFailure(new Error('Fail 2'));
    breaker.recordFailure(new Error('Fail 3'));

    await new Promise((resolve) => setTimeout(resolve, 550));
    breaker.isOpen(); // transitions to HALF_OPEN

    breaker.recordFailure(new Error('Probe failed'));
    expect(breaker.state).toBe(STATE.OPEN);
    expect(breaker.isOpen()).toBe(true);
  });
});
