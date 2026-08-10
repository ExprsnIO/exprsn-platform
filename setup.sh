#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# ⚠️  DEPRECATION NOTICE
# ═══════════════════════════════════════════════════════════════════════
#
# This script is DEPRECATED and will be removed in a future version.
#
# Please use the modern initialization system instead:
#
#   npm run init       # Initialize databases and configuration
#   npm start          # Start all services
#
# Prerequisites (install manually or via Docker):
#   - PostgreSQL 12+ (brew install postgresql@15)
#   - Redis 7+ (brew install redis)
#   - Node.js 18+ (https://nodejs.org)
#
# For more information, see: docs/SETUP_FLOW.md
#
# ═══════════════════════════════════════════════════════════════════════
# Exprsn Certificate Authority - Legacy System Setup Script
# ═══════════════════════════════════════════════════════════════════════
#
# This script installs and configures all required services for the
# Exprsn CA ecosystem.
#
# Installation Methods (in order of preference):
# 1. Native binary installations from vendor repositories
# 2. Docker containers
# 3. Homebrew (macOS fallback)
#
# Services Installed:
# - PostgreSQL (database)
# - Nginx (reverse proxy)
# - RabbitMQ / Apache Artemis (message queue)
# - Redis (caching)
# - Sendmail / Postfix (mail transfer agent)
# - Dovecot (IMAP server)
# - OpenLDAP (directory service)
# - OpenSSH (secure shell)
# - Kerberos (authentication)
#
# Usage:
#   ./setup.sh [options]
#
# Options:
#   --environment=<dev|staging|prod>  Environment to set up (default: dev)
#   --install-method=<native|docker|brew>  Installation method preference
#   --services=<service1,service2>    Comma-separated list of services to install
#   --skip-services=<service1>        Services to skip
#   --no-interactive                  Run in non-interactive mode
#   --help                            Show this help message
#
# ═══════════════════════════════════════════════════════════════════════

set -e  # Exit on error
set -u  # Exit on undefined variable

# ───────────────────────────────────────────────────────────────────────
# Configuration
# ───────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="${SCRIPT_DIR}/setup.log"
ENVIRONMENT="development"
INSTALL_METHOD="auto"
INTERACTIVE=true
SERVICES_TO_INSTALL="all"
SERVICES_TO_SKIP=""

# Default service selection
INSTALL_POSTGRESQL=true
INSTALL_NGINX=true
INSTALL_RABBITMQ=true
INSTALL_REDIS=true
# INSTALL_SCYLLADB removed - not using ScyllaDB
INSTALL_SENDMAIL=true
INSTALL_DOVECOT=false
INSTALL_OPENLDAP=false
INSTALL_OPENSSH=true
INSTALL_KERBEROS=false

# Docker usage flags
USE_DOCKER_POSTGRESQL=false
USE_DOCKER_REDIS=false
USE_DOCKER_RABBITMQ=false
# USE_DOCKER_SCYLLADB removed - not using ScyllaDB
USE_DOCKER_OPENLDAP=false

# Detect OS
OS_TYPE="$(uname -s)"
OS_ARCH="$(uname -m)"

# ───────────────────────────────────────────────────────────────────────
# Color Output
# ───────────────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
  echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
  echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

info() {
  echo -e "${BLUE}[INFO]${NC} $1" | tee -a "$LOG_FILE"
}

# ───────────────────────────────────────────────────────────────────────
# Parse Arguments
# ───────────────────────────────────────────────────────────────────────

parse_args() {
  for arg in "$@"; do
    case $arg in
      --environment=*)
        ENVIRONMENT="${arg#*=}"
        ;;
      --install-method=*)
        INSTALL_METHOD="${arg#*=}"
        ;;
      --services=*)
        SERVICES_TO_INSTALL="${arg#*=}"
        ;;
      --skip-services=*)
        SERVICES_TO_SKIP="${arg#*=}"
        ;;
      --no-interactive)
        INTERACTIVE=false
        ;;
      --help)
        show_help
        exit 0
        ;;
      *)
        error "Unknown argument: $arg"
        show_help
        exit 1
        ;;
    esac
  done
}

