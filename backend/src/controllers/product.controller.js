const { query } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const { catalogSearchService } = require('../services/catalogSearch.service');

// GET /api/products?category=dairy&search=milk&page=1&limit=100
const listProducts = asyncHandler(async (req, res) => {
  const category = req.query.category || req.query.cat;
  const search = req.query.search || req.query.q;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 200);
  const offset = (page - 1) * limit;

  // When search query is present, use pure In-Memory BM25 + Typo-tolerant Search Engine
  if (search) {
    if (!catalogSearchService.initialized) {
      await catalogSearchService.init();
    }

    const categoryFilter = category && category !== 'all' ? category : null;
    const searchResult = catalogSearchService.search(search, {
      category: categoryFilter,
      offset,
      limit,
    });

    const products = searchResult.results.map((r) => ({
      ...r.product,
      _score: r.score,
    }));
    const total = searchResult.total;
    const totalPages = Math.ceil(total / limit);

    return res.json({
      status: 'success',
      results: products.length,
      total,
      page,
      limit,
      correctedQuery: searchResult.correctedQuery,
      data: {
        products,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
    });
  }

  // Fallback to standard DB list when no search term is specified
  const conditions = [];
  const params = [];

  if (category && category !== 'all') {
    params.push(category);
    conditions.push(`category_id = $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM products ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  params.push(limit, offset);
  const { rows } = await query(
    `SELECT id, name, qty_label AS qty, qty_label AS weight_unit, price, mrp, emoji,
            category_id, category_id AS cat, badge, stock,
            COALESCE(NULLIF(image_url, '/images/placeholder.jpg'), '/images/products/' || id || '.jpg') AS image_url,
            ('/images/products/' || id || '.jpg') AS img
     FROM products ${whereClause}
     ORDER BY id ASC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const totalPages = Math.ceil(total / limit);

  res.json({
    status: 'success',
    results: rows.length,
    total,
    page,
    limit,
    data: {
      products: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    },
  });
});

// GET /api/products/suggest?q=mil
const suggestProducts = asyncHandler(async (req, res) => {
  const queryStr = req.query.q || req.query.prefix || req.query.search || '';
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);

  if (!catalogSearchService.initialized) {
    await catalogSearchService.init();
  }

  const suggestions = catalogSearchService.suggest(queryStr, limit);

  res.json({
    status: 'success',
    results: suggestions.length,
    data: {
      suggestions,
    },
  });
});

// GET /api/products/:id
const getProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await query(
    `SELECT id, name, qty_label AS qty, qty_label AS weight_unit, price, mrp, emoji,
            category_id, category_id AS cat, badge, stock,
            COALESCE(NULLIF(image_url, '/images/placeholder.jpg'), '/images/products/' || id || '.jpg') AS image_url,
            ('/images/products/' || id || '.jpg') AS img
     FROM products WHERE id = $1`,
    [id]
  );
  if (!rows.length) {
    throw new AppError('Product not found.', 404);
  }
  res.json({ status: 'success', data: { product: rows[0] } });
});

module.exports = { listProducts, suggestProducts, getProduct };
