#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# Exprsn Production Installation Script
# ═══════════════════════════════════════════════════════════════════════
#
# Comprehensive installation script for deploying Exprsn Certificate
# Authority and all ecosystem services on production servers.
#
# Supported Operating Systems:
#   - Ubuntu 20.04, 22.04, 24.04
#   - Debian 11, 12
#   - Fedora 38, 39, 40
#   - macOS 12+
#
# Services Installed:
#   - Node.js 18+ (from NodeSource repository)
#   - PostgreSQL 15+ (from official PostgreSQL repository)
#   - Redis 7+ (from official Redis repository)
#   - Nginx or Apache2 (reverse proxy)
#   - Optional: RabbitMQ, Dovecot, Postfix
#
# Installation Methods:
#   - Native binary installations (no Homebrew on macOS)
#   - Official vendor repositories
#   - Direct source compilation for macOS
#
# Usage:
#   sudo ./install.sh [options]
#
# Options:
#   --environment=<dev|staging|prod>     Environment (default: production)
#   --web-server=<nginx|apache2>         Web server choice (default: nginx)
#   --install=<service1,service2>        Specific services to install
#   --skip=<service1,service2>           Services to skip
#   --ssl                                Enable SSL/TLS setup
#   --domain=<example.com>               Domain name for SSL
#   --email=<admin@example.com>          Email for SSL certificates
#   --no-interactive                     Non-interactive mode
#   --help                               Show help message
#
# Examples:
#   # Full production installation with Nginx and SSL
#   sudo ./install.sh --environment=prod --ssl --domain=exprsn.example.com
#
#   # Development installation without SSL
#   sudo ./install.sh --environment=dev --web-server=nginx
#
#   # Install only Node.js and PostgreSQL
#   sudo ./install.sh --install=nodejs,postgresql
#
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail  # Exit on error, undefined vars, pipe failures
IFS=$'\n\t'        # Sane IFS

# ───────────────────────────────────────────────────────────────────────
# Script Configuration
# ───────────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
LIB_DIR="${SCRIPT_DIR}/lib"
CONFIG_DIR="${SCRIPT_DIR}/configs"
SERVICES_DIR="${SCRIPT_DIR}/services"
LOG_FILE="/var/log/exprsn-install.log"

# Installation Configuration
ENVIRONMENT="${ENVIRONMENT:-production}"
WEB_SERVER="${WEB_SERVER:-nginx}"
ENABLE_SSL="${ENABLE_SSL:-false}"
DOMAIN="${DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
INTERACTIVE="${INTERACTIVE:-true}"
INSTALL_USER="${INSTALL_USER:-exprsn}"

# Service Installation Flags
INSTALL_NODEJS=true
INSTALL_POSTGRESQL=true
INSTALL_REDIS=true
INSTALL_WEBSERVER=true
INSTALL_RABBITMQ=false
INSTALL_POSTFIX=true
INSTALL_DOVECOT=false

# Version Requirements
NODEJS_VERSION="20"
POSTGRESQL_VERSION="15"
REDIS_VERSION="7.2"

# Detect OS
OS_TYPE="$(uname -s)"
OS_ARCH="$(uname -m)"
OS_DISTRO=""
OS_VERSION=""
OS_CODENAME=""

# ───────────────────────────────────────────────────────────────────────
# Color Output Functions
# ───────────────────────────────────────────────────────────────────────

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log() {
    local timestamp
    timestamp="$(date +'%Y-%m-%d %H:%M:%S')"
    echo -e "${GREEN}[${timestamp}] [INFO]${NC} $*" | tee -a "$LOG_FILE"
}

warn() {
    local timestamp
    timestamp="$(date +'%Y-%m-%d %H:%M:%S')"
    echo -e "${YELLOW}[${timestamp}] [WARN]${NC} $*" | tee -a "$LOG_FILE"
}

error() {
    local timestamp
    timestamp="$(date +'%Y-%m-%d %H:%M:%S')"
    echo -e "${RED}[${timestamp}] [ERROR]${NC} $*" | tee -a "$LOG_FILE"
}

success() {
    local timestamp
    timestamp="$(date +'%Y-%m-%d %H:%M:%S')"
    echo -e "${GREEN}[${timestamp}] [SUCCESS]${NC} $*" | tee -a "$LOG_FILE"
}

info() {
    local timestamp
    timestamp="$(date +'%Y-%m-%d %H:%M:%S')"
    echo -e "${BLUE}[${timestamp}] [INFO]${NC} $*" | tee -a "$LOG_FILE"
}