show_help() {
  cat << EOF
Exprsn CA Setup Script

Usage: ./setup.sh [options]

Options:
  --environment=<dev|staging|prod>  Environment to set up (default: dev)
  --install-method=<native|docker|brew>  Installation method preference
  --services=<service1,service2>    Comma-separated list of services
  --skip-services=<service1>        Services to skip
  --no-interactive                  Run in non-interactive mode
  --help                            Show this help message

Services:
  postgresql, nginx, rabbitmq, redis, sendmail, dovecot,
  openldap, openssh, kerberos

Examples:
  # Install all services for development
  ./setup.sh --environment=dev

  # Install only PostgreSQL and Redis using Docker
  ./setup.sh --services=postgresql,redis --install-method=docker

  # Install all except RabbitMQ
  ./setup.sh --skip-services=rabbitmq

EOF
}

# ───────────────────────────────────────────────────────────────────────
# Utility Functions
# ───────────────────────────────────────────────────────────────────────

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

service_running() {
  if [[ "$OS_TYPE" == "Darwin" ]]; then
    # macOS
    brew services list 2>/dev/null | grep -q "^$1.*started" && return 0
    return 1
  elif [[ "$OS_TYPE" == "Linux" ]]; then
    # Linux
    systemctl is-active --quiet "$1" 2>/dev/null && return 0
    return 1
  fi
  return 1
}

start_service() {
  local service=$1
  info "Starting $service..."

  if [[ "$OS_TYPE" == "Darwin" ]]; then
    brew services start "$service" || warn "Failed to start $service"
  elif [[ "$OS_TYPE" == "Linux" ]]; then
    sudo systemctl start "$service" || warn "Failed to start $service"
    sudo systemctl enable "$service" || warn "Failed to enable $service"
  fi
}

# ───────────────────────────────────────────────────────────────────────
# System Requirements Check
# ───────────────────────────────────────────────────────────────────────

check_system_requirements() {
  log "Checking system requirements..."

  # Check OS
  case "$OS_TYPE" in
    Linux)
      log "Detected Linux system"
      ;;
    Darwin)
      log "Detected macOS system"
      ;;
    *)
      error "Unsupported operating system: $OS_TYPE"
      exit 1
      ;;
  esac

  # Check architecture
  case "$OS_ARCH" in
    x86_64|amd64)
      log "Detected x86_64 architecture"
      ;;
    arm64|aarch64)
      log "Detected ARM64 architecture"
      ;;
    *)
      warn "Detected unusual architecture: $OS_ARCH"
      ;;
  esac

  # Check for sudo/root
  if [[ "$EUID" -ne 0 ]] && ! command_exists sudo; then
    error "This script requires sudo privileges"
    exit 1
  fi

  # Check disk space (require at least 10GB free)
  local free_space
  if [[ "$OS_TYPE" == "Darwin" ]]; then
    free_space=$(df -g / | tail -1 | awk '{print $4}')
  else
    free_space=$(df -BG / | tail -1 | awk '{print $4}' | sed 's/G//')
  fi

  if [[ $free_space -lt 10 ]]; then
    warn "Low disk space: ${free_space}GB free. Recommended: 10GB+"
  fi

  success "System requirements check passed"
}

# ───────────────────────────────────────────────────────────────────────
# Package Manager Detection and Setup
# ───────────────────────────────────────────────────────────────────────

setup_package_manager() {
  log "Setting up package manager..."

  if [[ "$OS_TYPE" == "Darwin" ]]; then
    # macOS - Check for Homebrew
    if ! command_exists brew; then
      info "Installing Homebrew..."
      /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    success "Homebrew is available"

  elif [[ "$OS_TYPE" == "Linux" ]]; then
    # Linux - Detect distribution
    if [ -f /etc/os-release ]; then
      . /etc/os-release
      case "$ID" in
        ubuntu|debian)
          log "Detected Debian/Ubuntu system"
          sudo apt-get update
          ;;
        centos|rhel|fedora)
          log "Detected RedHat/CentOS/Fedora system"
          sudo yum update -y || sudo dnf update -y
          ;;
        arch)
          log "Detected Arch Linux system"
          sudo pacman -Sy
          ;;
        *)
          warn "Unknown Linux distribution: $ID"
          ;;
      esac
    fi
  fi
}

