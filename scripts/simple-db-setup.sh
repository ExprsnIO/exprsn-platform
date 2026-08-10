#!/bin/bash

# Simple database setup script compatible with Bash 3.2+
# Creates all Exprsn service databases and users

export PATH="/Applications/Postgres.app/Contents/Versions/16/bin:/usr/bin:/bin:$PATH"

echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║              Exprsn Database Quick Setup                              ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""

# Services to create
SERVICES="ca auth spark timeline prefetch moderator filevault gallery live"

echo "Creating databases and users for development environment..."
echo ""

for service in $SERVICES; do
  db_name="exprsn_${service}_dev"
  db_user="exprsn_${service}_user"
  db_pass="${service}_dev_password"

  echo "[INFO] Creating database: $db_name (user: $db_user)"

  # Create user and database
  psql -U postgres -d postgres -c "CREATE USER $db_user WITH PASSWORD '$db_pass';" 2>/dev/null || echo "  User may already exist"
  psql -U postgres -d postgres -c "CREATE DATABASE $db_name OWNER $db_user;" 2>/dev/null || echo "  Database may already exist"
  psql -U postgres -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE $db_name TO $db_user;" 2>/dev/null

  # Create extensions
  psql -U postgres -d "$db_name" -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" 2>/dev/null
  psql -U postgres -d "$db_name" -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" 2>/dev/null
  psql -U postgres -d "$db_name" -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" 2>/dev/null
  psql -U postgres -d "$db_name" -c "CREATE EXTENSION IF NOT EXISTS hstore;" 2>/dev/null

  echo "  ✓ Complete"
done

echo ""
echo "Applying CA schema to exprsn_ca_dev..."
if [ -f "database/schema.sql" ]; then
  psql -U postgres -d exprsn_ca_dev -f database/schema.sql 2>&1 | grep -v "NOTICE:" | grep -v "^$" || true
  echo "✓ CA schema applied"
else
  echo "⚠ Warning: database/schema.sql not found"
fi

echo ""
echo "Creating session store table..."
psql -U postgres -d exprsn_ca_dev <<'EOF'
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  PRIMARY KEY (sid)
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);
GRANT ALL PRIVILEGES ON TABLE sessions TO exprsn_ca_user;
EOF

echo ""
echo "╔═══════════════════════════════════════════════════════════════════════╗"
echo "║                    Database Setup Complete!                           ║"
echo "╚═══════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Databases created:"
for service in $SERVICES; do
  echo "  - exprsn_${service}_dev (user: exprsn_${service}_user)"
done
echo ""
echo "Passwords: <service>_dev_password (e.g., ca_dev_password)"
echo ""
echo "Next steps:"
echo "  1. npm install"
echo "  2. npm start"
echo "  3. Visit http://localhost:3000/setup"
echo ""
