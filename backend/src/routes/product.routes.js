const { Router } = require('express');
const { query: queryValidator, param } = require('express-validator');
const validate = require('../middleware/validate');
const { listProducts, suggestProducts, getProduct } = require('../controllers/product.controller');

const router = Router();

router.get(
  '/',
  [
    queryValidator('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('page must be a positive integer'),
    queryValidator('limit')
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage('limit must be 1-200'),
  ],
  validate,
  listProducts
);

// Autocomplete suggestions route must be registered BEFORE /:id to avoid id conflict
router.get(
  '/suggest',
  [queryValidator('limit').optional().isInt({ min: 1, max: 20 }).withMessage('limit must be 1-20')],
  validate,
  suggestProducts
);

router.get(
  '/:id',
  [param('id').isInt().withMessage('Product id must be an integer')],
  validate,
  getProduct
);

module.exports = router;