# ───────────────────────────────────────────────────────────────────────
# Docker Setup
# ───────────────────────────────────────────────────────────────────────

setup_docker() {
  if [[ "$INSTALL_METHOD" == "docker" ]] || [[ "$USE_DOCKER_POSTGRESQL" == true ]] || \
     [[ "$USE_DOCKER_REDIS" == true ]] || [[ "$USE_DOCKER_RABBITMQ" == true ]] || \
     [[ "$USE_DOCKER_OPENLDAP" == true ]]; then

    if ! command_exists docker; then
      log "Installing Docker..."

      if [[ "$OS_TYPE" == "Darwin" ]]; then
        warn "Please install Docker Desktop for Mac from: https://www.docker.com/products/docker-desktop"
        exit 1
      elif [[ "$OS_TYPE" == "Linux" ]]; then
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        rm get-docker.sh
        sudo usermod -aG docker "$USER"
        success "Docker installed. Please log out and back in for group changes to take effect"
      fi
    fi

    # Check docker-compose
    if ! command_exists docker-compose && ! docker compose version >/dev/null 2>&1; then
      log "Installing docker-compose..."
      if [[ "$OS_TYPE" == "Linux" ]]; then
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
          -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
      fi
    fi

    success "Docker is ready"
  fi
}

# ═══════════════════════════════════════════════════════════════════════
# SERVICE INSTALLATIONS
# ═══════════════════════════════════════════════════════════════════════

# ───────────────────────────────────────────────────────────────────────
# PostgreSQL Installation
# ───────────────────────────────────────────────────────────────────────

install_postgresql() {
  log "Installing PostgreSQL..."

  if command_exists psql && command_exists postgres; then
    success "PostgreSQL already installed"
    return 0
  fi

  if [[ "$INSTALL_METHOD" == "docker" ]] || [[ "$USE_DOCKER_POSTGRESQL" == true ]]; then
    install_postgresql_docker
  elif [[ "$OS_TYPE" == "Darwin" ]]; then
    if [[ "$INSTALL_METHOD" == "brew" ]] || ! install_postgresql_native_macos; then
      install_postgresql_brew
    fi
  elif [[ "$OS_TYPE" == "Linux" ]]; then
    install_postgresql_native_linux
  fi
}

install_postgresql_native_macos() {
  # Try to install from Postgres.app or official PostgreSQL installer
  if [ -d "/Applications/Postgres.app" ]; then
    success "PostgreSQL (Postgres.app) is already installed"
    return 0
  fi

  # Download PostgreSQL installer
  warn "Native PostgreSQL installer not implemented for macOS yet. Falling back to Homebrew."
  return 1
}

install_postgresql_brew() {
  log "Installing PostgreSQL via Homebrew..."
  brew install postgresql@15
  brew services start postgresql@15

  # Wait for PostgreSQL to start
  sleep 5

  success "PostgreSQL installed via Homebrew"
}

install_postgresql_native_linux() {
  log "Installing PostgreSQL natively on Linux..."

  if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "$ID" in
      ubuntu|debian)
        # Add PostgreSQL repository
        sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
        wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
        sudo apt-get update
        sudo apt-get install -y postgresql-15 postgresql-contrib-15
        ;;
      centos|rhel|fedora)
        sudo yum install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E %{rhel})-x86_64/pgdg-redhat-repo-latest.noarch.rpm
        sudo yum install -y postgresql15-server postgresql15-contrib
        sudo /usr/pgsql-15/bin/postgresql-15-setup initdb
        ;;
      *)
        error "Unsupported Linux distribution for native PostgreSQL installation"
        return 1
        ;;
    esac
  fi

  start_service postgresql
  success "PostgreSQL installed natively"
}

