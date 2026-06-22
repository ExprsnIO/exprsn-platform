#!/bin/bash

# ═══════════════════════════════════════════════════════════
# Exprsn Spark Setup Script
# ═══════════════════════════════════════════════════════════

set -e

echo "════════════════════════════════════════════════"
echo "  Exprsn Spark - Setup Script"
echo "════════════════════════════════════════════════"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check Node.js version
echo -n "Checking Node.js version... "
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo -e "${RED}FAIL${NC}"
  echo "Node.js 18+ is required. Current version: $(node -v)"
  exit 1
fi
echo -e "${GREEN}OK${NC} ($(node -v))"

# Check PostgreSQL
echo -n "Checking PostgreSQL... "
if ! command -v psql &> /dev/null; then
  echo -e "${YELLOW}WARNING${NC}"
  echo "PostgreSQL client not found. Install postgres to continue."
else
  if pg_isready &> /dev/null; then
    echo -e "${GREEN}OK${NC}"
  else
    echo -e "${YELLOW}WARNING${NC}"
    echo "PostgreSQL is not running. Start it with 'pg_ctl start'"
  fi
fi

# Check Redis
echo -n "Checking Redis... "
if ! command -v redis-cli &> /dev/null; then
  echo -e "${YELLOW}WARNING${NC}"
  echo "Redis client not found. Install redis to continue."
else
  if redis-cli ping &> /dev/null; then
    echo -e "${GREEN}OK${NC}"
  else
    echo -e "${YELLOW}WARNING${NC}"
    echo "Redis is not running. Start it with 'redis-server'"
  fi
fi

# Check Elasticsearch
echo -n "Checking Elasticsearch... "
if curl -s http://localhost:9200 &> /dev/null; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${YELLOW}WARNING${NC}"
  echo "Elasticsearch not running on localhost:9200"
fi

echo ""

# Install dependencies
echo "Installing dependencies..."
npm install
echo -e "${GREEN}Dependencies installed${NC}"
echo ""

# Setup environment file
if [ ! -f .env ]; then
  echo "Creating .env file from template..."
  cp .env.example .env
  echo -e "${GREEN}.env file created${NC}"
  echo -e "${YELLOW}Please edit .env with your configuration${NC}"
else
  echo -e "${YELLOW}.env file already exists${NC}"
fi
echo ""

# Setup database
read -p "Do you want to create the database? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  read -p "Enter database name (default: exprsn_spark): " DB_NAME
  DB_NAME=${DB_NAME:-exprsn_spark}

  echo "Creating database '$DB_NAME'..."
  createdb "$DB_NAME" 2>/dev/null || echo "Database may already exist"

  echo "Applying schema..."
  psql -d "$DB_NAME" -f database/schema.sql

  echo -e "${GREEN}Database setup complete${NC}"
fi
echo ""

# Create Elasticsearch index
read -p "Do you want to create the Elasticsearch index? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "Creating Elasticsearch index..."
  node -e "
    const { createIndex } = require('./src/services/searchService');
    createIndex()
      .then(() => console.log('Index created successfully'))
      .catch(err => console.error('Failed to create index:', err.message));
  "
fi
echo ""

# Summary
echo "════════════════════════════════════════════════"
echo "  Setup Complete!"
echo "════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "1. Edit .env with your configuration"
echo "2. Start the worker: node src/workers/messageWorker.js"
echo "3. Start the service: npm start"
echo ""
echo "For development:"
echo "  npm run dev"
echo ""
echo "Health check:"
echo "  curl http://localhost:3002/health"
echo ""
echo "════════════════════════════════════════════════"
