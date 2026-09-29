const { Router } = require('express');
const { listCategories } = require('../controllers/category.controller');

const router = Router();

router.get('/', listCategories);

module.exports = router;
