const {
  calculateSMAPE,
  simpleExponentialSmoothing,
  holtLinearTrend,
  holtWinters,
  forecastBestModel,
} = require('../../src/algo/forecast');

describe('forecast.js pure time series forecasting', () => {
  describe('calculateSMAPE', () => {
    it('returns 0 for empty arrays', () => {
      expect(calculateSMAPE([], [])).toBe(0);
      expect(calculateSMAPE()).toBe(0);
    });

    it('calculates 0% error for identical series', () => {
      const a = [10, 20, 30];
      const b = [10, 20, 30];
      expect(calculateSMAPE(a, b)).toBe(0);
    });

    it('calculates non-zero symmetric percentage error', () => {
      const a = [100, 100];
      const b = [110, 90];
      const error = calculateSMAPE(a, b);
      expect(error).toBeGreaterThan(0);
      expect(error).toBeLessThan(15);
    });
  });

  describe('simpleExponentialSmoothing (SES)', () => {
    it('handles empty or invalid series safely', () => {
      const res = simpleExponentialSmoothing([]);
      expect(res.fitted).toEqual([]);
      expect(res.forecast).toEqual([0]);

      const resNull = simpleExponentialSmoothing(null, 0.5, 3);
      expect(resNull.forecast).toHaveLength(3);
    });

    it('smooths series and outputs constant flat forecast', () => {
      const series = [10, 12, 11, 13, 15, 14];
      const res = simpleExponentialSmoothing(series, 0.3, 3);
      expect(res.fitted).toHaveLength(6);
      expect(res.forecast).toHaveLength(3);
      expect(res.forecast[0]).toBeGreaterThan(10);
      expect(res.forecast[0]).toBe(res.forecast[1]); // Constant forecast
    });
  });

  describe('holtLinearTrend', () => {
    it('handles empty series and length 1 series safely', () => {
      const resEmpty = holtLinearTrend([]);
      expect(resEmpty.forecast).toEqual([0]);

      const resOne = holtLinearTrend([50], 0.3, 0.1, 2);
      expect(resOne.forecast).toEqual([50, 50]);
    });

    it('captures positive upward trend and projects rising forecast', () => {
      const series = [10, 20, 30, 40, 50, 60];
      const res = holtLinearTrend(series, 0.4, 0.2, 3);
      expect(res.trend).toBeGreaterThan(0);
      expect(res.forecast[0]).toBeGreaterThan(60);
      expect(res.forecast[1]).toBeGreaterThan(res.forecast[0]);
    });
  });

  describe('holtWinters Additive Seasonality', () => {
    it('falls back to Holt Linear when series is shorter than 2 * seasonLength', () => {
      const shortSeries = [10, 20, 30, 40, 50]; // 5 < 2*7 = 14
      const res = holtWinters(shortSeries, { seasonLength: 7, horizon: 3 });
      expect(res.fallbackUsed).toBe(true);
      expect(res.forecast).toHaveLength(3);
      expect(res.seasonals).toHaveLength(7);
    });

    it('extracts seasonal indices and forecasts weekly recurring pattern', () => {
      // 21 days (3 weeks) with strong weekend surge on days 6 and 7
      const series = [
        10,
        12,
        11,
        13,
        14,
        30,
        35, // Week 1
        11,
        13,
        12,
        14,
        15,
        32,
        36, // Week 2
        12,
        14,
        13,
        15,
        16,
        33,
        38, // Week 3
      ];

      const res = holtWinters(series, {
        seasonLength: 7,
        alpha: 0.3,
        beta: 0.1,
        gamma: 0.2,
        horizon: 7,
      });

      expect(res.fallbackUsed).toBe(false);
      expect(res.seasonals).toHaveLength(7);
      expect(res.forecast).toHaveLength(7);
      // Days 5 and 6 of forecast (weekend) should be higher than days 0-4 (weekday)
      expect(res.forecast[5]).toBeGreaterThan(res.forecast[0]);
      expect(res.forecast[6]).toBeGreaterThan(res.forecast[1]);
    });
  });

  describe('forecastBestModel rolling-origin selection', () => {
    it('falls back to SES when series is too short', () => {
      const res = forecastBestModel([10, 20], { horizon: 3 });
      expect(res.selectedModel).toBe('SES');
      expect(res.forecast).toHaveLength(3);
      expect(res.modelDiagnostics.reason).toBeDefined();
    });

    it('selects Holt-Winters for seasonal series and reports sMAPE comparison', () => {
      // 28 days of distinct seasonal data
      const seasonal = [
        10, 12, 11, 13, 15, 35, 40, 11, 13, 12, 14, 16, 36, 42, 12, 14, 13, 15, 17, 38, 44, 13, 15,
        14, 16, 18, 40, 46,
      ];

      const result = forecastBestModel(seasonal, {
        horizon: 7,
        seasonLength: 7,
        validationWindow: 7,
      });
      expect(result.selectedModel).toBe('HOLT_WINTERS');
      expect(result.forecast).toHaveLength(7);
      expect(result.metrics.bestSmape).toBeDefined();
      expect(result.modelDiagnostics.seasonals).toBeDefined();
    });

    it('selects Holt Linear for purely trending non-seasonal series', () => {
      const trending = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75];
      const result = forecastBestModel(trending, {
        horizon: 3,
        seasonLength: 7,
        validationWindow: 3,
      });
      expect(result.selectedModel).toBe('HOLT');
      expect(result.forecast[0]).toBeGreaterThan(70);
    });

    it('selects SES for flat stationary series', () => {
      const flat = [20, 20.1, 19.9, 20.2, 19.8, 20.0, 20.1, 19.9, 20.0, 20.2];
      const result = forecastBestModel(flat, { horizon: 2, validationWindow: 2 });
      expect(result.selectedModel).toBe('SES');
      expect(result.forecast).toHaveLength(2);
    });

    it('handles default arguments across all functions', () => {
      // SES default args
      const s1 = simpleExponentialSmoothing([10, 15, 20]);
      expect(s1.forecast).toHaveLength(1);

      // Holt default args
      const s2 = holtLinearTrend([10, 15, 20]);
      expect(s2.forecast).toHaveLength(1);

      // Holt-Winters default args
      const s3 = holtWinters([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      expect(s3.forecast).toHaveLength(1);

      // holtWinters with empty options
      const s4 = holtWinters([1, 2, 3]);
      expect(s4.fallbackUsed).toBe(true);

      // forecastBestModel default args
      const series = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
      const resDef = forecastBestModel(series);
      expect(resDef.forecast).toHaveLength(7);

      // Call with zero arguments
      expect(simpleExponentialSmoothing().forecast).toHaveLength(1);
      expect(holtLinearTrend().forecast).toHaveLength(1);
      expect(holtWinters().forecast).toHaveLength(1);
      expect(forecastBestModel().selectedModel).toBe('SES');

      const resNull = forecastBestModel(null);
      expect(resNull.selectedModel).toBe('SES');
    });
  });
});
