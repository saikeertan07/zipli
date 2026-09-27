const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/categories
const listCategories = asyncHandler(async (req, res) => {
  const { rows } = await query(
    "SELECT id, name, emoji FROM categories ORDER BY id = 'all' DESC, name ASC"
  );
  res.json({ status: 'success', results: rows.length, data: { categories: rows } });
});

module.exports = { listCategories };
