/**
 * @file recommendation.service.js
 * @description Orchestrates pure DSA recommendation engines: FP-Growth association rules,
 * Item-Item Collaborative Filtering, Reorder Predictor, Hybrid Ranker, and Multi-Armed Bandit.
 * Zero external ML dependencies.
 */

const { fpGrowth } = require('../algo/fpGrowth');
const { ItemItemCollaborativeFiltering } = require('../algo/collaborativeFiltering');
const { ReorderPredictor } = require('../algo/reorderPredictor');
const { HybridRecommender } = require('../algo/hybridRecommender');
const { ThompsonSamplingBandit } = require('../algo/bandit');
const { getVariant } = require('../algo/abTesting');
const logger = require('../utils/logger');
const { pool } = require('../config/db');

const DEFAULT_RAILS = ['trending', 'featured', 'buy_again', 'category_deals'];

class RecommendationService {
  constructor() {
    this.hybrid = new HybridRecommender();
    this.cf = new ItemItemCollaborativeFiltering();
    this.reorder = new ReorderPredictor();
    this.bandit = new ThompsonSamplingBandit(
      ['trending', 'featured', 'buy_again', 'category_deals', 'bought_together'],
      { priorAlpha: 2, priorBeta: 20 }
    );
    this.catalog = new Map();
    this.initialized = false;
  }

