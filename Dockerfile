# Production Dockerfile for Zipli Pro Vanilla Frontend
FROM nginx:alpine

# Remove default nginx configurations
RUN rm -rf /etc/nginx/conf.d/* /usr/share/nginx/html/*

# Copy custom reverse-proxy nginx configuration
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy frontend static files
COPY frontend/ /usr/share/nginx/html/

# Expose standard HTTP port
EXPOSE 80

# Health check probe
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