header() {
    echo "" | tee -a "$LOG_FILE"
    echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
    echo "$*" | tee -a "$LOG_FILE"
    echo "═══════════════════════════════════════════════════════════════" | tee -a "$LOG_FILE"
    echo "" | tee -a "$LOG_FILE"
}

# ───────────────────────────────────────────────────────────────────────
# Utility Functions
# ───────────────────────────────────────────────────────────────────────

command_exists() {
    command -v "$1" >/dev/null 2>&1
}

service_exists() {
    if [[ "$OS_TYPE" == "Linux" ]]; then
        systemctl list-unit-files | grep -q "^$1.service"
    elif [[ "$OS_TYPE" == "Darwin" ]]; then
        launchctl list | grep -q "$1"
    fi
}

service_running() {
    if [[ "$OS_TYPE" == "Linux" ]]; then
        systemctl is-active --quiet "$1" 2>/dev/null
    elif [[ "$OS_TYPE" == "Darwin" ]]; then
        launchctl list | grep -q "$1"
    fi
}

# ───────────────────────────────────────────────────────────────────────
# Argument Parsing
# ───────────────────────────────────────────────────────────────────────

show_help() {
    cat << 'EOF'
Exprsn Production Installation Script

Usage: sudo ./install.sh [options]

Options:
  --environment=<env>     Environment: dev, staging, or prod (default: production)
  --web-server=<server>   Web server: nginx or apache2 (default: nginx)
  --install=<services>    Comma-separated list of services to install
  --skip=<services>       Comma-separated list of services to skip
  --ssl                   Enable SSL/TLS certificate setup
  --domain=<domain>       Domain name for SSL certificates
  --email=<email>         Admin email for SSL certificates
  --no-interactive        Run in non-interactive mode
  --help                  Show this help message

Available Services:
  nodejs, postgresql, redis, nginx, apache2, rabbitmq, postfix, dovecot

Examples:
  # Full production installation
  sudo ./install.sh --environment=prod --web-server=nginx --ssl --domain=exprsn.io

  # Development installation
  sudo ./install.sh --environment=dev

  # Install only specific services
  sudo ./install.sh --install=nodejs,postgresql,redis

For more information, see: README.md
EOF
}

parse_arguments() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --environment=*)
                ENVIRONMENT="${1#*=}"
                ;;
            --web-server=*)
                WEB_SERVER="${1#*=}"
                ;;
            --install=*)
                local services="${1#*=}"
                # Disable all services first
                INSTALL_NODEJS=false
                INSTALL_POSTGRESQL=false
                INSTALL_REDIS=false
                INSTALL_WEBSERVER=false
                INSTALL_RABBITMQ=false
                INSTALL_POSTFIX=false
                INSTALL_DOVECOT=false
                # Enable specified services
                IFS=',' read -ra SERVICES <<< "$services"
                for service in "${SERVICES[@]}"; do
                    case "$service" in
                        nodejs) INSTALL_NODEJS=true ;;
                        postgresql) INSTALL_POSTGRESQL=true ;;
                        redis) INSTALL_REDIS=true ;;
                        nginx|apache2) INSTALL_WEBSERVER=true; WEB_SERVER="$service" ;;
                        rabbitmq) INSTALL_RABBITMQ=true ;;
                        postfix) INSTALL_POSTFIX=true ;;
                        dovecot) INSTALL_DOVECOT=true ;;
                        *) warn "Unknown service: $service" ;;
                    esac
                done
                ;;
            --skip=*)
                local services="${1#*=}"
                IFS=',' read -ra SERVICES <<< "$services"
                for service in "${SERVICES[@]}"; do
                    case "$service" in
                        nodejs) INSTALL_NODEJS=false ;;
                        postgresql) INSTALL_POSTGRESQL=false ;;
                        redis) INSTALL_REDIS=false ;;
                        nginx|apache2) INSTALL_WEBSERVER=false ;;
                        rabbitmq) INSTALL_RABBITMQ=false ;;
                        postfix) INSTALL_POSTFIX=false ;;
                        dovecot) INSTALL_DOVECOT=false ;;
                        *) warn "Unknown service: $service" ;;
                    esac
                done
                ;;
            --ssl)
                ENABLE_SSL=true
                ;;
            --domain=*)
                DOMAIN="${1#*=}"
                ;;
            --email=*)
                ADMIN_EMAIL="${1#*=}"
                ;;
            --no-interactive)
                INTERACTIVE=false
                ;;
            --help)
                show_help
                exit 0
                ;;
            *)
                error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
        shift
    done
}

# ───────────────────────────────────────────────────────────────────────
# OS Detection
# ───────────────────────────────────────────────────────────────────────

