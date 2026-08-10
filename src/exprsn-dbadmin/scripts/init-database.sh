#!/bin/bash

# Initialize exprsn-dbadmin database

DB_NAME="${DB_NAME:-exprsn_dbadmin}"
DB_USER="${DB_USER:-postgres}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"

echo "Initializing exprsn-dbadmin database..."

# Check if database exists
DB_EXISTS=$(PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U $DB_USER -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'")

if [ "$DB_EXISTS" = "1" ]; then
  echo "✓ Database '$DB_NAME' already exists"
else
  echo "Creating database '$DB_NAME'..."
  PGPASSWORD=$DB_PASSWORD createdb -h $DB_HOST -p $DB_PORT -U $DB_USER $DB_NAME
  echo "✓ Database '$DB_NAME' created"
fi

# Run migrations
echo "Running migrations..."
cd "$(dirname "$0")/.."
npm run migrate

echo "✓ Database initialization complete"
