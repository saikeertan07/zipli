/**
 * @file search.controller.js
 * @description Dedicated endpoints for search, autocomplete suggestions, and facet aggregations.
 * Backed by the pure in-memory SearchEngine.
 */

const asyncHandler = require('../utils/asyncHandler');
const { catalogSearchService } = require('../services/catalogSearch.service');
const { hybridSearchService } = require('../services/hybridSearch.service');

// GET /search or /api/search?q=milk&category=dairy&page=1&limit=50&explain=1
const searchCatalog = asyncHandler(async (req, res) => {
  const query = req.query.q || req.query.search || '';
  const category = req.query.category || req.query.cat;
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = (page - 1) * limit;
  const explain = req.query.explain === '1' || req.query.explain === 'true';

  const categoryFilter = category && category !== 'all' ? category : null;

  if (req.query.mode === 'hybrid' || req.query.hybrid === 'true') {
    const hybridRes = await hybridSearchService.search({
      searchTerm: query,
      category: categoryFilter,
      limit,
    });
    return res.json({
      status: 'success',
      mode: 'hybrid',
      results: hybridRes.items.length,
      total: hybridRes.total,
      page,
      limit,
      sourcesUsed: hybridRes.sourcesUsed,
      tookMs: hybridRes.tookMs,
      data: {
        products: hybridRes.items,
        sourcesUsed: hybridRes.sourcesUsed,
        pagination: {
          page,
          limit,
          total: hybridRes.total,
          totalPages: Math.ceil(hybridRes.total / limit),
        },
      },
    });
  }

  if (!catalogSearchService.initialized) {
    await catalogSearchService.init();
  }

  const searchResult = catalogSearchService.search(query, {
    category: categoryFilter,
    offset,
    limit,
    explain,
  });

  const products = searchResult.results.map((r) => ({
    ...r.product,
    _score: r.score,
    ...(r.explanation ? { _explanation: r.explanation } : {}),
  }));

  const total = searchResult.total;
  const totalPages = Math.ceil(total / limit);

  res.json({
    status: 'success',
    results: products.length,
    total,
    page,
    limit,
    correctedQuery: searchResult.correctedQuery,
    facets: searchResult.facets,
    data: {
      products,
      facets: searchResult.facets,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    },
  });
});

// GET /search/suggest or /api/search/suggest?q=mi
const suggestCatalog = asyncHandler(async (req, res) => {
  const query = req.query.q || req.query.prefix || req.query.search || '';
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 5, 1), 20);

  if (!catalogSearchService.initialized) {
    await catalogSearchService.init();
  }

  const suggestions = catalogSearchService.suggest(query, limit);

  // Return both raw array of string suggestions and wrapped response
  res.json(suggestions);
});

// GET /search/facets or /api/search/facets?q=organic
const facetsCatalog = asyncHandler(async (req, res) => {
  const query = req.query.q || req.query.search || '';

  if (!catalogSearchService.initialized) {
    await catalogSearchService.init();
  }

  const facets = catalogSearchService.getFacets(query);

  res.json({
    status: 'success',
    data: {
      facets,
    },
  });
});

module.exports = {
  searchCatalog,
  suggestCatalog,
  facetsCatalog,
};