detect_os() {
    log "Detecting operating system..."

    case "$OS_TYPE" in
        Linux)
            if [[ -f /etc/os-release ]]; then
                # shellcheck source=/dev/null
                . /etc/os-release
                OS_DISTRO="$ID"
                OS_VERSION="$VERSION_ID"
                OS_CODENAME="${VERSION_CODENAME:-}"

                case "$OS_DISTRO" in
                    ubuntu)
                        log "Detected Ubuntu $OS_VERSION ($OS_CODENAME)"
                        ;;
                    debian)
                        log "Detected Debian $OS_VERSION ($OS_CODENAME)"
                        ;;
                    fedora)
                        log "Detected Fedora $OS_VERSION"
                        ;;
                    centos|rhel)
                        log "Detected ${ID} $OS_VERSION"
                        ;;
                    *)
                        warn "Detected unsupported Linux distribution: $OS_DISTRO"
                        ;;
                esac
            else
                error "Cannot detect Linux distribution"
                exit 1
            fi
            ;;
        Darwin)
            OS_DISTRO="macos"
            OS_VERSION="$(sw_vers -productVersion)"
            log "Detected macOS $OS_VERSION"
            ;;
        *)
            error "Unsupported operating system: $OS_TYPE"
            exit 1
            ;;
    esac

    # Detect architecture
    case "$OS_ARCH" in
        x86_64|amd64)
            log "Architecture: x86_64"
            ;;
        arm64|aarch64)
            log "Architecture: ARM64"
            ;;
        *)
            warn "Unusual architecture detected: $OS_ARCH"
            ;;
    esac
}

# ───────────────────────────────────────────────────────────────────────
# Pre-installation Checks
# ───────────────────────────────────────────────────────────────────────

