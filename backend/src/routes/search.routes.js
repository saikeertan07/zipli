const { Router } = require('express');
const { query: queryValidator } = require('express-validator');
const validate = require('../middleware/validate');
const {
  searchCatalog,
  suggestCatalog,
  facetsCatalog,
} = require('../controllers/search.controller');

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
  searchCatalog
);

router.get(
  '/suggest',
  [queryValidator('limit').optional().isInt({ min: 1, max: 20 }).withMessage('limit must be 1-20')],
  validate,
  suggestCatalog
);

router.get('/facets', facetsCatalog);

module.exports = router;
