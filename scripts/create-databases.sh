#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# Database Initialization Script
# ═══════════════════════════════════════════════════════════════════════
#
# This script creates databases and database users for all Exprsn services.
# It supports:
# - Multiple environments (development, staging, production)
# - Independent database hosts per service
# - Secure password generation
# - Service user creation with appropriate permissions
#
# Usage:
#   ./create-databases.sh [--environment=<env>] [--host=<host>] [--port=<port>]
#
# ═══════════════════════════════════════════════════════════════════════

set -e

# ───────────────────────────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────────────────────────

ENVIRONMENT="development"
DB_HOST="localhost"
DB_PORT=5432
DB_ADMIN_USER="postgres"
DB_ADMIN_PASSWORD=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# ───────────────────────────────────────────────────────────────────────
# Parse Arguments
# ───────────────────────────────────────────────────────────────────────

for arg in "$@"; do
  case $arg in
    --environment=*)
      ENVIRONMENT="${arg#*=}"
      ;;
    --host=*)
      DB_HOST="${arg#*=}"
      ;;
    --port=*)
      DB_PORT="${arg#*=}"
      ;;
    --admin-user=*)
      DB_ADMIN_USER="${arg#*=}"
      ;;
    --admin-password=*)
      DB_ADMIN_PASSWORD="${arg#*=}"
      ;;
    *)
      error "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

# ───────────────────────────────────────────────────────────────────────
# Environment-specific Configuration
# ───────────────────────────────────────────────────────────────────────

case "$ENVIRONMENT" in
  development|dev)
    ENV_SUFFIX="_dev"
    DEFAULT_PASSWORD="development_password_change_me"
    ;;
  staging|stage)
    ENV_SUFFIX="_staging"
    DEFAULT_PASSWORD="$(openssl rand -base64 32)"
    ;;
  production|prod)
    ENV_SUFFIX=""
    DEFAULT_PASSWORD="$(openssl rand -base64 32)"
    ;;
  *)
    error "Unknown environment: $ENVIRONMENT"
    exit 1
    ;;
esac

# ───────────────────────────────────────────────────────────────────────
# Service Definitions
# ───────────────────────────────────────────────────────────────────────

# Define all services and their database requirements
# Updated to include all 18 Exprsn ecosystem services
declare -A SERVICES=(
  ["ca"]="Certificate Authority - Core CA database"
  ["setup"]="Setup & Management Service"
  ["auth"]="Authentication & SSO"
  ["spark"]="Real-time Messaging"
  ["timeline"]="Social Feed Platform"
  ["prefetch"]="Timeline Prefetching Service"
  ["moderator"]="Content Moderation"
  ["filevault"]="File Storage"
  ["gallery"]="Media Galleries"
  ["live"]="Live Streaming"
  ["bridge"]="API Gateway"
  ["nexus"]="Groups & Events"
  ["pulse"]="Analytics & Metrics"
  ["vault"]="Secrets Management"
  ["herald"]="Notifications & Alerts"
  ["svr"]="Dynamic Page Server"
  ["workflow"]="Workflow Automation"
  ["forge"]="Business Management Platform"
)

# ───────────────────────────────────────────────────────────────────────
# Helper Functions
# ───────────────────────────────────────────────────────────────────────

generate_password() {
  if [[ "$ENVIRONMENT" == "development" ]]; then
    echo "${1}_dev_password"
  else
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-32
  fi
}

check_postgres_port() {
  log "Verifying PostgreSQL is listening on $DB_HOST:$DB_PORT..."

  # Check if port is open using /dev/tcp (bash built-in)
  if timeout 3 bash -c "cat < /dev/null > /dev/tcp/$DB_HOST/$DB_PORT" 2>/dev/null; then
    success "PostgreSQL port $DB_PORT is accessible"
    return 0
  else
    error "PostgreSQL is not listening on $DB_HOST:$DB_PORT"
    error "Please ensure PostgreSQL is running and the port is correct"
    return 1
  fi
}

