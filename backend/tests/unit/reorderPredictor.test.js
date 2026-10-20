const {
  ReorderPredictor,
  calculateMedian,
  DEFAULT_CATEGORY_GAPS,
} = require('../../src/algo/reorderPredictor');

describe('Pure Reorder Predictor (/algo/reorderPredictor.js)', () => {
  let predictor;

  beforeEach(() => {
    predictor = new ReorderPredictor();
  });

  describe('calculateMedian helper', () => {
    it('calculates median of odd and even length arrays', () => {
      expect(calculateMedian([5, 1, 3])).toBe(3);
      expect(calculateMedian([4, 1, 2, 3])).toBe(2.5);
      expect(calculateMedian([7])).toBe(7);
      expect(calculateMedian([])).toBe(0);
      expect(calculateMedian(null)).toBe(0);
    });
  });

  describe('estimatePurchaseGap', () => {
    it('calculates median inter-purchase gap in days from timestamp series', () => {
      const dayMs = 24 * 60 * 60 * 1000;
      const base = new Date('2026-01-01T10:00:00Z').getTime();
      const dates = [
        new Date(base),
        new Date(base + 3 * dayMs), // +3 days
        new Date(base + 7 * dayMs), // +4 days
        new Date(base + 10 * dayMs), // +3 days
      ];

      const { typicalGapDays, sampleGapsCount } = predictor.estimatePurchaseGap(dates);
      expect(sampleGapsCount).toBe(3);
      expect(typicalGapDays).toBe(3); // Median of [3, 4, 3] is 3
    });

    it('falls back to category default gap when fewer than 2 purchases', () => {
      const singleDate = [new Date()];
      const resDairy = predictor.estimatePurchaseGap(singleDate, 'dairy');
      expect(resDairy.typicalGapDays).toBe(DEFAULT_CATEGORY_GAPS.dairy);

      const resStaples = predictor.estimatePurchaseGap(singleDate, 'staples');
      expect(resStaples.typicalGapDays).toBe(DEFAULT_CATEGORY_GAPS.staples);

      const resDefault = predictor.estimatePurchaseGap([], 'unknown');
      expect(resDefault.typicalGapDays).toBe(7.0);
    });
  });

  describe('calculateDueScore & Urgency', () => {
    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date('2026-02-01T12:00:00Z');

    it('calculates high due score when elapsed days equals typical gap', () => {
      const habit = {
        lastPurchasedAt: new Date(now.getTime() - 7 * dayMs),
        typicalGapDays: 7.0,
      };

      const result = predictor.calculateDueScore(habit, now);
      expect(result.daysSinceLast).toBe(7);
      expect(result.dueScore).toBeCloseTo(1.0, 1);
      expect(result.isDue).toBe(true);
      expect(result.urgency).toBe('high');
    });

    it('marks low urgency when purchased recently', () => {
      const habit = {
        lastPurchasedAt: new Date(now.getTime() - 1 * dayMs),
        typicalGapDays: 7.0,
      };

      const result = predictor.calculateDueScore(habit, now);
      expect(result.dueScore).toBeLessThan(0.3);
      expect(result.isDue).toBe(false);
      expect(result.urgency).toBe('low');
    });

    it('applies soft decay for extremely overdue purchases', () => {
      // 50 days elapsed on a 7-day cycle (dueScore raw ~ 7.1)
      const habit = {
        lastPurchasedAt: new Date(now.getTime() - 50 * dayMs),
        typicalGapDays: 7.0,
      };

      const result = predictor.calculateDueScore(habit, now);
      // Decay factor softens the score
      expect(result.dueScore).toBeLessThan(7.1);
      expect(result.urgency).toBe('overdue');
    });

    it('handles null or missing habit records safely', () => {
      expect(predictor.calculateDueScore(null).dueScore).toBe(0);
      expect(predictor.calculateDueScore({}).dueScore).toBe(0);
    });

    it('estimates typicalGapDays on the fly when missing from habitRecord', () => {
      const habitWithoutGap = {
        lastPurchasedAt: new Date(now.getTime() - 4 * dayMs),
        category: 'dairy',
        // typicalGapDays is missing
      };
      const res = predictor.calculateDueScore(habitWithoutGap, now);
      expect(res.typicalGapDays).toBe(DEFAULT_CATEGORY_GAPS.dairy);
      expect(res.dueScore).toBeGreaterThan(1.0);
    });

    it('identifies medium urgency when score is between 0.5 and 0.9', () => {
      const habitMedium = {
        lastPurchasedAt: new Date(now.getTime() - 3.5 * dayMs),
        typicalGapDays: 6.0,
      };
      const res = predictor.calculateDueScore(habitMedium, now);
      expect(res.urgency).toBe('medium');
    });

    it('handles duplicate identical timestamps and invalid dates gracefully in gap estimation', () => {
      const identicalDates = [new Date(100000), new Date(100000)];
      const resIdentical = predictor.estimatePurchaseGap(identicalDates, 'unknown_cat');
      expect(resIdentical.typicalGapDays).toBe(7.0);

      const invalidDates = ['invalid date', 'not a date', new Date()];
      const resInvalid = predictor.estimatePurchaseGap(invalidDates, 'unknown_cat2');
      expect(resInvalid.typicalGapDays).toBe(7.0);

      // Numeric timestamps and string dates in calculateDueScore without category
      const numNow = Date.now();
      const habitStrings = {
        lastPurchasedAt: new Date(numNow - 5 * dayMs).toISOString(),
        // no category, no typicalGapDays
      };
      const resString = predictor.calculateDueScore(habitStrings, numNow);
      expect(resString.dueScore).toBeGreaterThan(0);
      expect(resString.typicalGapDays).toBe(7.0);
    });
  });

  describe('rankBuyItAgain', () => {
    it('ranks user products by replenishment due score descending', () => {
      const dayMs = 24 * 60 * 60 * 1000;
      const now = new Date('2026-02-01T12:00:00Z');

      const userProducts = [
        {
          id: 1,
          name: 'Fresh Milk',
          lastPurchasedAt: new Date(now.getTime() - 4 * dayMs),
          typicalGapDays: 3.5,
        }, // Due score ~ 1.14
        {
          id: 2,
          name: 'Atta 5kg',
          lastPurchasedAt: new Date(now.getTime() - 5 * dayMs),
          typicalGapDays: 21.0,
        }, // Due score ~ 0.24
        {
          id: 3,
          name: 'Eggs 6pk',
          lastPurchasedAt: new Date(now.getTime() - 7 * dayMs),
          typicalGapDays: 7.0,
        }, // Due score ~ 1.0
      ];

      const ranked = predictor.rankBuyItAgain(userProducts, 10, now);
      expect(ranked.length).toBe(3);
      expect(ranked[0].id).toBe(1); // Milk is most due
      expect(ranked[1].id).toBe(3); // Eggs is next
      expect(ranked[2].id).toBe(2); // Atta is least due
    });

    it('handles empty or non-array inputs safely', () => {
      expect(predictor.rankBuyItAgain([])).toEqual([]);
      expect(predictor.rankBuyItAgain(null)).toEqual([]);
    });
  });
});
