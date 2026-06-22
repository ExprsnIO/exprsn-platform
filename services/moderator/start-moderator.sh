#!/bin/bash

###############################################################################
# Exprsn Moderator Service Startup Script
# Checks dependencies, starts required services, and launches moderator
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ROOT_DIR="$( cd "$SCRIPT_DIR/../.." && pwd )"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Exprsn Moderator Service Startup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo

###############################################################################
# Helper Functions
###############################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_command() {
    if command -v "$1" &> /dev/null; then
        log_success "$1 is installed"
        return 0
    else
        log_error "$1 is not installed"
        return 1
    fi
}

check_port() {
    local port=$1
    local service=$2
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        log_success "$service is running on port $port"
        return 0
    else
        log_warning "$service is not running on port $port"
        return 1
    fi
}

wait_for_service() {
    local host=$1
    local port=$2
    local service=$3
    local max_attempts=30
    local attempt=1

    log_info "Waiting for $service to be ready..."

    while [ $attempt -le $max_attempts ]; do
        if nc -z $host $port 2>/dev/null; then
            log_success "$service is ready!"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    echo
    log_error "$service failed to start within 30 seconds"
    return 1
}

###############################################################################
# Dependency Checks
###############################################################################

log_info "Checking system dependencies..."
echo

DEPS_OK=true

check_command "node" || DEPS_OK=false
check_command "npm" || DEPS_OK=false
check_command "psql" || DEPS_OK=false
check_command "redis-cli" || DEPS_OK=false

if [ "$DEPS_OK" = false ]; then
    log_error "Missing required dependencies. Please install them first."
    exit 1
fi

echo

###############################################################################
# Environment Configuration
###############################################################################

log_info "Checking environment configuration..."
echo

if [ ! -f "$SCRIPT_DIR/.env" ]; then
    log_warning ".env file not found"
    log_info "Creating .env from .env.example..."

    if [ -f "$SCRIPT_DIR/.env.example" ]; then
        cp "$SCRIPT_DIR/.env.example" "$SCRIPT_DIR/.env"
        log_success ".env file created"
        log_warning "Please review and configure $SCRIPT_DIR/.env with your settings"
        echo
        read -p "Press Enter to continue after configuring .env, or Ctrl+C to exit..."
    else
        log_error ".env.example not found"
        exit 1
    fi
else
    log_success ".env file exists"
fi

# Load environment variables
source "$SCRIPT_DIR/.env"

echo

###############################################################################
# PostgreSQL Check
###############################################################################

log_info "Checking PostgreSQL..."
echo

# Check if PostgreSQL is running
if pg_isready -h ${MODERATOR_PG_HOST:-localhost} -p ${MODERATOR_PG_PORT:-5432} &> /dev/null; then
    log_success "PostgreSQL is running"

    # Check if database exists
    if psql -h ${MODERATOR_PG_HOST:-localhost} -p ${MODERATOR_PG_PORT:-5432} -U ${MODERATOR_PG_USER:-postgres} -lqt | cut -d \| -f 1 | grep -qw ${MODERATOR_PG_DATABASE:-exprsn_moderator}; then
        log_success "Database '${MODERATOR_PG_DATABASE:-exprsn_moderator}' exists"
    else
        log_warning "Database '${MODERATOR_PG_DATABASE:-exprsn_moderator}' does not exist"
        log_info "Creating database..."

        createdb -h ${MODERATOR_PG_HOST:-localhost} -p ${MODERATOR_PG_PORT:-5432} -U ${MODERATOR_PG_USER:-postgres} ${MODERATOR_PG_DATABASE:-exprsn_moderator}

        if [ $? -eq 0 ]; then
            log_success "Database created successfully"
        else
            log_error "Failed to create database"
            log_info "You may need to create it manually:"
            log_info "  createdb ${MODERATOR_PG_DATABASE:-exprsn_moderator}"
        fi
    fi
else
    log_error "PostgreSQL is not running"
    log_info "Please start PostgreSQL:"
    log_info "  macOS: brew services start postgresql"
    log_info "  Linux: sudo systemctl start postgresql"
    exit 1
fi

echo

###############################################################################
# Redis Check
###############################################################################

log_info "Checking Redis..."
echo

if redis-cli -h ${REDIS_HOST:-localhost} -p ${REDIS_PORT:-6379} ping &> /dev/null; then
    log_success "Redis is running"
else
    log_error "Redis is not running"
    log_info "Please start Redis:"
    log_info "  macOS: brew services start redis"
    log_info "  Linux: sudo systemctl start redis"
    exit 1
