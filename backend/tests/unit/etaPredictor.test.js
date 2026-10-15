/**
 * @file etaPredictor.test.js
 * @description Unit tests for multi-factor delivery ETA prediction algorithm in etaPredictor.js
 */

const {
  DEFAULT_CONFIG,
  getTrafficMultiplier,
  predictETA,
  smoothETA,
  formatRemainingTime,
} = require('../../src/algo/etaPredictor');

describe('etaPredictor.js multi-factor ETA prediction', () => {
  describe('getTrafficMultiplier', () => {
    it('returns morning rush hour multiplier between 08:00 and 11:00', () => {
      expect(getTrafficMultiplier(8)).toBe(1.35);
      expect(getTrafficMultiplier(10)).toBe(1.35);
    });

    it('returns evening peak multiplier between 17:00 and 21:00', () => {
      expect(getTrafficMultiplier(17)).toBe(1.45);
      expect(getTrafficMultiplier(20)).toBe(1.45);
    });

    it('returns midday traffic multiplier between 12:00 and 17:00', () => {
      expect(getTrafficMultiplier(13)).toBe(1.15);
      expect(getTrafficMultiplier(16)).toBe(1.15);
    });

    it('returns late night light traffic multiplier', () => {
      expect(getTrafficMultiplier(23)).toBe(0.95);
      expect(getTrafficMultiplier(3)).toBe(0.95);
    });

    it('returns early morning shoulder multiplier', () => {
      expect(getTrafficMultiplier(7)).toBe(1.05);
    });

    it('extracts hour from Date object properly', () => {
      const date = new Date('2026-10-18T08:30:00Z');
      const mult = getTrafficMultiplier(date);
      expect(typeof mult).toBe('number');
      expect(mult).toBeGreaterThan(0);
    });

    it('handles negative or overflow numeric hours', () => {
      expect(getTrafficMultiplier(-1)).toBeDefined(); // 23:00 -> 0.95
      expect(getTrafficMultiplier(25)).toBeDefined(); // 01:00 -> 0.95
    });

    it('uses current time when called with no arguments', () => {
      const mult = getTrafficMultiplier();
      expect(typeof mult).toBe('number');
    });
  });

  describe('predictETA', () => {
    it('calculates realistic 10-minute delivery ETA for 2.5 km', () => {
      const eta = predictETA(2.5, { timeOrHour: 14 });
      expect(eta.estimatedDurationMin).toBeGreaterThan(5);
      expect(eta.estimatedDurationMin).toBeLessThan(15);
      expect(eta.travelMinutes).toBeGreaterThan(0);
      expect(eta.prepMinutes).toBe(3.0);
      expect(eta.estimatedArrivalIso).toBeDefined();
    });

    it('omits prep time when order is already picked up', () => {
      const eta = predictETA(2.0, { isPickedUp: true, timeOrHour: 14 });
      expect(eta.prepMinutes).toBe(0);
    });

    it('factors in bad weather multiplier', () => {
      const clear = predictETA(3.0, { weatherMultiplier: 1.0, timeOrHour: 14 });
      const stormy = predictETA(3.0, { weatherMultiplier: 1.5, timeOrHour: 14 });
      expect(stormy.estimatedDurationMin).toBeGreaterThan(clear.estimatedDurationMin);
    });

    it('respects min and max speed clamping', () => {
      const slow = predictETA(5.0, { baseSpeedKmh: 2.0 }); // Clamped to minSpeedKmh (10)
      expect(slow.effectiveSpeedKmh).toBe(DEFAULT_CONFIG.minSpeedKmh);

      const fast = predictETA(5.0, { baseSpeedKmh: 90.0, trafficMultiplier: 1.0 }); // Clamped to maxSpeedKmh (45)
      expect(fast.effectiveSpeedKmh).toBe(DEFAULT_CONFIG.maxSpeedKmh);
    });

    it('handles 0 or invalid distance gracefully', () => {
      const etaZero = predictETA(0);
      expect(etaZero.travelMinutes).toBe(0);
      expect(etaZero.estimatedDurationMin).toBeGreaterThanOrEqual(1.0);

      const etaNeg = predictETA(-5);
      expect(etaNeg.travelMinutes).toBe(0);

      const etaNull = predictETA(null);
      expect(etaNull.travelMinutes).toBe(0);
    });

    it('accepts custom currentTime Date instance', () => {
      const base = new Date('2026-10-18T12:00:00Z');
      const eta = predictETA(2.0, { currentTime: base, timeOrHour: 12 });
      const arrival = new Date(eta.estimatedArrivalIso);
      expect(arrival.getTime()).toBeGreaterThan(base.getTime());
    });
  });

  describe('smoothETA', () => {
    it('smooths consecutive ETA updates without jitter', () => {
      const prev = 12.0;
      const current = 8.0;
      const smoothed = smoothETA(current, prev, 0.4);
      // 0.4 * 8 + 0.6 * 12 = 3.2 + 7.2 = 10.4
      expect(smoothed).toBe(10.4);
    });

    it('returns rounded current value when previous estimate is missing or non-finite', () => {
      expect(smoothETA(8.43, null)).toBe(8.4);
      expect(smoothETA(8.43, NaN)).toBe(8.4);
    });

    it('returns rounded previous value when current estimate is non-finite', () => {
      expect(smoothETA(NaN, 11.24)).toBe(11.2);
    });

    it('clamps alpha factor between 0.01 and 1.0', () => {
      expect(smoothETA(10, 5, -1)).toBeDefined();
      expect(smoothETA(10, 5, 2)).toBeDefined();
    });
  });

  describe('formatRemainingTime', () => {
    it('formats 0 or negative minutes as "Arriving now"', () => {
      expect(formatRemainingTime(0).text).toBe('Arriving now');
      expect(formatRemainingTime(-1).text).toBe('Arriving now');
    });

    it('formats 1 minute as "1 min"', () => {
      const res = formatRemainingTime(1.1);
      expect(res.text).toBe('1 min');
      expect(res.minutes).toBe(1);
      expect(res.seconds).toBe(66);
    });

    it('formats multiple minutes as "X mins"', () => {
      const res = formatRemainingTime(8.4);
      expect(res.text).toBe('8 mins');
      expect(res.minutes).toBe(8);
      expect(res.seconds).toBe(504);
    });

    it('handles non-finite values gracefully', () => {
      const res = formatRemainingTime(NaN);
      expect(res.text).toBe('Arriving now');
    });
  });
});
