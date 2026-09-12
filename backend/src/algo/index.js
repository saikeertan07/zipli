const stateMachine = require('./stateMachine');
const couponEngine = require('./couponEngine');
const tokenizer = require('./tokenizer');
const levenshtein = require('./levenshtein');
const trie = require('./trie');
const bm25 = require('./bm25');
const invertedIndex = require('./invertedIndex');
const searchEngine = require('./searchEngine');
const bkTree = require('./bkTree');
const synonyms = require('./synonyms');
const apriori = require('./apriori');
const fpGrowth = require('./fpGrowth');
const collaborativeFiltering = require('./collaborativeFiltering');
const reorderPredictor = require('./reorderPredictor');
const bandit = require('./bandit');
const abTesting = require('./abTesting');
const hybridRecommender = require('./hybridRecommender');
const geo = require('./geo');
const dispatchEngine = require('./dispatchEngine');
const etaPredictor = require('./etaPredictor');
const driverSimulation = require('./driverSimulation');
const heap = require('./heap');
const kdTree = require('./kdTree');
const graph = require('./graph');
const hungarian = require('./hungarian');
const clarkeWright = require('./clarkeWright');
const tsp = require('./tsp');
const segmentTree = require('./segmentTree');
const sgdRegressor = require('./sgdRegressor');
const rateLimiters = require('./rateLimiters');
const forecast = require('./forecast');
const inventory = require('./inventory');
const anomaly = require('./anomaly');
const dynamicPricing = require('./dynamicPricing');
const fefo = require('./fefo');
const abcXyz = require('./abcXyz');
const basketOptimizer = require('./basketOptimizer');
const bloom = require('./bloom');
const fraudDetector = require('./fraudDetector');
const hashChain = require('./hashChain');
const gcra = require('./gcra');
const lru = require('./lru');
const lfu = require('./lfu');
const deliveryFeeEngine = require('./deliveryFeeEngine');

module.exports = {
  stateMachine,
  couponEngine,
  tokenizer,
  levenshtein,
  trie,
  bm25,
  invertedIndex,
  searchEngine,
  bkTree,
  synonyms,
  apriori,
  fpGrowth,
  collaborativeFiltering,
  reorderPredictor,
  bandit,
  abTesting,
  hybridRecommender,
  geo,
  dispatchEngine,
  etaPredictor,
  driverSimulation,
  heap,
  kdTree,
  graph,
  hungarian,
  clarkeWright,
  tsp,
  segmentTree,
  sgdRegressor,
  rateLimiters,
  forecast,
  inventory,
  anomaly,
  dynamicPricing,
  fefo,
  abcXyz,
  basketOptimizer,
  bloom,
  fraudDetector,
  hashChain,
  gcra,

  // Re-exported Phase 7 core classes and utilities
  CityGraph: graph.CityGraph,
  createGridCityGraph: graph.createGridCityGraph,
  KDTree: kdTree.KDTree,
  solveHungarian: hungarian.solveHungarian,
  hungarianMatching: hungarian.solveHungarian,
  clarkeWrightVRP: clarkeWright.clarkeWrightVRP,
  optimizeBatchRoute: tsp.optimizeBatchRoute,
  SegmentTree: segmentTree.SegmentTree,
  SGDOnlineRegressor: sgdRegressor.SGDOnlineRegressor,
  TokenBucketLimiter: rateLimiters.TokenBucketLimiter,
  SlidingWindowLogLimiter: rateLimiters.SlidingWindowLogLimiter,
  calculateHaversineDistance: geo.calculateHaversineDistance,
  isValidCoordinate: geo.isValidCoordinate,

  // Re-exported Phase 8 core classes and functions
  calculateSMAPE: forecast.calculateSMAPE,
  simpleExponentialSmoothing: forecast.simpleExponentialSmoothing,
  holtLinearTrend: forecast.holtLinearTrend,
  holtWinters: forecast.holtWinters,
  forecastBestModel: forecast.forecastBestModel,
  calculateSafetyStock: inventory.calculateSafetyStock,
  calculateReorderPoint: inventory.calculateReorderPoint,
  calculateEOQ: inventory.calculateEOQ,
  evaluateReorderSuggestion: inventory.evaluateReorderSuggestion,
  calculateMedian: anomaly.calculateMedian,
  calculateMAD: anomaly.calculateMAD,
  detectRobustZOutliers: anomaly.detectRobustZOutliers,
  detectCUSUMDrift: anomaly.detectCUSUMDrift,
  calculateExpiryMarkdown: dynamicPricing.calculateExpiryMarkdown,
  calculateDemandAdjustment: dynamicPricing.calculateDemandAdjustment,
  calculateDynamicPrice: dynamicPricing.calculateDynamicPrice,
  FEFOInventoryManager: fefo.FEFOInventoryManager,
  classifyAbcXyz: abcXyz.classifyAbcXyz,
  optimizeBasketThreshold: basketOptimizer.optimizeBasketThreshold,

  // Re-exported Phase 9 core classes and functions
  BloomFilter: bloom.BloomFilter,
  calculateOptimalBloomParams: bloom.calculateOptimalBloomParams,
  calculateOptimalM: bloom.calculateOptimalM,
  calculateOptimalK: bloom.calculateOptimalK,
  extractFraudFeatures: fraudDetector.extractFraudFeatures,
  computeFraudProbability: fraudDetector.computeFraudProbability,
  evaluateFraudRisk: fraudDetector.evaluateFraudRisk,
  GENESIS_HASH: hashChain.GENESIS_HASH,
  canonicalizeJson: hashChain.canonicalizeJson,
  computeRecordHash: hashChain.computeRecordHash,
  createAuditRecord: hashChain.createAuditRecord,
  verifyAuditChain: hashChain.verifyAuditChain,
  GCRA: gcra.GCRA,
  MemoryStore: gcra.MemoryStore,
  POLICIES: gcra.POLICIES,
  RATE_LIMIT_POLICIES: gcra.POLICIES,

  // Re-exported Phase 10 core classes and functions
  LRUCache: lru.LRUCache,
  DoublyLinkedNode: lru.DoublyLinkedNode,
  LFUCache: lfu.LFUCache,
  LFUNode: lfu.LFUNode,
  deliveryFeeEngine,
  calculateDeliveryFee: deliveryFeeEngine.calculateDeliveryFee,
};
