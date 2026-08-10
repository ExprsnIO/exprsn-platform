# Multi-stage Dockerfile for Exprsn Platform
FROM node:18-alpine AS base

# Install system dependencies including OpenSSL
RUN apk add --no-cache \
    openssl \
    ca-certificates \
    python3 \
    make \
    g++ \
    bash

WORKDIR /app

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS development

# Install all dependencies including dev dependencies
RUN npm ci

# Copy source code
COPY . .

# Create necessary directories
RUN mkdir -p logs certs/root-ca certs/intermediate certs/server

# Expose ports
EXPOSE 3000 3001

# Default command (can be overridden)
CMD ["npm", "run", "dev"]

# Production build stage
FROM base AS production-build

# Install only production dependencies
RUN npm ci --only=production

# Copy source code
COPY src ./src
COPY certs ./certs

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache openssl ca-certificates bash

WORKDIR /app

# Copy from production-build
COPY --from=production-build /app/node_modules ./node_modules
COPY --from=production-build /app/src ./src
COPY --from=production-build /app/certs ./certs
COPY package*.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create necessary directories
RUN mkdir -p logs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/index.js"]
