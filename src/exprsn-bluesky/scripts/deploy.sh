#!/bin/bash

# exprsn-bluesky Deployment Script
# Usage: ./scripts/deploy.sh [environment]
# Example: ./scripts/deploy.sh production

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default environment
ENVIRONMENT=${1:-production}

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}exprsn-bluesky Deployment Script${NC}"
echo -e "${GREEN}Environment: $ENVIRONMENT${NC}"
echo -e "${GREEN}========================================${NC}"

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(development|staging|production)$ ]]; then
  echo -e "${RED}Error: Invalid environment '$ENVIRONMENT'${NC}"
  echo "Valid environments: development, staging, production"
  exit 1
fi

# Check required commands
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Error: docker is required but not installed.${NC}" >&2; exit 1; }
command -v docker-compose >/dev/null 2>&1 || { echo -e "${RED}Error: docker-compose is required but not installed.${NC}" >&2; exit 1; }

# Load environment variables
if [ -f ".env.${ENVIRONMENT}" ]; then
  echo -e "${YELLOW}Loading environment from .env.${ENVIRONMENT}${NC}"
  export $(cat .env.${ENVIRONMENT} | grep -v '^#' | xargs)
else
  echo -e "${YELLOW}Warning: .env.${ENVIRONMENT} not found. Using default values.${NC}"
fi

# Pre-deployment checks
echo -e "${YELLOW}Running pre-deployment checks...${NC}"

# Check if database is accessible
if [ -n "$DB_HOST" ]; then
  echo "Checking database connection..."
  if ! nc -z "$DB_HOST" "${DB_PORT:-5432}" 2>/dev/null; then
    echo -e "${RED}Error: Cannot connect to database at $DB_HOST:${DB_PORT:-5432}${NC}"
    exit 1
  fi
  echo -e "${GREEN}✓ Database connection OK${NC}"
fi

# Check if Redis is accessible (if enabled)
if [ "$REDIS_ENABLED" = "true" ] && [ -n "$REDIS_HOST" ]; then
  echo "Checking Redis connection..."
  if ! nc -z "$REDIS_HOST" "${REDIS_PORT:-6379}" 2>/dev/null; then
    echo -e "${YELLOW}Warning: Cannot connect to Redis at $REDIS_HOST:${REDIS_PORT:-6379}${NC}"
    echo "Service will run without caching"
  else
    echo -e "${GREEN}✓ Redis connection OK${NC}"
  fi
fi

# Build Docker image
echo -e "${YELLOW}Building Docker image...${NC}"
docker build -t exprsn-bluesky:latest -t exprsn-bluesky:$ENVIRONMENT .

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Docker image built successfully${NC}"
else
  echo -e "${RED}Error: Docker build failed${NC}"
  exit 1
fi

# Run database migrations
echo -e "${YELLOW}Running database migrations...${NC}"
docker-compose run --rm migration

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Migrations completed${NC}"
else
  echo -e "${RED}Error: Migrations failed${NC}"
  exit 1
fi

# Deploy with zero-downtime strategy
if [ "$ENVIRONMENT" = "production" ]; then
  echo -e "${YELLOW}Deploying with zero-downtime strategy...${NC}"

  # Start new container
  docker-compose up -d --no-deps --scale bluesky=2 bluesky

  # Wait for health check
  echo "Waiting for new container to be healthy..."
  sleep 10

  RETRIES=12
  for i in $(seq 1 $RETRIES); do
    if curl -f http://localhost:3018/health > /dev/null 2>&1; then
      echo -e "${GREEN}✓ New container is healthy${NC}"
      break
    fi

    if [ $i -eq $RETRIES ]; then
      echo -e "${RED}Error: New container failed health check${NC}"
      docker-compose logs bluesky
      exit 1
    fi

    echo "Waiting for health check... ($i/$RETRIES)"
    sleep 5
  done

  # Scale down to single instance
  docker-compose up -d --no-deps --scale bluesky=1 bluesky

else
  # Simple deployment for development/staging
  echo -e "${YELLOW}Deploying...${NC}"
  docker-compose up -d bluesky
fi

# Verify deployment
echo -e "${YELLOW}Verifying deployment...${NC}"
sleep 5

if curl -f http://localhost:3018/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Service is running and healthy${NC}"
else
  echo -e "${RED}Error: Service health check failed${NC}"
  docker-compose logs --tail=50 bluesky
  exit 1
fi

# Show service status
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Service Information:"
echo "  - Environment: $ENVIRONMENT"
echo "  - URL: http://localhost:3018"
echo "  - Admin UI: http://localhost:3018/admin"
echo "  - Health: http://localhost:3018/health"
echo "  - XRPC Endpoint: http://localhost:3018/xrpc"
echo ""
echo "Useful commands:"
echo "  - View logs: docker-compose logs -f bluesky"
echo "  - Restart: docker-compose restart bluesky"
echo "  - Stop: docker-compose stop bluesky"
echo "  - Shell access: docker-compose exec bluesky sh"
echo ""
echo -e "${GREEN}Deployment complete!${NC}"
