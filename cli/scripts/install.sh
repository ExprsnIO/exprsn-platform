#!/bin/bash
# Exprsn CLI Installation Script
# Supports: Ubuntu, Debian, RHEL, CentOS, Fedora, macOS

set -e

EXPRSN_CLI_VERSION="1.0.0"
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}"
cat << "EOF"
  ______
 |  ____|
 | |__  __  ___ __  _ __ ___ _ __
 |  __| \ \/ / '_ \| '__/ __| '_ \
 | |____ >  <| |_) | |  \__ \ | | |
 |______/_/\_\ .__/|_|  |___/_| |_|
             | |
             |_|
EOF
echo -e "${NC}"
echo -e "${BLUE}Exprsn CLI Installation v${EXPRSN_CLI_VERSION}${NC}"
echo ""

# Detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        VERSION=$VERSION_ID
    elif [ "$(uname)" = "Darwin" ]; then
        OS="macos"
        VERSION=$(sw_vers -productVersion)
    else
        echo -e "${RED}Unable to detect OS${NC}"
        exit 1
    fi

    echo -e "${GREEN}✓ Detected: $OS $VERSION${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install Node.js
install_nodejs() {
    if command_exists node; then
        NODE_VERSION=$(node -v)
        echo -e "${GREEN}✓ Node.js already installed: $NODE_VERSION${NC}"
        return
    fi

    echo -e "${YELLOW}Installing Node.js...${NC}"

    case $OS in
        ubuntu|debian)
            curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
            sudo apt install -y nodejs
            ;;
        centos|rhel|fedora)
            curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
            sudo yum install -y nodejs
            ;;
        macos)
            if command_exists brew; then
                brew install node@18
            else
                echo -e "${RED}Homebrew not found. Please install Node.js manually.${NC}"
                exit 1
            fi
            ;;
    esac

    echo -e "${GREEN}✓ Node.js installed${NC}"
}

# Install PostgreSQL
install_postgresql() {
    if command_exists psql; then
        echo -e "${GREEN}✓ PostgreSQL already installed${NC}"
        return
    fi

    echo -e "${YELLOW}Installing PostgreSQL...${NC}"

    case $OS in
        ubuntu|debian)
            sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
            wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
            sudo apt update
            sudo apt install -y postgresql-15 postgresql-contrib-15
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
            ;;
        centos|rhel|fedora)
            sudo yum install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E %{rhel})-x86_64/pgdg-redhat-repo-latest.noarch.rpm
            sudo yum install -y postgresql15-server postgresql15-contrib
            sudo /usr/pgsql-15/bin/postgresql-15-setup initdb
            sudo systemctl start postgresql-15
            sudo systemctl enable postgresql-15
            ;;
        macos)
            brew install postgresql@15
            brew services start postgresql@15
            ;;
    esac

    echo -e "${GREEN}✓ PostgreSQL installed${NC}"
}

# Install Redis
install_redis() {
    if command_exists redis-cli; then
        echo -e "${GREEN}✓ Redis already installed${NC}"
        return
    fi

    echo -e "${YELLOW}Installing Redis...${NC}"

    case $OS in
        ubuntu|debian)
            sudo apt install -y redis-server
            sudo systemctl start redis-server
            sudo systemctl enable redis-server
            ;;
        centos|rhel|fedora)
            sudo yum install -y redis
            sudo systemctl start redis
            sudo systemctl enable redis
            ;;
        macos)
            brew install redis
            brew services start redis
            ;;
    esac

    echo -e "${GREEN}✓ Redis installed${NC}"
}

# Install Git
install_git() {
    if command_exists git; then
        echo -e "${GREEN}✓ Git already installed${NC}"
        return
    fi

    echo -e "${YELLOW}Installing Git...${NC}"

    case $OS in
        ubuntu|debian)
            sudo apt install -y git
            ;;
        centos|rhel|fedora)
            sudo yum install -y git
            ;;
        macos)
            brew install git
            ;;
    esac

    echo -e "${GREEN}✓ Git installed${NC}"
}

# Install Exprsn CLI
install_cli() {
    echo -e "${YELLOW}Installing Exprsn CLI...${NC}"

    # Navigate to CLI directory
    if [ -d "./cli" ]; then
        cd cli
    elif [ -d "../cli" ]; then
        cd ../cli
    else
        echo -e "${RED}CLI directory not found${NC}"
        exit 1
    fi

    # Install dependencies
    npm install

    # Link globally
    npm link

    echo -e "${GREEN}✓ Exprsn CLI installed${NC}"
}

# Verify installation
verify_installation() {
    echo ""
    echo -e "${BLUE}=== Verifying Installation ===${NC}"
    echo ""

    # Check Node.js
    if command_exists node; then
        echo -e "${GREEN}✓ Node.js: $(node -v)${NC}"
    else
        echo -e "${RED}✗ Node.js not found${NC}"
    fi

    # Check npm
    if command_exists npm; then
        echo -e "${GREEN}✓ npm: $(npm -v)${NC}"
    else
        echo -e "${RED}✗ npm not found${NC}"
    fi

    # Check PostgreSQL
    if command_exists psql; then
        echo -e "${GREEN}✓ PostgreSQL: $(psql --version | awk '{print $3}')${NC}"
    else
        echo -e "${YELLOW}⚠ PostgreSQL not found${NC}"
    fi

    # Check Redis
    if command_exists redis-cli; then
        echo -e "${GREEN}✓ Redis: $(redis-cli --version | awk '{print $2}')${NC}"
    else
        echo -e "${YELLOW}⚠ Redis not found${NC}"
    fi

    # Check Git
    if command_exists git; then
        echo -e "${GREEN}✓ Git: $(git --version | awk '{print $3}')${NC}"
    else
        echo -e "${YELLOW}⚠ Git not found${NC}"
    fi

    # Check Exprsn CLI
    if command_exists exprsn; then
        echo -e "${GREEN}✓ Exprsn CLI: $(exprsn --version)${NC}"
    else
        echo -e "${RED}✗ Exprsn CLI not found${NC}"
    fi

    echo ""
}

# Main installation
main() {
    detect_os

    echo ""
    echo -e "${BLUE}=== Installing Prerequisites ===${NC}"
    echo ""

    install_nodejs
    install_postgresql
    install_redis
    install_git

    echo ""
    echo -e "${BLUE}=== Installing Exprsn CLI ===${NC}"
    echo ""

    install_cli

    verify_installation

    echo -e "${GREEN}"
    cat << "EOF"
 _____                         _
|_   _|                       | |
  | |  _ __  ___  ___    __ _ | |
  | | | '_ \/ __|/ _ \  / _` || |
 _| |_| | | \__ \ (_) || (_| || |
|_____|_| |_|___/\___/  \__,_||_|
EOF
    echo -e "${NC}"

    echo -e "${GREEN}✓ Installation complete!${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. Run 'exprsn' to start the interactive CLI"
    echo "  2. Run 'exprsn system preflight' to check prerequisites"
    echo "  3. Run 'exprsn system init' to initialize the system"
    echo "  4. Run 'exprsn services start --all' to start services"
    echo ""
    echo -e "${BLUE}Documentation:${NC}"
    echo "  • README.md - Usage guide"
    echo "  • INSTALLATION.md - Detailed installation instructions"
    echo ""
    echo -e "${GREEN}Happy coding with Exprsn! 🚀${NC}"
}

# Run main
main
