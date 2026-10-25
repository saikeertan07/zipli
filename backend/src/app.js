const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const cookieParser = require('cookie-parser');
const { env } = require('./config/env');
const requestIdMiddleware = require('./middleware/requestId');
const { metricsRegistry } = require('./utils/metrics');
const { getHealth, getLiveness, getReadiness } = require('./controllers/health.controller');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { authLimiter, orderLimiter, searchLimiter } = require('./middleware/rateLimit');
const { csrfCookieMiddleware } = require('./middleware/csrf');
const authRoutes = require('./routes/auth.routes');
const categoryRoutes = require('./routes/category.routes');
const productRoutes = require('./routes/product.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/order.routes');
const adminRoutes = require('./routes/admin.routes');
const searchRoutes = require('./routes/search.routes');
const recommendationRoutes = require('./routes/recommendation.routes');
const dispatchRoutes = require('./routes/dispatch.routes');
const deliveryIntelRoutes = require('./routes/deliveryIntelligence.routes');
const inventoryRoutes = require('./routes/inventory.routes');
const pricingRoutes = require('./routes/pricing.routes');
const securityRoutes = require('./routes/security.routes');
const userRoutes = require('./routes/user.routes');
const sseRoutes = require('./routes/sse.routes');
const notificationRoutes = require('./routes/notification.routes');
const assistantRoutes = require('./routes/assistant.routes');
const paymentRoutes = require('./routes/payment.routes');
const complianceRoutes = require('./routes/compliance.routes');
const addressRoutes = require('./routes/address.routes');
const otpRoutes = require('./routes/otp.routes');

const app = express();

// --- Request ID & Context (1.8) ---
app.use(requestIdMiddleware);
app.use(metricsRegistry.middleware());

// --- Security & core middleware ---
// Helmet with strict CSP, HSTS, and frame protections (SEC-IO-04, SEC-IO-05)
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          'https://checkout.razorpay.com',
          'https://cdn.razorpay.com',
          ...(process.env.CSP_EXTRA_SCRIPT_SRC
            ? process.env.CSP_EXTRA_SCRIPT_SRC.split(',').map((s) => s.trim())
            : []),
        ],
        frameSrc: [
          "'self'",
          'https://checkout.razorpay.com',
          'https://api.razorpay.com',
          ...(process.env.CSP_EXTRA_FRAME_SRC
            ? process.env.CSP_EXTRA_FRAME_SRC.split(',').map((s) => s.trim())
            : []),
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'http://localhost:*',
          'http://127.0.0.1:*',
          'https://api.razorpay.com',
          'https://lumberjack.razorpay.com',
        ],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
      },
    },
  })
);

// Permissions-Policy (SEC-IO-05)
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(self), camera=(), microphone=(), payment=(self)'
  );
  next();
});

const allowedOrigins = (env.CORS_ORIGIN || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const corsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 || allowedOrigins.includes('*')) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  maxAge: 600,
});

app.use(corsMiddleware);
app.options('*', corsMiddleware);

app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(cookieParser());
app.use(csrfCookieMiddleware);

// Morgan request logger configured with request ID
morgan.token('id', (req) => req.id || '-');
const morganFormat =
  env.NODE_ENV === 'production'
    ? '{"time":":date[iso]","reqId":":id","method":":method","url":":url","status"::status,"bytes"::res[content-length],"responseTime"::response-time}'
    : ':id :method :url :status :response-time ms - :res[content-length]';

if (env.NODE_ENV !== 'test') {
  app.use(morgan(morganFormat));
}

// --- Static assets (product placeholder image etc.) ---
app.use('/images', express.static(path.join(__dirname, '..', 'public', 'images')));
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// --- Health checks & Probes (1.9 & 10.7) ---
app.get('/health', getHealth);
app.get('/api/v1/health', getHealth);
app.get('/api/health', getHealth);
app.get('/health/liveness', getLiveness);
app.get('/api/health/liveness', getLiveness);
app.get('/health/readiness', getReadiness);
app.get('/api/health/readiness', getReadiness);
app.get('/api/health/ready', getReadiness);

// --- Observability (10.8) ---
app.get('/metrics', (req, res) => {
  res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(metricsRegistry.getPrometheusMetrics());
});

// --- Versioned Routes (/api/v1 and backwards-compatible /api) ---
function mountApiRoutes(prefix) {
  app.use(`${prefix}/auth`, authLimiter, authRoutes);
  app.use(`${prefix}/users`, userRoutes);
  app.use(`${prefix}/users/addresses`, addressRoutes);
  app.use(`${prefix}/auth/otp`, authLimiter, otpRoutes);
  app.use(`${prefix}/categories`, categoryRoutes);
  app.use(`${prefix}/products`, productRoutes);
  app.use(`${prefix}/cart`, cartRoutes);
  app.use(`${prefix}/orders`, orderLimiter, orderRoutes);
  app.use(`${prefix}/admin`, adminRoutes);
  app.use(`${prefix}/search`, searchLimiter, searchRoutes);
  app.use(`${prefix}/recs`, recommendationRoutes);
  app.use(`${prefix}/recommendations`, recommendationRoutes);
  app.use(`${prefix}/delivery`, dispatchRoutes);
  app.use(`${prefix}/delivery-intel`, deliveryIntelRoutes);
  app.use(`${prefix}/inventory`, inventoryRoutes);
  app.use(`${prefix}/pricing`, pricingRoutes);
  app.use(`${prefix}/security`, securityRoutes);
  app.use(`${prefix}/events`, sseRoutes);
  app.use(`${prefix}/notifications`, notificationRoutes);
  app.use(`${prefix}/assistant`, assistantRoutes);
  app.use(`${prefix}/payments`, paymentRoutes);
  app.use(`${prefix}/compliance`, complianceRoutes);
}

mountApiRoutes('/api/v1');
mountApiRoutes('/api');

// Standalone direct route aliases
app.use('/search', searchLimiter, searchRoutes);
app.use('/recs', recommendationRoutes);
app.use('/delivery', dispatchRoutes);
app.use('/delivery-intel', deliveryIntelRoutes);
app.use('/inventory', inventoryRoutes);
app.use('/pricing', pricingRoutes);

// --- 404 + error handling (must be last) ---

app.use(notFound);
app.use(errorHandler);

module.exports = app;
