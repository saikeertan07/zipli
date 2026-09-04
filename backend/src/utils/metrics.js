const { cacheService } = require('../services/cache.service');
const { queueService } = require('../services/queue.service');
const { getPoolStats } = require('../config/db');

// Standard latency histogram buckets in seconds
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];

class Histogram {
  constructor(name, help, buckets = DEFAULT_BUCKETS) {
    this.name = name;
    this.help = help;
    this.buckets = [...buckets].sort((a, b) => a - b);
    this.counts = new Map(); // bucketLe -> count
    this.buckets.forEach((b) => this.counts.set(b, 0));
    this.counts.set(Infinity, 0);
    this.sum = 0;
    this.totalCount = 0;
  }

  observe(value) {
    if (typeof value !== 'number' || isNaN(value)) return;
    this.sum += value;
    this.totalCount++;
    for (const b of this.buckets) {
      if (value <= b) {
        this.counts.set(b, this.counts.get(b) + 1);
      }
    }
    this.counts.set(Infinity, this.counts.get(Infinity) + 1);
  }

  toPrometheus() {
    let lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const b of this.buckets) {
      lines.push(`${this.name}_bucket{le="${b}"} ${this.counts.get(b)}`);
    }
    lines.push(`${this.name}_bucket{le="+Inf"} ${this.counts.get(Infinity)}`);
    lines.push(`${this.name}_sum ${Number(this.sum.toFixed(6))}`);
    lines.push(`${this.name}_count ${this.totalCount}`);
    return lines.join('\n');
  }
}

class Counter {
  constructor(name, help) {
    this.name = name;
    this.help = help;
    this.values = new Map(); // labelStr -> count
  }

  inc(labels = {}, delta = 1) {
    const labelKey = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .sort()
      .join(',');
    const current = this.values.get(labelKey) || 0;
    this.values.set(labelKey, current + delta);
  }

  toPrometheus() {
    let lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (this.values.size === 0) {
      lines.push(`${this.name} 0`);
    } else {
      for (const [labels, val] of this.values.entries()) {
        const labelPart = labels ? `{${labels}}` : '';
        lines.push(`${this.name}${labelPart} ${val}`);
      }
    }
    return lines.join('\n');
  }
}

