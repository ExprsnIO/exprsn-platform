#!/bin/bash
# Start Exprsn Services
# Ensures PostgreSQL PATH is set and starts services in correct order

set -e

# Set PostgreSQL PATH
export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"

# Navigate to CLI directory
cd "$(dirname "$0")"

echo "🚀 Starting Exprsn Services..."
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."
./exprsn system preflight || exit 1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start CA first (critical dependency)
echo "🔐 Starting Certificate Authority (exprsn-ca)..."
./exprsn services start ca

echo ""
echo "⏳ Waiting for CA to be healthy..."
sleep 5

# Start setup service
echo "⚙️  Starting Setup Service (exprsn-setup)..."
./exprsn services start setup

echo ""
echo "⏳ Waiting for setup to initialize..."
sleep 3

# Start other core services
echo "🌟 Starting core services..."
echo ""

./exprsn services start auth
sleep 2

./exprsn services start timeline
sleep 2

./exprsn services start spark
sleep 2

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Core services started!"
echo ""
echo "To start all services:"
echo "  ./exprsn services start --all"
echo ""
echo "To check status:"
echo "  ./exprsn services list"
echo ""
echo "To monitor health:"
echo "  ./exprsn services health --watch"
echo ""
