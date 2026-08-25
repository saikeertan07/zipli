# ==============================================================================
# Multi-Stage Hardened Production Dockerfile for Zipli Pro API
# ==============================================================================

# Stage 1: Dependency Builder
FROM node:20-alpine AS dependencies
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Stage 2: Production Runtime
FROM node:20-alpine AS runtime
LABEL maintainer="Zipli Engineering Team <engineering@zipli.pro>"
LABEL description="Zipli Pro High-Performance Quick-Commerce API"

# Install dumb-init for robust PID 1 signal forwarding and curl for health checks
RUN apk add --no-cache dumb-init curl

WORKDIR /app

# Set production environment flags
ENV NODE_ENV=production \
    PORT=5001 \
    NODE_OPTIONS="--max-old-space-size=2048"

# Copy node modules from builder stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY backend/package*.json ./

# Copy backend source code, migrations, and assets
COPY backend/src ./src
COPY backend/migrations ./migrations
COPY backend/public ./public

# Assign ownership to unprivileged built-in node user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose internal API port
EXPOSE 5001

# Container health probe checking readiness
HEALTHCHECK --interval=20s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:5001/api/health/ready || exit 1

# Launch using dumb-init to handle graceful SIGTERM shutdown
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "src/server.js"]
