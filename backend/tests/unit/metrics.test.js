const { metricsRegistry, Counter, Histogram } = require('../../src/utils/metrics');

describe('Prometheus Metrics & Observability (/utils/metrics.js)', () => {
  describe('Counter', () => {
    it('increments counter with label pairs', () => {
      const counter = new Counter('test_counter', 'A test counter');
      counter.inc({ method: 'GET', status: 200 });
      counter.inc({ method: 'GET', status: 200 });
      counter.inc({ method: 'POST', status: 201 });

      const text = counter.toPrometheus();
      expect(text).toContain('# HELP test_counter A test counter');
      expect(text).toContain('# TYPE test_counter counter');
      expect(text).toContain('test_counter{method="GET",status="200"} 2');
      expect(text).toContain('test_counter{method="POST",status="201"} 1');
    });

    it('outputs 0 when counter has no observations', () => {
      const counter = new Counter('empty_counter', 'Empty');
      expect(counter.toPrometheus()).toContain('empty_counter 0');
    });
  });

  describe('Histogram', () => {
    it('observes values and populates standard cumulative buckets', () => {
      const hist = new Histogram('test_latency_seconds', 'Latency', [0.01, 0.05, 0.1]);
      hist.observe(0.005);
      hist.observe(0.04);
      hist.observe(0.08);
      hist.observe(0.5);

      const text = hist.toPrometheus();
      expect(text).toContain('# TYPE test_latency_seconds histogram');
      expect(text).toContain('test_latency_seconds_bucket{le="0.01"} 1');
      expect(text).toContain('test_latency_seconds_bucket{le="0.05"} 2');
      expect(text).toContain('test_latency_seconds_bucket{le="0.1"} 3');
      expect(text).toContain('test_latency_seconds_bucket{le="+Inf"} 4');
      expect(text).toContain('test_latency_seconds_count 4');
    });

    it('ignores NaN and non-numbers safely', () => {
      const hist = new Histogram('safe_hist', 'Safe');
      hist.observe('invalid');
      hist.observe(NaN);
      expect(hist.totalCount).toBe(0);
    });
  });

  describe('MetricsRegistry & /metrics Exposition', () => {
    it('renders Prometheus exposition format with all required gauges and histograms', () => {
      metricsRegistry.observeSearch(0.004);
      metricsRegistry.observeDispatch(0.015);

      const output = metricsRegistry.getPrometheusMetrics();

      // Check HTTP metrics
      expect(output).toContain('# TYPE http_requests_total counter');
      expect(output).toContain('# TYPE http_request_duration_seconds histogram');

      // Check systems showcase metrics
      expect(output).toContain('# TYPE search_duration_seconds histogram');
      expect(output).toContain('# TYPE dispatch_optimization_seconds histogram');
      expect(output).toContain('process_resident_memory_bytes');
      expect(output).toContain('cache_hits_total');
      expect(output).toContain('cache_hit_ratio');
      expect(output).toContain('queue_depth');
      expect(output).toContain('db_pool_connections');
    });

    it('metricsMiddleware records request duration and status upon response finish', () => {
      const mw = metricsRegistry.middleware();
      let finishCallback;

      const req = {
        method: 'GET',
        baseUrl: '/api',
        path: '/products',
        route: { path: '/products' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn().mockImplementation((ev, cb) => {
          if (ev === 'finish') finishCallback = cb;
        }),
      };
      const next = jest.fn();

      mw(req, res, next);
      expect(next).toHaveBeenCalled();

      // Trigger response finish
      finishCallback();

      const output = metricsRegistry.getPrometheusMetrics();
      expect(output).toContain(
        'http_requests_total{method="GET",route="/api/products",status="200"}'
      );
    });
  });
});
