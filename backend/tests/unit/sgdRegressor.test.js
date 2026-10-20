const { SGDOnlineRegressor } = require('../../src/algo/sgdRegressor');

describe('sgdRegressor.js online linear regression with SGD', () => {
  describe('constructor and initialization', () => {
    it('initializes with default hyperparameters and prior weights', () => {
      const model = new SGDOnlineRegressor();
      expect(model.numFeatures).toBe(12);
      expect(model.learningRate).toBe(0.01);
      expect(model.l2Lambda).toBe(0.0001);
      expect(model.residuals).toHaveLength(0);
      expect(model.getMAE()).toBe(0);

      const weights = model.getWeights();
      expect(weights[0]).toBe(3.0); // Bias
      expect(weights[1]).toBe(2.72); // Travel rate
    });

    it('accepts custom hyperparameters', () => {
      const model = new SGDOnlineRegressor({
        numFeatures: 15,
        learningRate: 0.05,
        l2Lambda: 0.001,
        residualBufferSize: 10,
      });
      expect(model.numFeatures).toBe(15);
      expect(model.learningRate).toBe(0.05);
      expect(model.residualBufferSize).toBe(10);
    });
  });

  describe('extractFeatures representation', () => {
    const model = new SGDOnlineRegressor();

    it('extracts default features when empty context is passed', () => {
      const feats = model.extractFeatures();
      expect(feats[0]).toBe(1.0); // Bias
      expect(feats[1]).toBe(0); // Distance
      expect(feats[2]).toBe(1.0); // itemsCount default
      expect(feats[3]).toBe(0); // store queue default
      expect(feats[4]).toBe(0); // isRaining default
      expect(feats[6]).toBe(1.0); // Midday (hour=12)
      expect(feats[9]).toBe(0); // Weekday (dow=2)
    });

    it('activates morning rush feature for hour 9', () => {
      const feats = model.extractFeatures({ distanceKm: 2.0, hourOfDay: 9, dayOfWeek: 1 });
      expect(feats[5]).toBe(1.0); // Morning rush
      expect(feats[6]).toBe(0.0);
      expect(feats[7]).toBe(0.0);
      expect(feats[8]).toBe(0.0);
      expect(feats[9]).toBe(0.0); // Monday
    });

    it('activates evening rush feature and interaction for hour 19', () => {
      const feats = model.extractFeatures({ distanceKm: 3.0, hourOfDay: 19, dayOfWeek: 3 });
      expect(feats[5]).toBe(0.0);
      expect(feats[7]).toBe(1.0); // Evening rush
      expect(feats[11]).toBeCloseTo(3.0 * 1.0, 5); // Interaction
    });

    it('activates late night feature for hour 23 and hour 4', () => {
      const featsNight = model.extractFeatures({ hourOfDay: 23 });
      expect(featsNight[8]).toBe(1.0);

      const featsDawn = model.extractFeatures({ hourOfDay: 4 });
      expect(featsDawn[8]).toBe(1.0);
    });

    it('handles non-rush hours (e.g. 7, 11, 21) where no rush bucket is 1', () => {
      const feats11 = model.extractFeatures({ hourOfDay: 11 });
      expect(feats11[5]).toBe(0);
      expect(feats11[6]).toBe(0);
      expect(feats11[7]).toBe(0);
      expect(feats11[8]).toBe(0);
    });

    it('activates weekend surge feature for Sunday (0) and Saturday (6)', () => {
      const featsSun = model.extractFeatures({ dayOfWeek: 0 });
      expect(featsSun[9]).toBe(1.0);

      const featsSat = model.extractFeatures({ dayOfWeek: 6 });
      expect(featsSat[9]).toBe(1.0);
    });

    it('activates rain feature and rain distance interaction', () => {
      const feats = model.extractFeatures({ distanceKm: 4.0, isRaining: true });
      expect(feats[4]).toBe(1.0);
      expect(feats[10]).toBeCloseTo(4.0, 5);
    });
  });

  describe('predict and confidence quantiles', () => {
    it('predicts reasonable ETA for a 2.5km delivery and generates confidence range text', () => {
      const model = new SGDOnlineRegressor();
      const res = model.predict({ distanceKm: 2.5, itemsCount: 3 });

      expect(res.predictedEtaMinutes).toBeGreaterThan(5.0);
      expect(res.confidenceLower).toBeLessThanOrEqual(res.predictedEtaMinutes);
      expect(res.confidenceUpper).toBeGreaterThanOrEqual(res.predictedEtaMinutes);
      expect(res.confidenceRangeText).toMatch(/\d+ - \d+ mins/);
    });

    it('accepts raw Float64Array in predict', () => {
      const model = new SGDOnlineRegressor();
      const feats = model.extractFeatures({ distanceKm: 1.0 });
      const res = model.predict(feats);

      expect(res.predictedEtaMinutes).toBeGreaterThan(0);
    });
  });

  describe('trainOnline and online learning dynamics', () => {
    it('updates weights and decreases prediction error via SGD iterations', () => {
      const model = new SGDOnlineRegressor({ learningRate: 0.05 });
      const context = { distanceKm: 2.0, itemsCount: 2 };

      const predBefore = model.predict(context).predictedEtaMinutes;
      // Actual delivery took 20 minutes (longer than prior predicted ~8-9 mins)
      for (let i = 0; i < 20; i++) {
        model.trainOnline(context, 20.0);
      }

      const predAfter = model.predict(context).predictedEtaMinutes;
      expect(predAfter).toBeGreaterThan(predBefore);
      expect(model.getMAE()).toBeGreaterThan(0);
    });

    it('accepts raw Float64Array and fallback actualMinutes in trainOnline', () => {
      const model = new SGDOnlineRegressor();
      const feats = model.extractFeatures({ distanceKm: 1.5 });
      const res = model.trainOnline(feats, null); // fallback actual to 1.0
      expect(res.absError).toBeDefined();
    });

    it('evicts old residuals when buffer capacity is reached and computes empirical quantiles', () => {
      const model = new SGDOnlineRegressor({ residualBufferSize: 5 });
      // Train 10 times to exceed buffer size of 5
      for (let i = 0; i < 10; i++) {
        model.trainOnline({ distanceKm: 1.0 + i * 0.2 }, 10.0 + i);
      }

      expect(model.residuals.length).toBe(5);
      const pred = model.predict({ distanceKm: 2.0 });
      expect(pred.confidenceRangeText).toBeDefined();
    });
  });
});