install_postgresql_docker() {
  log "Installing PostgreSQL via Docker..."

  docker run -d \
    --name exprsn-postgres \
    -e POSTGRES_PASSWORD=exprsn_dev_password \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_DB=postgres \
    -p 5432:5432 \
    -v exprsn-postgres-data:/var/lib/postgresql/data \
    --restart unless-stopped \
    postgres:15-alpine

  success "PostgreSQL running in Docker container"
}

# ───────────────────────────────────────────────────────────────────────
# Redis Installation
# ───────────────────────────────────────────────────────────────────────

install_redis() {
  log "Installing Redis..."

  if command_exists redis-server || command_exists redis-cli; then
    success "Redis already installed"
    return 0
  fi

  if [[ "$INSTALL_METHOD" == "docker" ]] || [[ "$USE_DOCKER_REDIS" == true ]]; then
    install_redis_docker
  elif [[ "$OS_TYPE" == "Darwin" ]]; then
    install_redis_brew
  elif [[ "$OS_TYPE" == "Linux" ]]; then
    install_redis_native_linux
  fi
}

install_redis_brew() {
  log "Installing Redis via Homebrew..."
  brew install redis
  brew services start redis
  success "Redis installed via Homebrew"
}

install_redis_native_linux() {
  log "Installing Redis natively on Linux..."

  if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "$ID" in
      ubuntu|debian)
        sudo apt-get install -y redis-server
        ;;
      centos|rhel|fedora)
        sudo yum install -y redis
        ;;
      *)
        error "Unsupported Linux distribution"
        return 1
        ;;
    esac
  fi

  start_service redis
  success "Redis installed natively"
}

install_redis_docker() {
  log "Installing Redis via Docker..."

  docker run -d \
    --name exprsn-redis \
    -p 6379:6379 \
    -v exprsn-redis-data:/data \
    --restart unless-stopped \
    redis:7-alpine redis-server --appendonly yes

  success "Redis running in Docker container"
}

# ───────────────────────────────────────────────────────────────────────
# RabbitMQ Installation
# ───────────────────────────────────────────────────────────────────────

install_rabbitmq() {
  log "Installing RabbitMQ..."

  if command_exists rabbitmq-server || command_exists rabbitmqctl; then
    success "RabbitMQ already installed"
    return 0
  fi

  if [[ "$INSTALL_METHOD" == "docker" ]] || [[ "$USE_DOCKER_RABBITMQ" == true ]]; then
    install_rabbitmq_docker
  elif [[ "$OS_TYPE" == "Darwin" ]]; then
    install_rabbitmq_brew
  elif [[ "$OS_TYPE" == "Linux" ]]; then
    install_rabbitmq_native_linux
  fi
}

install_rabbitmq_brew() {
  log "Installing RabbitMQ via Homebrew..."
  brew install rabbitmq
  brew services start rabbitmq

  # Enable management plugin
  /usr/local/opt/rabbitmq/sbin/rabbitmq-plugins enable rabbitmq_management

  success "RabbitMQ installed via Homebrew (Management UI: http://localhost:15672)"
}

install_rabbitmq_native_linux() {
  log "Installing RabbitMQ natively on Linux..."

  if [ -f /etc/os-release ]; then
    . /etc/os-release
    case "$ID" in
      ubuntu|debian)
        # Add RabbitMQ repository
        curl -fsSL https://github.com/rabbitmq/signing-keys/releases/download/2.0/rabbitmq-release-signing-key.asc | sudo apt-key add -
        echo "deb https://dl.cloudsmith.io/public/rabbitmq/rabbitmq-server/deb/ubuntu $(lsb_release -cs) main" | sudo tee /etc/apt/sources.list.d/rabbitmq.list
        sudo apt-get update
        sudo apt-get install -y rabbitmq-server
        ;;
      centos|rhel|fedora)
        sudo yum install -y rabbitmq-server
        ;;
      *)
        error "Unsupported Linux distribution"
        return 1
        ;;
    esac
  fi

  start_service rabbitmq-server
  sudo rabbitmq-plugins enable rabbitmq_management

  success "RabbitMQ installed natively"
}

