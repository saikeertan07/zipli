const {
  calculateDeliveryFee,
  DEFAULT_CONFIG,
  WEATHER_SURCHARGES,
} = require('../../src/algo/deliveryFeeEngine');

describe('Configurable Delivery Fee Engine (F-052, LOG-FE-01)', () => {
  describe('Standard Base & Distance Tiers', () => {
    it('returns zero fee for empty cart', () => {
      const result = calculateDeliveryFee({ itemTotalPaise: 0, distanceKm: 2.0 });
      expect(result.finalDeliveryFeePaise).toBe(0);
      expect(result.isFreeDelivery).toBe(true);
      expect(result.breakdown).toHaveLength(0);
    });

    it('charges standard base fee (₹25) within 3.0 km for orders below ₹500', () => {
      const result = calculateDeliveryFee({ itemTotalPaise: 35000, distanceKm: 2.5 });
      expect(result.baseFeePaise).toBe(2500);
      expect(result.distanceFeePaise).toBe(0);
      expect(result.finalDeliveryFeePaise).toBe(2500);
      expect(result.isFreeDelivery).toBe(false);
      expect(result.amountToFreeDeliveryPaise).toBe(15000); // Needs ₹150 more
      expect(result.breakdown[0].label).toContain('Standard Delivery');
    });

    it('charges distance surcharge for deliveries beyond 3 km (+₹10 per km)', () => {
      // 5.5 km -> 2.5 km extra -> ceil(2.5) = 3 km * ₹10 = ₹30 (3000 paise)
      // Total = 2500 + 3000 = 5500 paise (₹55)
      const result = calculateDeliveryFee({ itemTotalPaise: 20000, distanceKm: 5.5 });
      expect(result.baseFeePaise).toBe(2500);
      expect(result.distanceFeePaise).toBe(3000);
      expect(result.finalDeliveryFeePaise).toBe(5500);
      expect(result.breakdown.some((b) => b.code === 'DISTANCE_SURCHARGE')).toBe(true);
    });

    it('computes distance accurately from GPS coordinates using Haversine formula', () => {
      // Hyderabad store (Charminar area) to customer ~4.2 km
      const storeCoord = { lat: 17.3616, lng: 78.4747 };
      const deliveryCoord = { lat: 17.3989, lng: 78.49 };

      const result = calculateDeliveryFee({
        itemTotalPaise: 30000,
        storeCoord,
        deliveryCoord,
      });

      expect(result.distanceKm).toBeGreaterThan(4.0);
      expect(result.distanceKm).toBeLessThan(5.0);
      expect(result.distanceFeePaise).toBeGreaterThan(0);
    });
  });

  describe('Free Delivery Threshold Waiver', () => {
    it('waives base fee and distance fee when cart exceeds ₹500 (50000 paise)', () => {
      const result = calculateDeliveryFee({ itemTotalPaise: 65000, distanceKm: 4.8 });
      expect(result.baseFeePaise).toBe(2500);
      expect(result.distanceFeePaise).toBe(2000);
      expect(result.freeDeliveryDiscountPaise).toBe(4500);
      expect(result.finalDeliveryFeePaise).toBe(0);
      expect(result.isFreeDelivery).toBe(true);
      expect(result.amountToFreeDeliveryPaise).toBe(0);

      const waiver = result.breakdown.find((b) => b.code === 'FREE_DELIVERY_WAIVER');
      expect(waiver).toBeDefined();
      expect(waiver.amountPaise).toBe(-4500);
    });
  });

  describe('Surge Pricing Surcharges & Transparency', () => {
    it('applies adverse weather surge transparently for rain and storm', () => {
      const rainResult = calculateDeliveryFee({
        itemTotalPaise: 25000,
        distanceKm: 2.0,
        weather: 'RAIN',
      });
      expect(rainResult.weatherSurgePaise).toBe(1500);
      expect(rainResult.finalDeliveryFeePaise).toBe(4000); // 2500 base + 1500 rain

      const stormResult = calculateDeliveryFee({
        itemTotalPaise: 25000,
        distanceKm: 2.0,
        weather: 'STORM',
      });
      expect(stormResult.weatherSurgePaise).toBe(3000);
      expect(stormResult.finalDeliveryFeePaise).toBe(5500); // 2500 base + 3000 storm
    });

    it('applies late-night surcharge between 23:00 and 06:00', () => {
      const lateNightDate = new Date('2026-10-19T23:30:00');
      const dayDate = new Date('2026-10-19T14:30:00');

      const lateResult = calculateDeliveryFee({
        itemTotalPaise: 20000,
        distanceKm: 2.0,
        orderTime: lateNightDate,
      });
      expect(lateResult.lateNightSurgePaise).toBe(2000);
      expect(lateResult.finalDeliveryFeePaise).toBe(4500);

      const dayResult = calculateDeliveryFee({
        itemTotalPaise: 20000,
        distanceKm: 2.0,
        orderTime: dayDate,
      });
      expect(dayResult.lateNightSurgePaise).toBe(0);
      expect(dayResult.finalDeliveryFeePaise).toBe(2500);
    });

    it('applies heavy order surcharge for parcels weighing over 10 kg', () => {
      // 14.5 kg -> 4.5kg over 10kg -> 1 tier of 5kg -> +₹10 (1000 paise)
      const result = calculateDeliveryFee({
        itemTotalPaise: 30000,
        distanceKm: 2.0,
        weightGrams: 14500,
      });
      expect(result.heavyOrderSurgePaise).toBe(1000);
      expect(result.finalDeliveryFeePaise).toBe(3500);
    });

    it('retains transparent weather and heavy surges even when order qualifies for free delivery', () => {
      const result = calculateDeliveryFee({
        itemTotalPaise: 60000, // Qualifies for free delivery
        distanceKm: 2.0,
        weather: 'STORM', // ₹30 surge
      });
      // Base fee (2500) waived, storm surge (3000) retained
      expect(result.freeDeliveryDiscountPaise).toBe(2500);
      expect(result.finalDeliveryFeePaise).toBe(3000);
      expect(result.isFreeDelivery).toBe(false);
    });

    it('falls back to default 1.5km urban radius when distance and coordinates are omitted', () => {
      const result = calculateDeliveryFee({
        itemTotalPaise: 20000,
      });
      expect(result.distanceKm).toBe(1.5);
      expect(result.baseFeePaise).toBe(2500);
    });

    it('calculates distance when storeCoord and deliveryCoord are provided', () => {
      const result = calculateDeliveryFee({
        itemTotalPaise: 20000,
        storeCoord: { lat: 12.93524, lng: 77.62448 },
        deliveryCoord: { lat: 12.978369, lng: 77.640836 },
      });
      expect(result.distanceKm).toBeGreaterThan(0);
    });

    it('handles default arguments when called with no parameters', () => {
      const result = calculateDeliveryFee();
      expect(result.finalDeliveryFeePaise).toBe(0);
    });

    it('handles non-numeric distanceKm safely', () => {
      const result = calculateDeliveryFee({ itemTotalPaise: 10000, distanceKm: 'not-a-number' });
      expect(result.distanceKm).toBe(0);
    });
  });
});
