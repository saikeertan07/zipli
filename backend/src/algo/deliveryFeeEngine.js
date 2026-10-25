/**
 * @file deliveryFeeEngine.js
 * @description Pure configurable delivery fee engine for Zipli Pro.
 * Requirement: F-052 / Prompt Pack Part 5 Section 1
 *
 * Implements:
 * 1. Base fee and distance tiers (first 3 km included, graduated surcharge beyond).
 * 2. Order value threshold waiver (free delivery above ₹500).
 * 3. Transparent surge surcharges (weather: rain/storm, time: late-night 23:00-06:00, heavy order > 10kg).
 * 4. Itemized human-readable breakdown explaining every component.
 */

const { calculateHaversineDistance, isValidCoordinate } = require('./geo');

const WEATHER_SURCHARGES = Object.freeze({
  NORMAL: 0,
  RAIN: 1500, // ₹15.00
  STORM: 3000, // ₹30.00
  HEATWAVE: 1000, // ₹10.00
});

const DEFAULT_CONFIG = Object.freeze({
  BASE_FEE_PAISE: 2500, // ₹25.00
  BASE_DISTANCE_KM: 3.0, // First 3 km covered by base fee
  PER_KM_FEE_PAISE: 1000, // ₹10.00 per km thereafter
  FREE_DELIVERY_THRESHOLD_PAISE: 50000, // Free delivery on orders >= ₹500.00
  LATE_NIGHT_SURCHARGE_PAISE: 2000, // ₹20.00 between 23:00 and 06:00
  HEAVY_ORDER_THRESHOLD_GRAMS: 10000, // 10 kg
  HEAVY_ORDER_RATE_PER_5KG_PAISE: 1000, // ₹10.00 per additional 5kg
});

/**
 * Calculates itemized delivery fee with full transparency.
 *
 * @param {Object} params
 * @param {number} params.itemTotalPaise - Subtotal of cart items in paise
 * @param {number} [params.distanceKm] - Distance in kilometers (optional if coordinates provided)
 * @param {{ lat: number, lng: number }} [params.storeCoord] - Store geographic coordinates
 * @param {{ lat: number, lng: number }} [params.deliveryCoord] - Customer delivery coordinates
 * @param {'NORMAL'|'RAIN'|'STORM'|'HEATWAVE'} [params.weather='NORMAL']
 * @param {number|Date} [params.orderTime=Date.now()]
 * @param {number} [params.weightGrams=0] - Total order weight in grams
 * @param {Object} [options] - Custom configuration overrides
 * @returns {Object} Transparent delivery fee calculation breakdown
 */