class MetricsRegistry {
  constructor() {
    this.httpRequestsTotal = new Counter(
      'http_requests_total',
      'Total number of HTTP requests processed'
    );
    this.httpRequestDuration = new Histogram(
      'http_request_duration_seconds',
      'HTTP request duration in seconds',
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2]
    );
    this.searchDuration = new Histogram(
      'search_duration_seconds',
      'Search catalog engine latency in seconds',
      [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25]
    );
    this.dispatchDuration = new Histogram(
      'dispatch_optimization_seconds',
      'Delivery dispatch solver optimization latency in seconds',
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.5, 1]
    );
  }

  /**
   * Express middleware recording request counts and latency histograms.
   */
  middleware() {
    return (req, res, next) => {
      // Exclude /metrics from recursive measurement
      if (req.path === '/metrics') {
        return next();
      }

      const start = process.hrtime.bigint();

      res.on('finish', () => {
        const end = process.hrtime.bigint();
        const durationSec = Number(end - start) / 1e9;

        // Normalize route path to prevent high cardinality (e.g. /api/products/123 -> /api/products/:id)
        let route = req.baseUrl + (req.route ? req.route.path : req.path);
        route = route.replace(/\/\d+/g, '/:id');

        this.httpRequestsTotal.inc({
          method: req.method,
          status: res.statusCode,
          route,
        });

        this.httpRequestDuration.observe(durationSec);
      });

      next();
    };
  }

  observeSearch(durationSec) {
    this.searchDuration.observe(durationSec);
  }

  observeDispatch(durationSec) {
    this.dispatchDuration.observe(durationSec);
  }

  /**
   * Serializes current metrics into Prometheus text format.
   * @returns {string}
   */
  getPrometheusMetrics() {
    const lines = [];

    // 1. HTTP Metrics
    lines.push(this.httpRequestsTotal.toPrometheus());
    lines.push('');
    lines.push(this.httpRequestDuration.toPrometheus());
    lines.push('');

    // 2. Search & Dispatch Histograms
    lines.push(this.searchDuration.toPrometheus());
    lines.push('');
    lines.push(this.dispatchDuration.toPrometheus());
    lines.push('');

    // 3. Process & System Gauges
    const mem = process.memoryUsage();
    lines.push('# HELP process_resident_memory_bytes Resident memory size in bytes');
    lines.push('# TYPE process_resident_memory_bytes gauge');
    lines.push(`process_resident_memory_bytes ${mem.rss}`);
    lines.push('');

    lines.push('# HELP process_heap_used_bytes Heap memory used in bytes');
    lines.push('# TYPE process_heap_used_bytes gauge');
    lines.push(`process_heap_used_bytes ${mem.heapUsed}`);
    lines.push('');

    lines.push('# HELP process_uptime_seconds Process uptime in seconds');
    lines.push('# TYPE process_uptime_seconds gauge');
    lines.push(`process_uptime_seconds ${Math.round(process.uptime())}`);
    lines.push('');

    // 4. Cache Hit Ratio & Counters
    try {
      const stats = cacheService.getStats();
      lines.push('# HELP cache_hits_total Total cache hits by tier');
      lines.push('# TYPE cache_hits_total counter');
      lines.push(`cache_hits_total{tier="l1_lru"} ${stats.l1.lru.hits}`);
      lines.push(`cache_hits_total{tier="l1_lfu"} ${stats.l1.lfu.hits}`);
      lines.push(`cache_hits_total{tier="l2_redis"} ${stats.l2.hits}`);
      lines.push('');

      lines.push('# HELP cache_misses_total Total cache misses by tier');
      lines.push('# TYPE cache_misses_total counter');
      lines.push(`cache_misses_total{tier="l1_lru"} ${stats.l1.lru.misses}`);
      lines.push(`cache_misses_total{tier="l1_lfu"} ${stats.l1.lfu.misses}`);
      lines.push(`cache_misses_total{tier="l2_redis"} ${stats.l2.misses}`);
      lines.push('');

      const totalHits = stats.l1.lru.hits + stats.l1.lfu.hits + stats.l2.hits;
      const totalMisses = stats.l1.lru.misses + stats.l1.lfu.misses + stats.l2.misses;
      const overallRatio = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0;

      lines.push('# HELP cache_hit_ratio Current aggregated cache hit ratio (0.0 to 1.0)');
      lines.push('# TYPE cache_hit_ratio gauge');
      lines.push(`cache_hit_ratio ${Number(overallRatio.toFixed(4))}`);
      lines.push('');
    } catch {}

    // 5. Job Queue Depth & DLQ
    try {
      const qStats = queueService.getDashboardStats();
      lines.push('# HELP queue_depth Current count of jobs waiting in background queues');
      lines.push('# TYPE queue_depth gauge');
      for (const [qName, counts] of Object.entries(qStats)) {
        lines.push(`queue_depth{queue="${qName}"} ${counts.waiting}`);
      }
      lines.push('');

      lines.push('# HELP queue_dlq_depth Current count of jobs in Dead Letter Queue (DLQ)');
      lines.push('# TYPE queue_dlq_depth gauge');
      for (const [qName, counts] of Object.entries(qStats)) {
        lines.push(`queue_dlq_depth{queue="${qName}"} ${counts.dlq}`);
      }
      lines.push('');
    } catch {}

    // 6. DB Connection Pool
    try {
      const pStats = getPoolStats();
      lines.push('# HELP db_pool_connections Database connection pool statistics');
      lines.push('# TYPE db_pool_connections gauge');
      lines.push(`db_pool_connections{state="total"} ${pStats.total || 0}`);
      lines.push(`db_pool_connections{state="idle"} ${pStats.idle || 0}`);
      lines.push(`db_pool_connections{state="waiting"} ${pStats.waiting || 0}`);
      lines.push('');
    } catch {}

    return lines.join('\n');
  }
}

const metricsRegistry = new MetricsRegistry();

module.exports = {
  metricsRegistry,
  Histogram,
  Counter,
  MetricsRegistry,
};
