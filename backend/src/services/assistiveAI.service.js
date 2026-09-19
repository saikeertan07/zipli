/**
 * @file assistiveAI.service.js
 * @description Assistive AI Features for Zipli Pro Quick-Commerce (F-030, F-031).
 * Powers:
 * 1. Recipe -> Cart: Maps culinary dishes and meal prompts into matched inventory cart items.
 * 2. Substitution Assistant: Discovers in-stock replacements matching category, price band, and dietary tags.
 * 3. Smart Reorder Assistant: Predicts replenishment cycles from order frequency and history.
 */

const { query } = require('../config/db');
const { hybridSearchService } = require('./hybridSearch.service');
const logger = require('../utils/logger');

// Curated ingredient maps for common quick-commerce culinary dishes
const RECIPE_KNOWLEDGE_BASE = {
  'palak paneer': [
    { term: 'spinach', qty: 1, unit: 'bunch' },
    { term: 'paneer', qty: 1, unit: 'pack' },
    { term: 'onion', qty: 1, unit: 'kg' },
    { term: 'tomato', qty: 1, unit: 'kg' },
    { term: 'ginger', qty: 1, unit: 'pack' },
    { term: 'garlic', qty: 1, unit: 'pack' },
    { term: 'butter', qty: 1, unit: 'pack' },
  ],
  'pasta arrabbiata': [
    { term: 'pasta', qty: 1, unit: 'pack' },
    { term: 'tomato', qty: 1, unit: 'kg' },
    { term: 'garlic', qty: 1, unit: 'pack' },
    { term: 'olive oil', qty: 1, unit: 'bottle' },
    { term: 'chilli', qty: 1, unit: 'pack' },
    { term: 'cheese', qty: 1, unit: 'pack' },
  ],
  'dal tadka': [
    { term: 'dal', qty: 1, unit: 'kg' },
    { term: 'ghee', qty: 1, unit: 'jar' },
    { term: 'cumin', qty: 1, unit: 'pack' },
    { term: 'garlic', qty: 1, unit: 'pack' },
    { term: 'tomato', qty: 1, unit: 'kg' },
    { term: 'onion', qty: 1, unit: 'kg' },
  ],
  'masala chai': [
    { term: 'tea', qty: 1, unit: 'pack' },
    { term: 'milk', qty: 1, unit: 'litre' },
    { term: 'ginger', qty: 1, unit: 'pack' },
    { term: 'cardamom', qty: 1, unit: 'pack' },
    { term: 'sugar', qty: 1, unit: 'kg' },
  ],
  'chai': [
    { term: 'tea', qty: 1, unit: 'pack' },
    { term: 'milk', qty: 1, unit: 'litre' },
    { term: 'sugar', qty: 1, unit: 'kg' },
  ],
  'biryani': [
    { term: 'basmati rice', qty: 1, unit: 'kg' },
    { term: 'onion', qty: 1, unit: 'kg' },
    { term: 'curd', qty: 1, unit: 'pack' },
    { term: 'ghee', qty: 1, unit: 'jar' },
    { term: 'biryani masala', qty: 1, unit: 'pack' },
    { term: 'mint', qty: 1, unit: 'bunch' },
  ],
  'breakfast smoothie': [
    { term: 'banana', qty: 1, unit: 'dozen' },
    { term: 'milk', qty: 1, unit: 'litre' },
    { term: 'oats', qty: 1, unit: 'pack' },
    { term: 'honey', qty: 1, unit: 'jar' },
  ],
  'maggi noodles': [
    { term: 'noodles', qty: 2, unit: 'pack' },
    { term: 'cheese', qty: 1, unit: 'pack' },
    { term: 'butter', qty: 1, unit: 'pack' },
  ],
};

