/**
 * @file deliveryIntelligence.routes.js
 * @description Routes for Delivery Intelligence (Graph routing, Hungarian matching,
 * Clarke-Wright VRP, SegmentTree slots, SGD ETA, and surge limiters).
 */

const express = require('express');
const router = express.Router();
const deliveryIntelligenceController = require('../controllers/deliveryIntelligence.controller');

router.post('/route', deliveryIntelligenceController.calculateRoute);
router.post('/match', deliveryIntelligenceController.matchOrders);
router.post('/batch', deliveryIntelligenceController.optimizeBatch);

router.get('/slots', deliveryIntelligenceController.getSlots);
router.post('/slots/reserve', deliveryIntelligenceController.reserveSlot);

router.post('/eta', deliveryIntelligenceController.predictETA);
router.post('/eta/feedback', deliveryIntelligenceController.feedETAFeedback);

router.get('/capacity', deliveryIntelligenceController.getCapacity);
router.post('/capacity/consume', deliveryIntelligenceController.consumeCapacity);

module.exports = router;