fi

echo

###############################################################################
# Node Modules Check
###############################################################################

log_info "Checking Node.js dependencies..."
echo

if [ ! -d "$SCRIPT_DIR/node_modules" ]; then
    log_warning "node_modules not found"
    log_info "Installing dependencies..."

    cd "$SCRIPT_DIR"
    npm install

    if [ $? -eq 0 ]; then
        log_success "Dependencies installed"
    else
        log_error "Failed to install dependencies"
        exit 1
    fi
else
    log_success "node_modules exists"
fi

echo

###############################################################################
# CA Service Check
###############################################################################

log_info "Checking CA service..."
echo

CA_PORT=3000
CA_URL=${CA_SERVICE_URL:-http://localhost:3000}

if check_port $CA_PORT "CA Service"; then
    # Verify CA is responding
    if curl -s "$CA_URL/health" > /dev/null 2>&1; then
        log_success "CA service is responding"
    else
        log_warning "CA service port is open but not responding to health checks"
    fi
else
    log_warning "CA service is not running"
    log_info "Attempting to start CA service..."

    cd "$ROOT_DIR/src/exprsn-ca"

    # Check if CA has .env
    if [ ! -f ".env" ]; then
        log_info "Creating CA .env file..."
        if [ -f ".env.example" ]; then
            cp .env.example .env
        fi
    fi

    # Start CA in background
    npm run dev > /dev/null 2>&1 &
    CA_PID=$!

    log_info "CA service started (PID: $CA_PID)"

    # Wait for CA to be ready
    if wait_for_service localhost $CA_PORT "CA Service"; then
        log_success "CA service is ready"
    else
        log_error "Failed to start CA service"
        log_info "Please start it manually:"
        log_info "  cd $ROOT_DIR/src/exprsn-ca && npm run dev"
    fi
fi

echo

###############################################################################
# Herald Service Check (Optional)
###############################################################################

log_info "Checking Herald service (optional)..."
echo

HERALD_PORT=3014
HERALD_URL=${HERALD_SERVICE_URL:-http://localhost:3014}

if check_port $HERALD_PORT "Herald Service"; then
    log_success "Herald service is running"
else
    log_warning "Herald service is not running (notifications will be disabled)"
    log_info "To enable notifications, start Herald service:"
    log_info "  cd $ROOT_DIR/src/exprsn-herald && npm run dev"
fi

echo

###############################################################################
# Database Schema Check
###############################################################################

log_info "Checking database schema..."
echo

# Check if tables exist
TABLE_COUNT=$(psql -h ${MODERATOR_PG_HOST:-localhost} -p ${MODERATOR_PG_PORT:-5432} -U ${MODERATOR_PG_USER:-postgres} -d ${MODERATOR_PG_DATABASE:-exprsn_moderator} -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" 2>/dev/null || echo "0")

if [ "$TABLE_COUNT" -gt 0 ]; then
    log_success "Database schema exists ($TABLE_COUNT tables)"
else
    log_warning "Database schema not found"

    if [ -f "$ROOT_DIR/database/moderator-schema.sql" ]; then
        log_info "Applying database schema..."
        psql -h ${MODERATOR_PG_HOST:-localhost} -p ${MODERATOR_PG_PORT:-5432} -U ${MODERATOR_PG_USER:-postgres} -d ${MODERATOR_PG_DATABASE:-exprsn_moderator} -f "$ROOT_DIR/database/moderator-schema.sql" > /dev/null 2>&1

        if [ $? -eq 0 ]; then
            log_success "Database schema applied"
        else
            log_warning "Failed to apply schema automatically"
            log_info "You may need to apply it manually"
        fi
    else
        log_warning "Schema file not found, tables may need to be created"
    fi
fi

echo

###############################################################################
# Start Moderator Service
###############################################################################

log_info "Starting Exprsn Moderator Service..."
echo

cd "$SCRIPT_DIR"

# Kill any existing moderator service
if check_port 3006 "Moderator Service"; then
    log_warning "Moderator service already running on port 3006"
    read -p "Kill existing service and restart? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        PID=$(lsof -ti:3006)
        kill $PID 2>/dev/null
        sleep 2
        log_info "Existing service killed"
    else
        log_info "Using existing service"
        exit 0
    fi
fi

# Start the service
log_info "Launching moderator service..."
echo

node src/index.js

# Service stopped
echo
log_info "Moderator service stopped"