install_rabbitmq_docker() {
  log "Installing RabbitMQ via Docker..."

  docker run -d \
    --name exprsn-rabbitmq \
    -p 5672:5672 \
    -p 15672:15672 \
    -e RABBITMQ_DEFAULT_USER=exprsn \
    -e RABBITMQ_DEFAULT_PASS=exprsn_dev_password \
    -v exprsn-rabbitmq-data:/var/lib/rabbitmq \
    --restart unless-stopped \
    rabbitmq:3-management-alpine

  success "RabbitMQ running in Docker container (Management UI: http://localhost:15672)"
}

# ───────────────────────────────────────────────────────────────────────
# Nginx Installation
# ───────────────────────────────────────────────────────────────────────

install_nginx() {
  log "Installing Nginx..."

  if command_exists nginx; then
    success "Nginx already installed"
    return 0
  fi

  if [[ "$OS_TYPE" == "Darwin" ]]; then
    brew install nginx
    brew services start nginx
  elif [[ "$OS_TYPE" == "Linux" ]]; then
    if [ -f /etc/os-release ]; then
      . /etc/os-release
      case "$ID" in
        ubuntu|debian)
          sudo apt-get install -y nginx
          ;;
        centos|rhel|fedora)
          sudo yum install -y nginx
          ;;
      esac
    fi
    start_service nginx
  fi

  success "Nginx installed"
}

# ───────────────────────────────────────────────────────────────────────
# Sendmail/Postfix Installation
# ───────────────────────────────────────────────────────────────────────

install_sendmail() {
  log "Installing mail transfer agent..."

  if command_exists sendmail || command_exists postfix; then
    success "Mail transfer agent already installed"
    return 0
  fi

  if [[ "$OS_TYPE" == "Darwin" ]]; then
    # macOS has sendmail built-in
    success "Sendmail available (built-in)"
  elif [[ "$OS_TYPE" == "Linux" ]]; then
    if [ -f /etc/os-release ]; then
      . /etc/os-release
      case "$ID" in
        ubuntu|debian)
          sudo apt-get install -y postfix
          ;;
        centos|rhel|fedora)
          sudo yum install -y postfix
          ;;
      esac
    fi
    start_service postfix
    success "Postfix installed"
  fi
}

# ───────────────────────────────────────────────────────────────────────
# Dovecot Installation
# ───────────────────────────────────────────────────────────────────────

install_dovecot() {
  log "Installing Dovecot IMAP server..."

  if command_exists dovecot; then
    success "Dovecot already installed"
    return 0
  fi

  if [[ "$OS_TYPE" == "Linux" ]]; then
    if [ -f /etc/os-release ]; then
      . /etc/os-release
      case "$ID" in
        ubuntu|debian)
          sudo apt-get install -y dovecot-core dovecot-imapd
          ;;
        centos|rhel|fedora)
          sudo yum install -y dovecot
          ;;
      esac
    fi
    start_service dovecot
    success "Dovecot installed"
  else
    warn "Dovecot installation not supported on macOS"
  fi
}

# ───────────────────────────────────────────────────────────────────────
# OpenLDAP Installation
# ───────────────────────────────────────────────────────────────────────

install_openldap() {
  log "Installing OpenLDAP..."

  if command_exists slapd || command_exists ldapsearch; then
    success "OpenLDAP already installed"
    return 0
  fi

  if [[ "$INSTALL_METHOD" == "docker" ]] || [[ "$USE_DOCKER_OPENLDAP" == true ]]; then
    install_openldap_docker
  elif [[ "$OS_TYPE" == "Darwin" ]]; then
    brew install openldap
    success "OpenLDAP installed via Homebrew"
  elif [[ "$OS_TYPE" == "Linux" ]]; then
    if [ -f /etc/os-release ]; then
      . /etc/os-release
      case "$ID" in
        ubuntu|debian)
          sudo apt-get install -y slapd ldap-utils
          sudo dpkg-reconfigure -plow slapd
          ;;
        centos|rhel|fedora)
          sudo yum install -y openldap openldap-servers openldap-clients
          ;;
      esac
    fi
    success "OpenLDAP installed natively"
  fi
}