  /**
   * Initializes catalog and recommendation models from PostgreSQL.
   *
   * @param {Object} [dbPool=pool]
   */
  async init(dbPool = pool) {
    try {
      // 1. Load active catalog
      const { rows: products } = await dbPool.query(
        `SELECT id, name, qty_label AS qty, price, mrp, emoji, category_id, category_id AS cat,
                badge, stock, is_active
         FROM products
         WHERE is_active = true`
      );

      this.catalog.clear();
      for (const p of products) {
        this.catalog.set(String(p.id), p);
      }
      this.hybrid.setCatalog(products);

      // 2. Load existing association rules from DB
      const { rows: dbRules } = await dbPool.query(
        `SELECT antecedent_id, consequent_id, support, confidence, lift
         FROM product_associations
         ORDER BY lift DESC
         LIMIT 2000`
      );

      if (dbRules.length > 0) {
        const formattedRules = dbRules.map((r) => ({
          antecedent: [String(r.antecedent_id)],
          consequent: [String(r.consequent_id)],
          confidence: parseFloat(r.confidence),
          lift: parseFloat(r.lift),
        }));
        this.hybrid.loadAssociationRules(formattedRules);
      }

      // 3. Train on past order items if available
      await this.trainModels(dbPool);

      this.initialized = true;
      logger.info({
        message: 'RecommendationService successfully initialized',
        catalogCount: products.length,
        rulesCount: dbRules.length,
      });

      return {
        catalogCount: products.length,
        rulesCount: dbRules.length,
      };
    } catch (err) {
      logger.error({
        message: 'Failed to initialize RecommendationService',
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Mines frequent patterns and trains collaborative filtering & reorder models.
   *
   * @param {Object} [dbPool=pool]
   */
  async trainModels(dbPool = pool) {
    try {
      // Fetch completed / confirmed order items
      const { rows: orderItems } = await dbPool.query(
        `SELECT o.id AS order_id, o.user_id, oi.product_id, o.created_at
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE o.status IN ('PAID', 'CONFIRMED', 'OUT_FOR_DELIVERY', 'DELIVERED')
         ORDER BY o.created_at ASC`
      );

      if (orderItems.length === 0) {
        return;
      }

      // A. Group by order_id to construct transactions for FP-Growth
      const orderGroups = new Map();
      const userInteractions = [];
      const userProductHistories = new Map(); // "userId:productId" -> timestamps[]
      const trendingEvents = [];

      for (const item of orderItems) {
        const oId = String(item.order_id);
        const pId = String(item.product_id);
        const uId = String(item.user_id);

        if (!orderGroups.has(oId)) {
          orderGroups.set(oId, []);
        }
        orderGroups.get(oId).push(pId);

        userInteractions.push({ userId: uId, itemId: pId, weight: 1.0 });

        const upKey = `${uId}:${pId}`;
        if (!userProductHistories.has(upKey)) {
          userProductHistories.set(upKey, {
            userId: item.user_id,
            productId: item.product_id,
            dates: [],
          });
        }
        userProductHistories.get(upKey).dates.push(item.created_at);

        trendingEvents.push({ productId: pId, timestamp: item.created_at });
      }

      // Train FP-Growth on transactions
      const transactions = Array.from(orderGroups.values());
      if (transactions.length >= 2) {
        const minSup = Math.max(0.01, 2 / transactions.length);
        const { rules } = fpGrowth(transactions, {
          minSupport: minSup,
          minConfidence: 0.1,
          maxItemsetSize: 3,
        });

        if (rules.length > 0) {
          this.hybrid.loadAssociationRules(rules);

          // Persist mined rules to DB
          for (const rule of rules) {
            for (const ante of rule.antecedent) {
              for (const conseq of rule.consequent) {
                if (ante !== conseq) {
                  await dbPool.query(
                    `INSERT INTO product_associations (antecedent_id, consequent_id, support, confidence, lift, algorithm)
                     VALUES ($1, $2, $3, $4, $5, 'fp_growth')
                     ON CONFLICT (antecedent_id, consequent_id, algorithm)
                     DO UPDATE SET support = EXCLUDED.support, confidence = EXCLUDED.confidence, lift = EXCLUDED.lift`,
                    [
                      parseInt(ante, 10),
                      parseInt(conseq, 10),
                      rule.support,
                      rule.confidence,
                      rule.lift,
                    ]
                  );
                }
              }
            }
          }
        }
      }

      // Train Item-Item Collaborative Filtering
      this.cf.buildMatrix(userInteractions, { minCoOccurrences: 1 });

      // Calculate and store user reorder habits
      for (const record of userProductHistories.values()) {
        const product = this.catalog.get(String(record.productId));
        const category = product ? product.category_id || product.cat : 'default';
        const gapInfo = this.reorder.estimatePurchaseGap(record.dates, category);
        const lastPurchased = record.dates[record.dates.length - 1];

        await dbPool.query(
          `INSERT INTO user_reorder_habits (user_id, product_id, order_count, typical_gap_days, last_purchased_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, product_id)
           DO UPDATE SET order_count = EXCLUDED.order_count,
                         typical_gap_days = EXCLUDED.typical_gap_days,
                         last_purchased_at = EXCLUDED.last_purchased_at`,
          [
            record.userId,
            record.productId,
            record.dates.length,
            gapInfo.typicalGapDays,
            lastPurchased,
          ]
        );
      }

      // Load trending events into Hybrid Recommender
      this.hybrid.loadTrendingEvents(trendingEvents);

      // Load historical A/B clicks into Bandit
      const { rows: abFeedback } = await dbPool.query(
        `SELECT event_type, metadata->>'railId' AS rail_id, COUNT(*) AS count
         FROM ab_events
         WHERE experiment_key = 'home_rails_ranking'
           AND metadata->>'railId' IS NOT NULL
         GROUP BY event_type, metadata->>'railId'`
      );

      for (const row of abFeedback) {
        if (row.rail_id) {
          const isPositive = row.event_type === 'click' || row.event_type === 'conversion';
          const cnt = parseInt(row.count, 10) || 0;
          for (let i = 0; i < cnt; i++) {
            this.bandit.recordFeedback(row.rail_id, isPositive);
          }
        }
      }
    } catch (trainErr) {
      logger.warn({
        message: 'Non-fatal warning during model training',
        error: trainErr.message,
      });
    }
  }

  /**
   * Generates ranked homepage rails ordered by Multi-Armed Bandit or control order.
   *
   * @param {number|string|null} userId
   * @param {Object} [dbPool=pool]
   * @returns {Promise<{ variant: string, rails: Array<Object> }>}
   */
  async getHomeRails(userId = null, dbPool = pool) {
    const experimentKey = 'home_rails_ranking';
    const variant = getVariant(userId || `anon_${Date.now() % 1000}`, experimentKey);

    let railOrder;
    if (variant === 'treatment') {
      const rankedArms = this.bandit.rankArms();
      railOrder = rankedArms.map((a) => a.armId);
    } else {
      railOrder = [...DEFAULT_RAILS];
    }

    // Populate items for each rail
    const populatedRails = [];

    for (const railId of railOrder) {
      let items = [];
      let title = '';

      switch (railId) {
        case 'buy_again':
          title = 'Buy It Again';
          if (userId) {
            const feed = await this.getBuyAgainFeed(userId, 8, dbPool);
            items = feed.items;
          }
          if (items.length === 0) {
            // Cold start fallback to top essentials
            items = this.hybrid.getColdStartRecommendations(null, 8).map((r) => r.product);
          }
          break;

        case 'trending':
          title = 'Trending in Your Area';
          items = this.hybrid.getColdStartRecommendations(null, 8).map((r) => r.product);
          break;

        case 'featured':
          title = 'Handpicked For You';
          items = Array.from(this.catalog.values())
            .filter((p) => p.badge && (p.stock === undefined || p.stock > 0))
            .slice(0, 8);
          if (items.length === 0) {
            items = this.hybrid.getColdStartRecommendations(null, 8).map((r) => r.product);
          }
          break;

        case 'category_deals':
          title = 'Steal Deals';
          items = Array.from(this.catalog.values())
            .filter(
              (p) => p.mrp && p.price && p.mrp > p.price && (p.stock === undefined || p.stock > 0)
            )
            .sort((a, b) => b.mrp - b.price - (a.mrp - a.price))
            .slice(0, 8);
          break;

        case 'bought_together':
          title = 'Frequently Bought Together';
          items = this.hybrid.getColdStartRecommendations(null, 8).map((r) => r.product);
          break;

        default:
          title = 'Popular Items';
          items = this.hybrid.getColdStartRecommendations(null, 8).map((r) => r.product);
      }

      if (items.length > 0) {
        populatedRails.push({
          id: railId,
          title,
          items,
        });
      }
    }

    return {
      variant,
      rails: populatedRails,
    };
  }

  /**
   * Recommendations for product detail page ("Frequently Bought Together").
   *
   * @param {number|string} productId
   * @param {number} [limit=6]
   * @returns {Array<Object>}
   */
  getProductRecommendations(productId, limit = 6) {
    return this.hybrid.recommendForProduct(productId, limit);
  }

  /**
   * Cart-aware complementary upsells ("Complete Your Meal").
   *
   * @param {Array<number|string>} [cartItemIds=[]]
   * @param {number} [limit=5]
   * @returns {Array<Object>}
   */
  getCartRecommendations(cartItemIds = [], limit = 5) {
    return this.hybrid.recommendForCart(cartItemIds, limit);
  }

  /**
   * Personalized replenishment feed ranked by due-ness score.
   *
   * @param {number|string} userId
   * @param {number} [limit=10]
   * @param {Object} [dbPool=pool]
   * @returns {Promise<{ items: Array<Object>, total: number }>}
   */
  async getBuyAgainFeed(userId, limit = 10, dbPool = pool) {
    if (!userId) {
      return { items: [], total: 0 };
    }

    const { rows: habits } = await dbPool.query(
      `SELECT h.user_id, h.product_id, h.order_count, h.typical_gap_days, h.last_purchased_at,
              p.id, p.name, p.qty_label AS qty, p.price, p.mrp, p.emoji, p.category_id,
              p.badge, p.stock
       FROM user_reorder_habits h
       JOIN products p ON h.product_id = p.id
       WHERE h.user_id = $1 AND p.is_active = true`,
      [userId]
    );

    if (habits.length === 0) {
      return { items: [], total: 0 };
    }

    const preparedHabits = habits.map((h) => ({
      ...h,
      typicalGapDays: parseFloat(h.typical_gap_days) || 7.0,
      lastPurchasedAt: new Date(h.last_purchased_at),
    }));

    const ranked = this.reorder.rankBuyItAgain(preparedHabits, limit);

    return {
      items: ranked,
      total: habits.length,
    };
  }

  /**
   * Generates personalized hybrid recommendations for a user blending CF,
   * replenishment habit due-ness, cart associations, and trending popularity.
   * Enforces diversity guardrail (maxPerCategory) and explainability strings.
   *
   * @param {number|string|null} userId
   * @param {Object} [options={}]
   * @param {Array<number|string>} [options.cartItemIds=[]]
   * @param {number} [options.limit=10]
   * @param {number} [options.maxPerCategory=3]
   * @param {Object} [dbPool=pool]
   * @returns {Promise<Array<Object>>}
   */
  async getPersonalizedRecommendations(userId = null, options = {}, dbPool = pool) {
    const { cartItemIds = [], limit = 10, maxPerCategory = 3 } = options;

    let cfRecommendations = [];
    let dueItems = [];

    if (userId) {
      // 1. Fetch CF recommendations
      cfRecommendations = this.cf.recommendForUser(userId, limit * 2, cartItemIds);

      // 2. Fetch reorder due items
      try {
        const { rows: habits } = await dbPool.query(
          `SELECT h.user_id, h.product_id, h.order_count, h.typical_gap_days, h.last_purchased_at,
                  p.id, p.name, p.qty_label AS qty, p.price, p.mrp, p.emoji, p.category_id,
                  p.badge, p.stock
           FROM user_reorder_habits h
           JOIN products p ON h.product_id = p.id
           WHERE h.user_id = $1 AND p.is_active = true`,
          [userId]
        );
        if (habits.length > 0) {
          const prepared = habits.map((h) => ({
            ...h,
            typicalGapDays: parseFloat(h.typical_gap_days) || 7.0,
            lastPurchasedAt: new Date(h.last_purchased_at),
          }));
          dueItems = this.reorder.rankBuyItAgain(prepared, limit * 2).map((item) => ({
            ...item,
            dueScore: item.dueScore || 1.0,
          }));
        }
      } catch (err) {
        logger.warn({
          message: 'Failed fetching habits in getPersonalizedRecommendations',
          error: err.message,
        });
      }
    }

    return this.hybrid.rankHybrid(
      {
        cfRecommendations,
        dueItems,
        cartItemIds,
      },
      limit,
      { maxPerCategory }
    );
  }

  /**
   * Tracks A/B experiment impressions, clicks, or conversions.
   *
   * @param {Object} event
   * @param {string} event.experimentKey
   * @param {number|string|null} [event.userId]
   * @param {string} event.variant
   * @param {string} event.eventType - 'impression' | 'click' | 'conversion'
   * @param {Object} [event.metadata]
   * @param {Object} [dbPool=pool]
   */
  async trackEvent(event, dbPool = pool) {
    const { experimentKey, userId = null, variant, eventType, metadata = {} } = event;

    // Record in DB
    const { rows } = await dbPool.query(
      `INSERT INTO ab_events (experiment_key, user_id, variant, event_type, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [experimentKey, userId, variant, eventType, JSON.stringify(metadata)]
    );

    // Update online bandit if rail feedback
    if (metadata.railId) {
      const isPositive = eventType === 'click' || eventType === 'conversion';
      this.bandit.recordFeedback(metadata.railId, isPositive);
    }

    return rows[0];
  }
}

// Singleton instance
const recommendationService = new RecommendationService();

module.exports = {
  RecommendationService,
  recommendationService,
};