function calculateDeliveryFee(params = {}, options = {}) {
  const config = { ...DEFAULT_CONFIG, ...options };
  const itemTotalPaise = Math.max(0, Math.round(Number(params.itemTotalPaise) || 0));

  // Determine distance
  let distanceKm = 0;
  if (params.distanceKm !== undefined && params.distanceKm !== null) {
    distanceKm = Math.max(0, Number(params.distanceKm) || 0);
  } else if (
    params.storeCoord &&
    params.deliveryCoord &&
    isValidCoordinate(params.storeCoord) &&
    isValidCoordinate(params.deliveryCoord)
  ) {
    distanceKm = calculateHaversineDistance(params.storeCoord, params.deliveryCoord);
  } else {
    // Default standard urban radius
    distanceKm = 1.5;
  }
  distanceKm = Math.round(distanceKm * 10) / 10;

  // Empty cart has zero delivery fee
  if (itemTotalPaise === 0) {
    return {
      baseFeePaise: 0,
      distanceFeePaise: 0,
      distanceKm,
      weatherSurgePaise: 0,
      lateNightSurgePaise: 0,
      heavyOrderSurgePaise: 0,
      totalSurgePaise: 0,
      grossDeliveryFeePaise: 0,
      freeDeliveryDiscountPaise: 0,
      finalDeliveryFeePaise: 0,
      isFreeDelivery: true,
      amountToFreeDeliveryPaise: config.FREE_DELIVERY_THRESHOLD_PAISE,
      breakdown: [],
    };
  }

  const breakdown = [];

  // 1. Base Fee
  const baseFeePaise = config.BASE_FEE_PAISE;
  breakdown.push({
    code: 'BASE_DELIVERY',
    label: `Standard Delivery (up to ${config.BASE_DISTANCE_KM} km)`,
    amountPaise: baseFeePaise,
    isSurcharge: false,
  });

  // 2. Distance Surcharge
  let distanceFeePaise = 0;
  if (distanceKm > config.BASE_DISTANCE_KM) {
    const extraKm = Math.ceil(distanceKm - config.BASE_DISTANCE_KM);
    distanceFeePaise = extraKm * config.PER_KM_FEE_PAISE;
    breakdown.push({
      code: 'DISTANCE_SURCHARGE',
      label: `Distance Surcharge (+${extraKm} km @ ₹${(config.PER_KM_FEE_PAISE / 100).toFixed(0)}/km)`,
      amountPaise: distanceFeePaise,
      isSurcharge: true,
    });
  }

  // 3. Weather Surge
  const weather = String(params.weather || 'NORMAL').toUpperCase();
  const weatherSurgePaise = WEATHER_SURCHARGES[weather] || 0;
  if (weatherSurgePaise > 0) {
    breakdown.push({
      code: 'WEATHER_SURGE',
      label: `Adverse Weather (${weather.toLowerCase()} condition)`,
      amountPaise: weatherSurgePaise,
      isSurcharge: true,
    });
  }

  // 4. Late Night Surge (11:00 PM to 6:00 AM)
  const orderDate = params.orderTime ? new Date(params.orderTime) : new Date();
  const orderHour = orderDate.getHours();
  let lateNightSurgePaise = 0;
  if (orderHour >= 23 || orderHour < 6) {
    lateNightSurgePaise = config.LATE_NIGHT_SURCHARGE_PAISE;
    breakdown.push({
      code: 'LATE_NIGHT_SURGE',
      label: 'Late Night Delivery (11 PM – 6 AM)',
      amountPaise: lateNightSurgePaise,
      isSurcharge: true,
    });
  }

  // 5. Heavy Order Surge (> 10 kg)
  const weightGrams = Math.max(0, Math.round(Number(params.weightGrams) || 0));
  let heavyOrderSurgePaise = 0;
  if (weightGrams > config.HEAVY_ORDER_THRESHOLD_GRAMS) {
    const extraKg = Math.ceil((weightGrams - config.HEAVY_ORDER_THRESHOLD_GRAMS) / 5000);
    heavyOrderSurgePaise = extraKg * config.HEAVY_ORDER_RATE_PER_5KG_PAISE;
    breakdown.push({
      code: 'HEAVY_ORDER_SURGE',
      label: `Heavy Item Handling (${(weightGrams / 1000).toFixed(1)} kg)`,
      amountPaise: heavyOrderSurgePaise,
      isSurcharge: true,
    });
  }

  const totalSurgePaise = weatherSurgePaise + lateNightSurgePaise + heavyOrderSurgePaise;
  const grossDeliveryFeePaise = baseFeePaise + distanceFeePaise + totalSurgePaise;

  // 6. Free Delivery Waiver Check
  const qualifiesForFreeDelivery = itemTotalPaise >= config.FREE_DELIVERY_THRESHOLD_PAISE;
  let freeDeliveryDiscountPaise = 0;

  if (qualifiesForFreeDelivery) {
    // Waive base fee and distance fee; surges for extreme weather or heavy items remain transparent
    freeDeliveryDiscountPaise = baseFeePaise + distanceFeePaise;
    breakdown.push({
      code: 'FREE_DELIVERY_WAIVER',
      label: `Free Delivery Reward (Orders above ₹${(config.FREE_DELIVERY_THRESHOLD_PAISE / 100).toFixed(0)})`,
      amountPaise: -freeDeliveryDiscountPaise,
      isSurcharge: false,
    });
  }

  const finalDeliveryFeePaise = Math.max(0, grossDeliveryFeePaise - freeDeliveryDiscountPaise);
  const amountToFreeDeliveryPaise = Math.max(
    0,
    config.FREE_DELIVERY_THRESHOLD_PAISE - itemTotalPaise
  );

  return {
    baseFeePaise,
    distanceFeePaise,
    distanceKm,
    weatherSurgePaise,
    lateNightSurgePaise,
    heavyOrderSurgePaise,
    totalSurgePaise,
    grossDeliveryFeePaise,
    freeDeliveryDiscountPaise,
    finalDeliveryFeePaise,
    isFreeDelivery: finalDeliveryFeePaise === 0,
    amountToFreeDeliveryPaise,
    breakdown,
  };
}

module.exports = {
  DEFAULT_CONFIG,
  WEATHER_SURCHARGES,
  calculateDeliveryFee,
};