install_openldap_docker() {
  log "Installing OpenLDAP via Docker..."

  docker run -d \
    --name exprsn-openldap \
    -p 389:389 \
    -p 636:636 \
    -e LDAP_ORGANISATION="Exprsn IO" \
    -e LDAP_DOMAIN="exprsn.io" \
    -e LDAP_ADMIN_PASSWORD="admin_password" \
    -v exprsn-ldap-data:/var/lib/ldap \
    -v exprsn-ldap-config:/etc/ldap/slapd.d \
    --restart unless-stopped \
    osixia/openldap:latest

  success "OpenLDAP running in Docker container"
}

# ───────────────────────────────────────────────────────────────────────
# OpenSSH Installation
# ───────────────────────────────────────────────────────────────────────

install_openssh() {
  log "Checking OpenSSH..."

  if command_exists ssh && command_exists sshd; then
    success "OpenSSH already installed"
    return 0
  fi

  if [[ "$OS_TYPE" == "Darwin" ]]; then
    # macOS has OpenSSH built-in
    success "OpenSSH available (built-in)"
  elif [[ "$OS_TYPE" == "Linux" ]]; then
    if [ -f /etc/os-release ]; then
      . /etc/os-release
      case "$ID" in
        ubuntu|debian)
          sudo apt-get install -y openssh-server
          ;;
        centos|rhel|fedora)
          sudo yum install -y openssh-server
          ;;
      esac
    fi
    start_service sshd
    success "OpenSSH installed"
  fi
}

# ───────────────────────────────────────────────────────────────────────
# Kerberos Installation
# ───────────────────────────────────────────────────────────────────────

install_kerberos() {
  log "Installing Kerberos..."

  if command_exists kadmin || command_exists kinit; then
    success "Kerberos already installed"
    return 0
  fi

  if [[ "$OS_TYPE" == "Darwin" ]]; then
    # macOS has Kerberos built-in
    success "Kerberos available (built-in)"
  elif [[ "$OS_TYPE" == "Linux" ]]; then
    if [ -f /etc/os-release ]; then
      . /etc/os-release
      case "$ID" in
        ubuntu|debian)
          sudo apt-get install -y krb5-kdc krb5-admin-server krb5-user
          ;;
        centos|rhel|fedora)
          sudo yum install -y krb5-server krb5-workstation
          ;;
      esac
    fi
    success "Kerberos installed"
  fi
}

# ═══════════════════════════════════════════════════════════════════════
# DATABASE INITIALIZATION
# ═══════════════════════════════════════════════════════════════════════

create_databases() {
  log "Creating databases..."

  # Wait for PostgreSQL to be ready
  local retries=0
  until pg_isready -h localhost -U postgres >/dev/null 2>&1 || [ $retries -eq 10 ]; do
    info "Waiting for PostgreSQL to be ready..."
    sleep 3
    ((retries++))
  done

  if [ $retries -eq 10 ]; then
    error "PostgreSQL did not become ready in time"
    return 1
  fi

  # Source the database creation script
  bash "${SCRIPT_DIR}/scripts/create-databases.sh" --environment="$ENVIRONMENT"

  success "Databases created"
}

# ═══════════════════════════════════════════════════════════════════════
# CERTIFICATE AUTHORITY SETUP
# ═══════════════════════════════════════════════════════════════════════

setup_certificate_authority() {
  log "Setting up Certificate Authority..."

  # Copy environment template
  if [ ! -f "${SCRIPT_DIR}/.env" ]; then
    if [ "$ENVIRONMENT" == "production" ]; then
      cp "${SCRIPT_DIR}/.env.production.example" "${SCRIPT_DIR}/.env"
    else
      cp "${SCRIPT_DIR}/.env.development.example" "${SCRIPT_DIR}/.env"
    fi
    info "Environment file created from template"
  fi

  # Generate JWT keys and session secret
  info "Generating cryptographic keys..."
  node "${SCRIPT_DIR}/src/exprsn-ca/scripts/setup.js" --non-interactive

  success "Certificate Authority configured"
}

