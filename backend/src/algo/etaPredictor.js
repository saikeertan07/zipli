/**
 * @file etaPredictor.js
 * @description Pure multi-factor delivery ETA prediction algorithm for Zipli Pro.
 * Incorporates distance, store prep time, time-of-day traffic models, weather multipliers,
 * and exponential moving average (EMA) smoothing for jitter-free tracking.
 */

const DEFAULT_CONFIG = Object.freeze({
  basePrepTimeMinutes: 3.0,
  baseSpeedKmh: 22.0,
  minSpeedKmh: 10.0,
  maxSpeedKmh: 45.0,
  bufferMinutes: 1.0,
  emaSmoothingFactor: 0.35,
});

/**
 * Returns traffic speed multiplier based on urban traffic diurnal pattern.
 * Values > 1.0 denote slower congestion speeds.
 *
 * @param {number|Date} [timeOrHour] - Hour of day [0..23] or Date instance.
 * @returns {number} Multiplier (e.g. 1.45 during evening rush hour)
 */
function getTrafficMultiplier(timeOrHour = new Date()) {
  let hour = 12;
  if (timeOrHour instanceof Date) {
    hour = timeOrHour.getHours();
  } else if (typeof timeOrHour === 'number' && Number.isFinite(timeOrHour)) {
    hour = ((Math.floor(timeOrHour) % 24) + 24) % 24;
  }

  // Diurnal traffic profile:
  // 08:00 - 10:59: Morning rush hour
  // 12:00 - 16:59: Normal afternoon
  // 17:00 - 20:59: Evening peak traffic
  // 22:00 - 06:59: Late night empty roads
  if (hour >= 8 && hour < 11) {
    return 1.35; // Morning rush
  }
  if (hour >= 17 && hour < 21) {
    return 1.45; // Evening peak
  }
  if (hour >= 12 && hour < 17) {
    return 1.15; // Midday traffic
  }
  if (hour >= 22 || hour < 7) {
    return 0.95; // Light night traffic
  }
  return 1.05; // Early morning shoulder
}

/**
 * Predicts estimated delivery time (ETA) given remaining distance and environmental conditions.
 *
 * Formula:
 *   effectiveSpeed = clamp(baseSpeed / (trafficMultiplier * weatherMultiplier), minSpeed, maxSpeed)
 *   travelTime = (distanceKm / effectiveSpeed) * 60
 *   totalETA = prepTime + travelTime + buffer
 *
 * Time Complexity: O(1)
 * Space Complexity: O(1)
 *
 * @param {number} distanceKm
 * @param {Object} [options]
 * @returns {{
 *   estimatedDurationMin: number,
 *   travelMinutes: number,
 *   prepMinutes: number,
 *   effectiveSpeedKmh: number,
 *   trafficMultiplier: number,
 *   estimatedArrivalIso: string
 * }}
 */
function predictETA(distanceKm, options = {}) {
  const dist =
    typeof distanceKm === 'number' && Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  const config = {
    ...DEFAULT_CONFIG,
    ...options,
  };

  const prepMinutes = options.isPickedUp ? 0 : Math.max(0, config.basePrepTimeMinutes);
  const bufferMinutes = Math.max(0, config.bufferMinutes);
  const weatherMult =
    typeof options.weatherMultiplier === 'number' && options.weatherMultiplier > 0
      ? options.weatherMultiplier
      : 1.0;

  const trafficMult =
    typeof options.trafficMultiplier === 'number'
      ? Math.max(0.5, options.trafficMultiplier)
      : getTrafficMultiplier(options.timeOrHour);

  const rawSpeed = config.baseSpeedKmh / (trafficMult * weatherMult);
  const effectiveSpeedKmh = Math.max(config.minSpeedKmh, Math.min(rawSpeed, config.maxSpeedKmh));

  const travelMinutes = dist > 0 ? (dist / effectiveSpeedKmh) * 60 : 0;
  const totalMinutes = prepMinutes + travelMinutes + bufferMinutes;
  const finalMinutes = Math.max(1.0, Math.round(totalMinutes * 10) / 10);

  const baseDate = options.currentTime instanceof Date ? options.currentTime : new Date();
  const arrivalTimestamp = new Date(baseDate.getTime() + finalMinutes * 60 * 1000);

  return {
    estimatedDurationMin: finalMinutes,
    travelMinutes: Math.round(travelMinutes * 10) / 10,
    prepMinutes,
    effectiveSpeedKmh: Math.round(effectiveSpeedKmh * 10) / 10,
    trafficMultiplier: Math.round(trafficMult * 100) / 100,
    estimatedArrivalIso: arrivalTimestamp.toISOString(),
  };
}

/**
 * Smooths current ETA estimate using Exponential Moving Average (EMA) to prevent jumpy UI.
 *
 * Formula:
 *   smoothed = alpha * current + (1 - alpha) * previous
 *
 * @param {number} currentEstimateMin
 * @param {number} previousEstimateMin
 * @param {number} [alpha=0.35]
 * @returns {number}
 */
function smoothETA(
  currentEstimateMin,
  previousEstimateMin,
  alpha = DEFAULT_CONFIG.emaSmoothingFactor
) {
  if (typeof previousEstimateMin !== 'number' || !Number.isFinite(previousEstimateMin)) {
    return Math.max(1.0, Math.round(currentEstimateMin * 10) / 10);
  }
  if (typeof currentEstimateMin !== 'number' || !Number.isFinite(currentEstimateMin)) {
    return Math.max(1.0, Math.round(previousEstimateMin * 10) / 10);
  }

  const factor = Math.max(0.01, Math.min(alpha, 1.0));
  const smoothed = factor * currentEstimateMin + (1 - factor) * previousEstimateMin;
  return Math.max(1.0, Math.round(smoothed * 10) / 10);
}

/**
 * Formats remaining minutes into clean human-readable and UI friendly metrics.
 *
 * @param {number} minutes
 * @returns {{ text: string, minutes: number, seconds: number }}
 */
function formatRemainingTime(minutes) {
  const m = Math.max(0, typeof minutes === 'number' && Number.isFinite(minutes) ? minutes : 0);
  const roundedMin = Math.round(m);
  const seconds = Math.round(m * 60);

  let text;
  if (roundedMin <= 0) {
    text = 'Arriving now';
  } else if (roundedMin === 1) {
    text = '1 min';
  } else {
    text = `${roundedMin} mins`;
  }

  return {
    text,
    minutes: roundedMin,
    seconds,
  };
}

module.exports = {
  DEFAULT_CONFIG,
  getTrafficMultiplier,
  predictETA,
  smoothETA,
  formatRemainingTime,
};
