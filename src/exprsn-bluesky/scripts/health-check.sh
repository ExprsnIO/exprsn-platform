#!/bin/bash

# Health Check Script for exprsn-bluesky
# Usage: ./scripts/health-check.sh [url]

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

URL=${1:-http://localhost:3018}

echo -e "${YELLOW}Checking exprsn-bluesky health...${NC}"
echo "URL: $URL"

# Basic health check
echo -n "Basic health check... "
if curl -f -s "$URL/health" > /dev/null; then
  echo -e "${GREEN}✓ PASS${NC}"
else
  echo -e "${RED}✗ FAIL${NC}"
  exit 1
fi

# Detailed health response
echo ""
echo "Detailed health status:"
HEALTH_RESPONSE=$(curl -s "$URL/health")
echo "$HEALTH_RESPONSE" | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE"

# Check DID document
echo ""
echo -n "DID document check... "
if curl -f -s "$URL/.well-known/did.json" > /dev/null; then
  echo -e "${GREEN}✓ PASS${NC}"
else
  echo -e "${RED}✗ FAIL${NC}"
  exit 1
fi

# Check XRPC endpoints
echo -n "XRPC server description... "
if curl -f -s "$URL/xrpc/com.atproto.server.describeServer" > /dev/null; then
  echo -e "${GREEN}✓ PASS${NC}"
else
  echo -e "${RED}✗ FAIL${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}All health checks passed!${NC}"
echo -e "${GREEN}========================================${NC}"
