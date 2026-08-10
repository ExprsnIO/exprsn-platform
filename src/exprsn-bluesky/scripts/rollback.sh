#!/bin/bash

# Rollback Script for exprsn-bluesky
# Usage: ./scripts/rollback.sh [version]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

VERSION=${1:-previous}

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}exprsn-bluesky Rollback Script${NC}"
echo -e "${YELLOW}Target version: $VERSION${NC}"
echo -e "${YELLOW}========================================${NC}"

# Confirm rollback
read -p "Are you sure you want to rollback to $VERSION? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Rollback cancelled"
  exit 0
fi

# Stop current service
echo -e "${YELLOW}Stopping current service...${NC}"
docker-compose stop bluesky

# Rollback to previous image
echo -e "${YELLOW}Rolling back to version: $VERSION${NC}"
if [ "$VERSION" = "previous" ]; then
  # Get previous image from history
  PREVIOUS_IMAGE=$(docker images exprsn-bluesky --format "{{.Tag}}" | sed -n '2p')

  if [ -z "$PREVIOUS_IMAGE" ] || [ "$PREVIOUS_IMAGE" = "latest" ]; then
    echo -e "${RED}Error: No previous version found${NC}"
    echo "Available versions:"
    docker images exprsn-bluesky
    exit 1
  fi

  echo "Using previous image: $PREVIOUS_IMAGE"
  docker tag exprsn-bluesky:$PREVIOUS_IMAGE exprsn-bluesky:latest
else
  # Use specified version
  if ! docker images exprsn-bluesky:$VERSION | grep -q "$VERSION"; then
    echo -e "${RED}Error: Version $VERSION not found${NC}"
    echo "Available versions:"
    docker images exprsn-bluesky
    exit 1
  fi

  docker tag exprsn-bluesky:$VERSION exprsn-bluesky:latest
fi

# Restart service
echo -e "${YELLOW}Starting service with rollback version...${NC}"
docker-compose up -d bluesky

# Wait for health check
echo "Waiting for service to be healthy..."
sleep 5

RETRIES=12
for i in $(seq 1 $RETRIES); do
  if curl -f http://localhost:3018/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Service is healthy after rollback${NC}"
    break
  fi

  if [ $i -eq $RETRIES ]; then
    echo -e "${RED}Error: Service failed to start after rollback${NC}"
    docker-compose logs --tail=50 bluesky
    exit 1
  fi

  echo "Waiting for health check... ($i/$RETRIES)"
  sleep 5
done

# Check database migrations
echo -e "${YELLOW}Checking database compatibility...${NC}"
echo "Note: You may need to rollback migrations manually if schema changed"
echo "Run: docker-compose run --rm bluesky npm run migrate:undo"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Rollback completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Service is now running on rolled-back version"
echo "Monitor logs: docker-compose logs -f bluesky"
