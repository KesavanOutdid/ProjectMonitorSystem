# -------------------------------------------------------------
# Project Monitor System - Backend Production Dockerfile
# -------------------------------------------------------------
FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache libc6-compat dumb-init

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (production only for runtime)
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source code
COPY . .

# Create uploads directory with correct permissions
RUN mkdir -p uploads && chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose backend service port
EXPOSE 5000

# Set environment defaults
ENV NODE_ENV=production
ENV PORT=5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:5000/api/v1/health || exit 1

# Launch with dumb-init process manager for proper signal handling
CMD ["dumb-init", "node", "src/server.js"]