# ═══════════════════════════════════════════════════════════════════════
# NODE.JS DEPENDENCIES
# ═══════════════════════════════════════════════════════════════════════

install_node_dependencies() {
  log "Installing Node.js dependencies..."

  if ! command_exists node; then
    error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
  fi

  cd "$SCRIPT_DIR"
  npm install

  success "Node.js dependencies installed"
}

# ═══════════════════════════════════════════════════════════════════════
# MAIN INSTALLATION FLOW
# ═══════════════════════════════════════════════════════════════════════

main() {
  echo "╔═══════════════════════════════════════════════════════════════════════╗"
  echo "║          Exprsn Certificate Authority - Comprehensive Setup          ║"
  echo "╚═══════════════════════════════════════════════════════════════════════╝"
  echo ""

  # Parse arguments
  parse_args "$@"

  # Log setup details
  log "Environment: $ENVIRONMENT"
  log "Installation method: $INSTALL_METHOD"
  log "Log file: $LOG_FILE"
  echo ""

  # System checks
  check_system_requirements
  setup_package_manager
  setup_docker

  # Install services (in order of dependency)
  echo ""
  log "═══════════════════════════════════════════════════════════════"
  log "Installing Infrastructure Services"
  log "═══════════════════════════════════════════════════════════════"

  # 1. PostgreSQL (required first - database for CA)
  [[ "$INSTALL_POSTGRESQL" == true ]] && install_postgresql

  # 2. Redis (caching)
  [[ "$INSTALL_REDIS" == true ]] && install_redis

  # 3. RabbitMQ (message queue)
  [[ "$INSTALL_RABBITMQ" == true ]] && install_rabbitmq

  # 4. Nginx (reverse proxy)
  [[ "$INSTALL_NGINX" == true ]] && install_nginx

  # 5. Mail services
  [[ "$INSTALL_SENDMAIL" == true ]] && install_sendmail
  [[ "$INSTALL_DOVECOT" == true ]] && install_dovecot

  # 6. Directory and authentication services
  [[ "$INSTALL_OPENLDAP" == true ]] && install_openldap
  [[ "$INSTALL_KERBEROS" == true ]] && install_kerberos

  # 7. SSH
  [[ "$INSTALL_OPENSSH" == true ]] && install_openssh

  # Initialize databases and create service users
  echo ""
  log "═══════════════════════════════════════════════════════════════"
  log "Initializing Databases"
  log "═══════════════════════════════════════════════════════════════"
  create_databases

  # Setup Certificate Authority (FIRST - before other services)
  echo ""
  log "═══════════════════════════════════════════════════════════════"
  log "Setting Up Certificate Authority"
  log "═══════════════════════════════════════════════════════════════"
  setup_certificate_authority

  # Install Node.js dependencies
  echo ""
  log "═══════════════════════════════════════════════════════════════"
  log "Installing Application Dependencies"
  log "═══════════════════════════════════════════════════════════════"
  install_node_dependencies

  # Final summary
  echo ""
  echo "╔═══════════════════════════════════════════════════════════════════════╗"
  echo "║                     Setup Completed Successfully!                     ║"
  echo "╚═══════════════════════════════════════════════════════════════════════╝"
  echo ""
  success "All services installed and configured"
  echo ""
  echo "Next steps:"
  echo "  1. Review and update .env file with your production settings"
  echo "  2. Complete the CA setup wizard: npm start, then visit http://localhost:3000/setup"
  echo "  3. Configure Nginx reverse proxy (optional)"
  echo ""
  echo "Service URLs (if running locally):"
  echo "  - CA Web Interface: http://localhost:3000"
  echo "  - RabbitMQ Management: http://localhost:15672 (exprsn/exprsn_dev_password)"
  echo "  - PostgreSQL: localhost:5432"
  echo "  - Redis: localhost:6379"
  echo ""
  echo "For more information, see: README.md and CLAUDE.md"
  echo ""
}

# Run main function
main "$@"