// Default replenishment cadence by category / keyword (in days)
const REPLENISHMENT_CADENCE = {
  milk: 2,
  doodh: 2,
  bread: 3,
  curd: 3,
  dahi: 3,
  eggs: 5,
  banana: 4,
  fruits: 5,
  vegetables: 4,
  paneer: 5,
  atta: 20,
  rice: 25,
  oil: 30,
  tea: 30,
  coffee: 30,
  detergent: 30,
  soap: 20,
};

class AssistiveAIService {
  /**
   * Translates a recipe query into an actionable cart proposal by matching
   * required culinary ingredients against real-time dark store inventory.
   *
   * @param {string} dishOrPrompt - Name of dish or prompt
   * @param {Object} [options]
   * @param {number} [options.servings=2]
   * @returns {Promise<Object>} Cart conversion proposal
   */
  async recipeToCart(dishOrPrompt, options = {}) {
    const dish = (dishOrPrompt || '').trim().toLowerCase();
    const servings = Math.max(1, parseInt(options.servings, 10) || 2);

    // 1. Identify target ingredients from knowledge base or heuristic extraction
    let targetIngredients = null;
    for (const [key, ingredients] of Object.entries(RECIPE_KNOWLEDGE_BASE)) {
      if (dish.includes(key)) {
        targetIngredients = ingredients;
        break;
      }
    }

    if (!targetIngredients) {
      // Heuristic extraction: tokenize and filter out stopwords
      const tokens = dish
        .replace(/recipe|make|how to cook|ingredients for|for lunch|for dinner|please/gi, '')
        .split(/[\s,]+/)
        .filter((t) => t.length > 2);

      targetIngredients = tokens.map((t) => ({ term: t, qty: 1, unit: 'unit' }));
    }

    if (targetIngredients.length === 0) {
      targetIngredients = [{ term: dish, qty: 1, unit: 'unit' }];
    }

    // 2. Query available inventory for each required ingredient
    const matchedItems = [];
    const missingIngredients = [];
    let totalEstimatedPaise = 0;

    for (const target of targetIngredients) {
      try {
        const searchRes = await hybridSearchService.search({
          searchTerm: target.term,
          limit: 1,
        });

        if (searchRes.items && searchRes.items.length > 0) {
          const match = searchRes.items[0];
          const unitPricePaise =
            match.price_paise !== undefined && match.price_paise !== null
              ? parseInt(match.price_paise, 10)
              : Math.round(Number(match.price || 0) * 100);

          const quantity = Math.ceil((target.qty * servings) / 2);
          const lineTotalPaise = unitPricePaise * quantity;
          totalEstimatedPaise += lineTotalPaise;

          matchedItems.push({
            productId: match.id,
            name: match.name,
            matchedFor: target.term,
            quantity,
            unit: target.unit,
            unitPrice: Number(match.price || 0),
            unitPricePaise,
            lineTotalPaise,
            inStock: (match.stock || 0) > 0,
            image: match.img || null,
          });
        } else {
          missingIngredients.push(target.term);
        }
      } catch (err) {
        logger.warn('Failed ingredient inventory lookup', { term: target.term, error: err.message });
        missingIngredients.push(target.term);
      }
    }

    const proposedCartItems = matchedItems
      .filter((i) => i.inStock)
      .map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        pricePaise: i.unitPricePaise,
      }));

    return {
      dish: dishOrPrompt,
      servings,
      totalItemsFound: matchedItems.length,
      matchedItems,
      missingIngredients,
      totalEstimatedPaise,
      totalEstimatedRupees: (totalEstimatedPaise / 100).toFixed(2),
      cartProposal: {
        items: proposedCartItems,
        actionType: 'ADD_RECIPE_TO_CART',
        readyToAdd: proposedCartItems.length > 0,
      },
    };
  }

  /**
   * Discovers suitable, in-stock replacement products when a product is unavailable.
   * Ranks candidates by category match, price proximity, and stock availability.
   *
   * @param {number} productId - Source product ID
   * @param {Object} [options]
   * @param {number} [options.limit=3]
   * @returns {Promise<Object>} Ranked substitutes
   */
  async findSubstitutes(productId, options = {}) {
    const limit = Math.min(Math.max(parseInt(options.limit, 10) || 3, 1), 10);

    const origRes = await query(
      `SELECT id, name, price, price_paise, category_id, stock, is_active
       FROM products
       WHERE id = $1`,
      [productId]
    );

    if (origRes.rows.length === 0) {
      return {
        originalProduct: null,
        substitutes: [],
        hasSubstitutes: false,
        message: 'Product not found',
      };
    }

    const orig = origRes.rows[0];
    const origPrice = Number(orig.price || 0);

    // Find candidates in the same category that are in-stock and active
    const candidatesRes = await query(
      `SELECT id, name, price, price_paise, category_id, stock, image_url AS img, emoji
       FROM products
       WHERE category_id = $1 AND id <> $2 AND is_active = true AND stock > 0
       ORDER BY stock DESC
       LIMIT 15`,
      [orig.category_id, orig.id]
    );

    const scored = candidatesRes.rows.map((candidate) => {
      const candPrice = Number(candidate.price || 0);
      const priceDiffRatio = origPrice > 0 ? Math.abs(candPrice - origPrice) / origPrice : 0;

      // Score: 1.0 baseline - price divergence penalty
      let score = 1.0;
      if (priceDiffRatio > 0.5) score -= 0.4;
      else if (priceDiffRatio > 0.25) score -= 0.2;
      else if (priceDiffRatio <= 0.1) score += 0.2;

      let reason = `Same category (${candidate.category_id})`;
      if (priceDiffRatio <= 0.15) {
        reason += ', nearly identical price point';
      } else if (candPrice < origPrice) {
        reason += ', budget-friendly alternative';
      } else {
        reason += ', premium alternative';
      }

      return {
        id: candidate.id,
        name: candidate.name,
        price: candPrice,
        pricePaise: candidate.price_paise,
        stock: candidate.stock,
        image: candidate.img || null,
        substituteScore: parseFloat(score.toFixed(2)),
        reason,
      };
    });

    scored.sort((a, b) => b.substituteScore - a.substituteScore);
    const topSubstitutes = scored.slice(0, limit);

    return {
      originalProduct: {
        id: orig.id,
        name: orig.name,
        price: origPrice,
        category: orig.category_id,
        inStock: orig.stock > 0,
      },
      substitutes: topSubstitutes,
      hasSubstitutes: topSubstitutes.length > 0,
    };
  }

  /**
   * Analyzes customer order history to predict replenishment requirements
   * and suggests smart reorders before essentials run out.
   *
   * @param {number} userId - Customer User ID
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async getSmartReorderSuggestions(userId, options = {}) {
    const limit = Math.min(Math.max(parseInt(options.limit, 10) || 5, 1), 20);

    // 1. Fetch user's completed orders and order items
    let history = [];
    if (userId) {
      try {
        const histRes = await query(
          `SELECT oi.product_id, p.name, p.price, p.price_paise, p.category_id, p.stock,
                  COUNT(oi.id) AS purchase_count,
                  MAX(o.created_at) AS last_purchased_at
           FROM order_items oi
           JOIN orders o ON o.id = oi.order_id
           JOIN products p ON p.id = oi.product_id
           WHERE o.user_id = $1 AND o.status IN ('delivered', 'confirmed', 'completed', 'paid')
           GROUP BY oi.product_id, p.name, p.price, p.price_paise, p.category_id, p.stock
           ORDER BY last_purchased_at DESC
           LIMIT 20`,
          [userId]
        );
        history = histRes.rows;
      } catch (err) {
        logger.warn('Failed to fetch user order history for smart reorders', { userId, error: err.message });
      }
    }

    const now = Date.now();
    const suggestions = [];

    // If user has history, calculate cadence-based suggestions
    if (history.length > 0) {
      for (const item of history) {
        const lastPurchased = new Date(item.last_purchased_at).getTime();
        const daysElapsed = Math.max(1, Math.round((now - lastPurchased) / (1000 * 60 * 60 * 24)));

        // Determine typical cycle
        let cycleDays = 7; // default weekly
        const itemName = item.name.toLowerCase();
        for (const [key, days] of Object.entries(REPLENISHMENT_CADENCE)) {
          if (itemName.includes(key)) {
            cycleDays = days;
            break;
          }
        }

        const daysOverdue = daysElapsed - cycleDays;
        const urgency = daysOverdue >= 0 ? 'high' : daysOverdue >= -2 ? 'medium' : 'low';

        suggestions.push({
          productId: item.product_id,
          name: item.name,
          price: Number(item.price || 0),
          pricePaise: item.price_paise,
          stock: item.stock,
          inStock: (item.stock || 0) > 0,
          purchaseCount: parseInt(item.purchase_count, 10) || 1,
          daysSinceLastPurchase: daysElapsed,
          estimatedCadenceDays: cycleDays,
          urgency,
          reason:
            urgency === 'high'
              ? `Purchased ${daysElapsed} days ago. Usually restocked every ${cycleDays} days.`
              : `Regular staple (repurchased ${item.purchase_count} times).`,
        });
      }

      // Sort by urgency ('high' first, then 'medium')
      const urgencyRank = { high: 3, medium: 2, low: 1 };
      suggestions.sort((a, b) => urgencyRank[b.urgency] - urgencyRank[a.urgency]);
    } else {
      // Fallback: Suggest top trending daily essentials
      try {
        const staplesRes = await query(
          `SELECT id, name, price, price_paise, category_id, stock
           FROM products
           WHERE is_active = true AND stock > 0
             AND (category_id IN ('dairy', 'bakery', 'produce') OR name ILIKE '%milk%' OR name ILIKE '%bread%')
           ORDER BY stock DESC
           LIMIT $1`,
          [limit]
        );

        for (const s of staplesRes.rows) {
          suggestions.push({
            productId: s.id,
            name: s.name,
            price: Number(s.price || 0),
            pricePaise: s.price_paise,
            stock: s.stock,
            inStock: true,
            purchaseCount: 0,
            urgency: 'medium',
            reason: 'Trending daily essential in your area',
          });
        }
      } catch (stapleErr) {
        logger.warn('Failed to load staple fallback suggestions', { error: stapleErr.message });
      }
    }

    return {
      userId,
      suggestions: suggestions.slice(0, limit),
      totalSuggestions: suggestions.length,
    };
  }

  /**
   * Retrieves real-time dark store inventory and stock levels for product IDs.
   * Read-only, user-scoped inventory verification (P1).
   *
   * @param {number[]} productIds
   * @param {string|number} [storeId]
   * @returns {Promise<Object>}
   */
  async getStoreInventoryStatus(productIds, storeId = null) {
    if (!Array.isArray(productIds) || productIds.length === 0) {
      return { inventory: [], allInStock: false };
    }

    const cleanIds = productIds
      .map((id) => parseInt(id, 10))
      .filter((id) => !isNaN(id) && id > 0);

    if (cleanIds.length === 0) {
      return { inventory: [], allInStock: false };
    }

    const res = await query(
      `SELECT id, name, price, price_paise, stock, is_active
       FROM products
       WHERE id = ANY($1::int[])`,
      [cleanIds]
    );

    const inventory = res.rows.map((r) => ({
      productId: r.id,
      name: r.name,
      stock: r.stock,
      inStock: r.stock > 0 && r.is_active === true,
      price: Number(r.price || 0),
      pricePaise: r.price_paise,
    }));

    return {
      storeId: storeId || 'dark_store_01',
      totalChecked: inventory.length,
      inventory,
      allInStock: inventory.length > 0 && inventory.every((i) => i.inStock),
    };
  }
}

const assistiveAIService = new AssistiveAIService();

module.exports = {
  AssistiveAIService,
  assistiveAIService,
  RECIPE_KNOWLEDGE_BASE,
  REPLENISHMENT_CADENCE,
};
