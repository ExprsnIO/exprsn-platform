#!/bin/bash
# Verify Postgres.app Installation

echo "🔍 Checking for Postgres.app..."
echo ""

# Check if Postgres.app is installed
if [ -d "/Applications/Postgres.app" ]; then
    echo "✅ Postgres.app is installed"
else
    echo "❌ Postgres.app not found in /Applications"
    echo ""
    echo "Please download and install Postgres.app from:"
    echo "https://postgresapp.com/"
    exit 1
fi

# Reload shell configuration
echo ""
echo "🔄 Reloading shell configuration..."
source ~/.zshrc

# Check if PostgreSQL binaries are accessible
echo ""
echo "🔍 Checking PostgreSQL binaries..."

if command -v psql &> /dev/null; then
    echo "✅ psql found: $(which psql)"
    echo "   Version: $(psql --version)"
else
    echo "❌ psql not found in PATH"
    echo ""
    echo "Please ensure Postgres.app is running and try:"
    echo "  source ~/.zshrc"
    exit 1
fi

if command -v createdb &> /dev/null; then
    echo "✅ createdb found: $(which createdb)"
else
    echo "❌ createdb not found in PATH"
    exit 1
fi

if command -v pg_isready &> /dev/null; then
    echo "✅ pg_isready found: $(which pg_isready)"
else
    echo "❌ pg_isready not found in PATH"
    exit 1
fi

# Check if PostgreSQL server is running
echo ""
echo "🔍 Checking PostgreSQL server status..."

if pg_isready &> /dev/null; then
    echo "✅ PostgreSQL server is running"
else
    echo "❌ PostgreSQL server is not responding"
    echo ""
    echo "Please start Postgres.app:"
    echo "  1. Open Postgres.app from Applications"
    echo "  2. Click the elephant icon in menu bar"
    echo "  3. Ensure the server is running"
    exit 1
fi

# Test connection
echo ""
echo "🔍 Testing database connection..."

if psql -U $USER -d postgres -c "SELECT version();" &> /dev/null; then
    echo "✅ Successfully connected to PostgreSQL"
    echo ""
    psql -U $USER -d postgres -c "SELECT version();" | head -3
else
    echo "⚠️  Could not connect to default database"
    echo "   This is normal for a fresh install"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Postgres.app is ready!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. cd /Users/rickholland/Downloads/Exprsn/cli"
echo "  2. ./exprsn system preflight"
echo "  3. ./exprsn system init"
echo ""