check_postgres_connection() {
  log "Checking PostgreSQL connection to $DB_HOST:$DB_PORT..."

  # First check if the port is accessible
  if ! check_postgres_port; then
    return 1
  fi

  if command -v psql >/dev/null 2>&1; then
    if PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d postgres -c '\q' 2>/dev/null; then
      success "PostgreSQL connection successful"
      return 0
    else
      error "Failed to connect to PostgreSQL"
      return 1
    fi
  else
    error "psql command not found. Please install PostgreSQL client."
    return 1
  fi
}

database_exists() {
  local db_name=$1
  PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='$db_name'" | grep -q 1
}

user_exists() {
  local username=$1
  PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d postgres -tAc \
    "SELECT 1 FROM pg_roles WHERE rolname='$username'" | grep -q 1
}

create_user() {
  local username=$1
  local password=$2

  if user_exists "$username"; then
    warn "User $username already exists, skipping creation"
    # Update password anyway
    PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d postgres <<EOF
ALTER USER $username WITH PASSWORD '$password';
EOF
    log "Updated password for user: $username"
  else
    PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d postgres <<EOF
CREATE USER $username WITH PASSWORD '$password';
EOF
    success "Created user: $username"
  fi
}

create_database() {
  local db_name=$1
  local owner=$2

  if database_exists "$db_name"; then
    warn "Database $db_name already exists, skipping creation"
    # Update owner anyway
    PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d postgres <<EOF
ALTER DATABASE $db_name OWNER TO $owner;
EOF
    log "Updated owner for database: $db_name -> $owner"
  else
    PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d postgres <<EOF
CREATE DATABASE $db_name OWNER $owner;
GRANT ALL PRIVILEGES ON DATABASE $db_name TO $owner;
EOF
    success "Created database: $db_name (owner: $owner)"
  fi
}

apply_ca_schema() {
  local db_name=$1
  local schema_file="${PROJECT_ROOT}/database/schema.sql"

  if [ -f "$schema_file" ]; then
    log "Applying CA schema to $db_name..."
    PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d "$db_name" \
      -f "$schema_file" 2>&1 | grep -v "NOTICE:" || true
    success "CA schema applied to $db_name"
  else
    warn "CA schema file not found: $schema_file"
  fi
}

# ───────────────────────────────────────────────────────────────────────
# Create Databases and Users
# ───────────────────────────────────────────────────────────────────────

create_service_databases() {
  log "Creating databases and users for Exprsn services..."
  echo ""

  local credentials_file="${PROJECT_ROOT}/.db-credentials-${ENVIRONMENT}.txt"
  echo "# Database Credentials - ${ENVIRONMENT}" > "$credentials_file"
  echo "# Generated: $(date)" >> "$credentials_file"
  echo "# Host: $DB_HOST:$DB_PORT" >> "$credentials_file"
  echo "" >> "$credentials_file"

  # Process each service
  for service in "${!SERVICES[@]}"; do
    local description="${SERVICES[$service]}"
    local db_name="exprsn_${service}${ENV_SUFFIX}"
    local username="exprsn_${service}_user"
    local password=$(generate_password "$service")

    log "────────────────────────────────────────────────────────────"
    log "Service: $service - $description"
    log "────────────────────────────────────────────────────────────"

    # Create user
    create_user "$username" "$password"

    # Create database
    create_database "$db_name" "$username"

    # Apply CA schema if this is the CA service
    if [[ "$service" == "ca" ]]; then
      apply_ca_schema "$db_name"
    fi

    # Save credentials
    cat >> "$credentials_file" <<EOF
# $description
${service^^}_DB_HOST=$DB_HOST
${service^^}_DB_PORT=$DB_PORT
${service^^}_DB_NAME=$db_name
${service^^}_DB_USER=$username
${service^^}_DB_PASSWORD=$password

EOF

    echo ""
  done

  chmod 600 "$credentials_file"
  success "Database credentials saved to: $credentials_file"
  warn "IMPORTANT: Keep this file secure and do not commit it to version control!"
}

# ───────────────────────────────────────────────────────────────────────
# Create Additional Database Objects
# ───────────────────────────────────────────────────────────────────────

