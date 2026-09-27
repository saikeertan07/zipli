/**
 * @file deliveryIntelligence.controller.js
 * @description Controller handling Delivery Intelligence REST APIs for route planning,
 * matching, batch optimization, slot reservation, and ETA prediction.
 */

const { deliveryIntelligenceService } = require('../services/deliveryIntelligence.service');

const deliveryIntelligenceController = {
  /**
   * POST /api/delivery-intel/route
   */
  async calculateRoute(req, res, _next) {
    try {
      const { start, target, mode, algo } = req.body;
      if (!start || !target) {
        return res.status(400).json({
          status: 'error',
          message: 'Both start and target must be provided',
        });
      }

      const route = deliveryIntelligenceService.calculateRoute({ start, target, mode, algo });
      return res.status(200).json({
        status: 'success',
        data: route,
      });
    } catch (err) {
      return res.status(400).json({
        status: 'error',
        message: err.message,
      });
    }
  },

  /**
   * POST /api/delivery-intel/match
   */
  async matchOrders(req, res, _next) {
    try {
      const { orders, riders } = req.body;
      if (!Array.isArray(orders) || !Array.isArray(riders)) {
        return res.status(400).json({
          status: 'error',
          message: 'Both orders and riders must be arrays',
        });
      }

      const result = deliveryIntelligenceService.matchOrdersToRiders({ orders, riders });
      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      return res.status(400).json({
        status: 'error',
        message: err.message,
      });
    }
  },

  /**
   * POST /api/delivery-intel/batch
   */
  async optimizeBatch(req, res, _next) {
    try {
      const { depot, orders, options } = req.body;
      if (!depot) {
        return res.status(400).json({
          status: 'error',
          message: 'Valid depot coordinate required',
        });
      }

      const result = deliveryIntelligenceService.optimizeBatchDelivery({ depot, orders, options });
      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      return res.status(400).json({
        status: 'error',
        message: err.message,
      });
    }
  },

  /**
   * GET /api/delivery-intel/slots
   */
  async getSlots(req, res, next) {
    try {
      const slots = deliveryIntelligenceService.getSlotCapacities();
      return res.status(200).json({
        status: 'success',
        data: slots,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/delivery-intel/slots/reserve
   */
  async reserveSlot(req, res, next) {
    try {
      const { slotIndex, count = 1 } = req.body;
      if (slotIndex === undefined || Number(slotIndex) < 0 || Number(slotIndex) >= 24) {
        return res.status(400).json({
          status: 'error',
          message: 'Valid slotIndex (0-23) required',
        });
      }

      const success = deliveryIntelligenceService.reserveDeliverySlot(
        Number(slotIndex),
        Number(count)
      );
      if (!success) {
        return res.status(409).json({
          status: 'error',
          message: 'Insufficient slot capacity or invalid reservation count',
        });
      }

      return res.status(200).json({
        status: 'success',
        data: {
          slotIndex: Number(slotIndex),
          reservedCount: Number(count),
          message: 'Slot successfully reserved',
        },
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/delivery-intel/eta
   */
  async predictETA(req, res, next) {
    try {
      const context = req.body || {};
      const prediction = deliveryIntelligenceService.predictETA(context);
      return res.status(200).json({
        status: 'success',
        data: prediction,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/delivery-intel/eta/feedback
   */
  async feedETAFeedback(req, res, next) {
    try {
      const { context = {}, actualMinutes } = req.body;
      if (actualMinutes === undefined || Number(actualMinutes) <= 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Positive actualMinutes duration required',
        });
      }

      const result = deliveryIntelligenceService.feedDeliveryObservation(
        context,
        Number(actualMinutes)
      );
      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * GET /api/delivery-intel/capacity
   */
  async getCapacity(req, res, next) {
    try {
      const gauge = deliveryIntelligenceService.getSurgeCapacity();
      return res.status(200).json({
        status: 'success',
        data: gauge,
      });
    } catch (err) {
      next(err);
    }
  },

  /**
   * POST /api/delivery-intel/capacity/consume
   */
  async consumeCapacity(req, res, next) {
    try {
      const { count = 1 } = req.body || {};
      const result = deliveryIntelligenceService.consumeSurgeToken(Number(count));

      if (!result.allowed) {
        res.set('Retry-After', String(Math.ceil(result.retryAfterSec || 1)));
        return res.status(429).json({
          status: 'error',
          message: 'Surge dispatch throttled: capacity limit reached',
          data: result,
        });
      }

      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (err) {
      next(err);
    }
  },
};

module.exports = deliveryIntelligenceController;