check_prerequisites() {
    log "Checking prerequisites..."

    # Check if running as root
    if [[ $EUID -ne 0 ]]; then
        error "This script must be run as root or with sudo"
        exit 1
    fi

    # Check disk space (require at least 10GB free)
    local free_space_kb
    free_space_kb=$(df / | tail -1 | awk '{print $4}')
    local free_space_gb=$((free_space_kb / 1024 / 1024))

    if [[ $free_space_gb -lt 10 ]]; then
        warn "Low disk space: ${free_space_gb}GB free. Recommended: 10GB+"
        if [[ "$INTERACTIVE" == "true" ]]; then
            read -rp "Continue anyway? (y/N) " response
            if [[ ! "$response" =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    else
        log "Disk space: ${free_space_gb}GB free"
    fi

    # Check memory (require at least 2GB)
    local total_mem_kb
    if [[ "$OS_TYPE" == "Darwin" ]]; then
        total_mem_kb=$(sysctl hw.memsize | awk '{print $2/1024}')
    else
        total_mem_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    fi
    local total_mem_gb=$((total_mem_kb / 1024 / 1024))

    if [[ $total_mem_gb -lt 2 ]]; then
        warn "Low memory: ${total_mem_gb}GB total. Recommended: 2GB+"
    else
        log "Memory: ${total_mem_gb}GB total"
    fi

    # Create log file directory
    mkdir -p "$(dirname "$LOG_FILE")"
    touch "$LOG_FILE"
    chmod 644 "$LOG_FILE"

    success "Prerequisites check passed"
}

# ───────────────────────────────────────────────────────────────────────
# Load Helper Libraries
# ───────────────────────────────────────────────────────────────────────

load_libraries() {
    log "Loading helper libraries..."

    # Source all library files
    for lib in "${LIB_DIR}"/*.sh; do
        if [[ -f "$lib" ]]; then
            # shellcheck source=/dev/null
            source "$lib"
            log "Loaded: $(basename "$lib")"
        fi
    done

    success "Libraries loaded"
}

# ───────────────────────────────────────────────────────────────────────
# Main Installation Flow
# ───────────────────────────────────────────────────────────────────────

main() {
    # Print banner
    cat << 'EOF'
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║              Exprsn Production Installation Script                   ║
║                                                                       ║
║                    Certificate Authority Ecosystem                   ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝

EOF

    # Parse arguments
    parse_arguments "$@"

    # Display configuration
    log "Installation Configuration:"
    log "  Environment: $ENVIRONMENT"
    log "  Web Server: $WEB_SERVER"
    log "  SSL Enabled: $ENABLE_SSL"
    log "  Domain: ${DOMAIN:-Not set}"
    log "  Log File: $LOG_FILE"
    echo ""

    # Pre-installation checks
    detect_os
    check_prerequisites

    # Load helper libraries
    load_libraries

    # Update package manager
    header "Updating Package Manager"
    update_package_manager

    # Install Node.js
    if [[ "$INSTALL_NODEJS" == "true" ]]; then
        header "Installing Node.js $NODEJS_VERSION"
        install_nodejs "$NODEJS_VERSION"
    fi

    # Install PostgreSQL
    if [[ "$INSTALL_POSTGRESQL" == "true" ]]; then
        header "Installing PostgreSQL $POSTGRESQL_VERSION"
        install_postgresql "$POSTGRESQL_VERSION"
    fi

    # Install Redis
    if [[ "$INSTALL_REDIS" == "true" ]]; then
        header "Installing Redis $REDIS_VERSION"
        install_redis "$REDIS_VERSION"
    fi

    # Install Web Server
    if [[ "$INSTALL_WEBSERVER" == "true" ]]; then
        header "Installing Web Server ($WEB_SERVER)"
        install_webserver "$WEB_SERVER"
    fi

    # Install RabbitMQ (optional)
    if [[ "$INSTALL_RABBITMQ" == "true" ]]; then
        header "Installing RabbitMQ"
        install_rabbitmq
    fi

    # Install Postfix (optional)
    if [[ "$INSTALL_POSTFIX" == "true" ]]; then
        header "Installing Postfix"
        install_postfix
    fi

    # Install Dovecot (optional)
    if [[ "$INSTALL_DOVECOT" == "true" ]]; then
        header "Installing Dovecot"
        install_dovecot
    fi

    # Create system user
    header "Creating System User"
    create_system_user "$INSTALL_USER"

    # Initialize databases
    header "Initializing Databases"
    initialize_databases

    # Setup Exprsn services
    header "Setting Up Exprsn Services"
    setup_exprsn_services

    # Configure web server
    if [[ "$INSTALL_WEBSERVER" == "true" ]]; then
        header "Configuring Web Server"
        configure_webserver "$WEB_SERVER"
    fi

    # Setup SSL if requested
    if [[ "$ENABLE_SSL" == "true" ]]; then
        header "Setting Up SSL/TLS Certificates"
        setup_ssl_certificates
    fi

    # Configure firewall
    header "Configuring Firewall"
    configure_firewall

    # Start services
    header "Starting Services"
    start_all_services

    # Run health check
    header "Running Health Checks"
    run_health_checks

    # Installation complete
    header "Installation Complete!"
    print_installation_summary
}

# ───────────────────────────────────────────────────────────────────────
# Installation Summary
# ───────────────────────────────────────────────────────────────────────

print_installation_summary() {
    cat << EOF

╔═══════════════════════════════════════════════════════════════════════╗
║                   Installation Completed Successfully!                ║
╚═══════════════════════════════════════════════════════════════════════╝

Installed Services:
$([ "$INSTALL_NODEJS" == "true" ] && echo "  ✓ Node.js $NODEJS_VERSION")
$([ "$INSTALL_POSTGRESQL" == "true" ] && echo "  ✓ PostgreSQL $POSTGRESQL_VERSION")
$([ "$INSTALL_REDIS" == "true" ] && echo "  ✓ Redis $REDIS_VERSION")
$([ "$INSTALL_WEBSERVER" == "true" ] && echo "  ✓ $WEB_SERVER")
$([ "$INSTALL_RABBITMQ" == "true" ] && echo "  ✓ RabbitMQ")
$([ "$INSTALL_POSTFIX" == "true" ] && echo "  ✓ Postfix")
$([ "$INSTALL_DOVECOT" == "true" ] && echo "  ✓ Dovecot")

Service URLs:
  • CA Web Interface: http://${DOMAIN:-localhost}:3000
  • Setup Management: http://${DOMAIN:-localhost}:3015
  • API Gateway: http://${DOMAIN:-localhost}:3010

Database Credentials:
  • PostgreSQL User: postgres
  • Redis Port: 6379

System User:
  • Username: $INSTALL_USER
  • Home Directory: /home/$INSTALL_USER

Next Steps:
  1. Review and update environment files:
     /home/$INSTALL_USER/exprsn/.env

  2. Start Exprsn services:
     sudo systemctl start exprsn-ca
     sudo systemctl start exprsn-*

  3. Access the setup wizard:
     http://${DOMAIN:-localhost}:3015

  4. View service logs:
     sudo journalctl -u exprsn-ca -f

For more information:
  • Documentation: $PROJECT_ROOT/docs/
  • Log file: $LOG_FILE
  • Support: https://github.com/ExprsnIO/Exprsn/issues

EOF
}

# ───────────────────────────────────────────────────────────────────────
# Error Handling
# ───────────────────────────────────────────────────────────────────────

trap 'error "Installation failed at line $LINENO. Check $LOG_FILE for details."; exit 1' ERR

# ───────────────────────────────────────────────────────────────────────
# Run Main Function
# ───────────────────────────────────────────────────────────────────────

main "$@"