create_shared_extensions() {
  log "Creating shared PostgreSQL extensions..."

  for service in "${!SERVICES[@]}"; do
    local db_name="exprsn_${service}${ENV_SUFFIX}"

    PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d "$db_name" <<EOF
-- UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgcrypto for additional cryptographic functions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pg_trgm for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- hstore for key-value storage
CREATE EXTENSION IF NOT EXISTS hstore;
EOF
  done

  success "PostgreSQL extensions created"
}

# ───────────────────────────────────────────────────────────────────────
# Create Session Store Table
# ───────────────────────────────────────────────────────────────────────

create_session_store() {
  local db_name="exprsn_ca${ENV_SUFFIX}"

  log "Creating session store table in $db_name..."

  PGPASSWORD="$DB_ADMIN_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_ADMIN_USER" -d "$db_name" <<'EOF'
-- Session store for connect-pg-simple
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR NOT NULL COLLATE "default",
  sess JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL,
  PRIMARY KEY (sid)
);

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

-- Grant permissions to CA user
GRANT ALL PRIVILEGES ON TABLE sessions TO exprsn_ca_user;
EOF

  success "Session store table created"
}

# ───────────────────────────────────────────────────────────────────────
# Summary and Environment File Update
# ───────────────────────────────────────────────────────────────────────

update_env_file() {
  local env_file="${PROJECT_ROOT}/.env"
  local credentials_file="${PROJECT_ROOT}/.db-credentials-${ENVIRONMENT}.txt"

  if [ ! -f "$env_file" ]; then
    warn ".env file not found, skipping update"
    return 0
  fi

  log "Updating .env file with database credentials..."

  # Backup existing .env
  cp "$env_file" "${env_file}.backup"

  # Read credentials and update .env
  while IFS='=' read -r key value; do
    if [[ $key == *"_DB_"* ]] && [[ ! $key == \#* ]] && [[ -n "$value" ]]; then
      # Update or append the value in .env
      if grep -q "^${key}=" "$env_file"; then
        # macOS compatible sed
        if [[ "$OSTYPE" == "darwin"* ]]; then
          sed -i '' "s|^${key}=.*|${key}=${value}|" "$env_file"
        else
          sed -i "s|^${key}=.*|${key}=${value}|" "$env_file"
        fi
      else
        echo "${key}=${value}" >> "$env_file"
      fi
    fi
  done < "$credentials_file"

  success ".env file updated (backup saved as .env.backup)"
}

# ═══════════════════════════════════════════════════════════════════════
# Main Execution
# ═══════════════════════════════════════════════════════════════════════

main() {
  echo "╔═══════════════════════════════════════════════════════════════════════╗"
  echo "║              Exprsn Database Initialization                           ║"
  echo "╚═══════════════════════════════════════════════════════════════════════╝"
  echo ""

  log "Environment: $ENVIRONMENT"
  log "Database Host: $DB_HOST:$DB_PORT"
  log "Admin User: $DB_ADMIN_USER"
  echo ""

  # Check PostgreSQL connection
  if ! check_postgres_connection; then
    error "Cannot proceed without database connection"
    exit 1
  fi

  echo ""

  # Create service databases and users
  create_service_databases

  # Create shared extensions
  echo ""
  create_shared_extensions

  # Create session store
  echo ""
  create_session_store

  # Update .env file
  echo ""
  update_env_file

  echo ""
  echo "╔═══════════════════════════════════════════════════════════════════════╗"
  echo "║                 Database Initialization Complete!                     ║"
  echo "╚═══════════════════════════════════════════════════════════════════════╝"
  echo ""
  success "All databases and users created successfully"
  echo ""
  echo "Databases created:"
  for service in "${!SERVICES[@]}"; do
    echo "  - exprsn_${service}${ENV_SUFFIX} (${SERVICES[$service]})"
  done
  echo ""
  echo "Next steps:"
  echo "  1. Review database credentials in: .db-credentials-${ENVIRONMENT}.txt"
  echo "  2. Update .env file if needed (already done automatically)"
  echo "  3. Proceed with CA setup: npm start"
  echo ""
}

# Run main
main "$@"
