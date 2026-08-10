# Exprsn CLI Installation Guide

Complete installation guide for the Exprsn CLI across different platforms and package managers.

## Quick Start

```bash
# 1. Navigate to Exprsn directory
cd /path/to/Exprsn

# 2. Install CLI dependencies
cd cli
npm install

# 3. Link globally
npm link

# 4. Verify
exprsn --version

# 5. Check prerequisites
exprsn system preflight

# 6. Install missing dependencies
exprsn install prereqs

# 7. Initialize system
exprsn system init
```

## Platform-Specific Installation

### Ubuntu/Debian (APT)

```bash
# Update package list
sudo apt update

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL 15
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install -y postgresql-15 postgresql-contrib-15

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Install Redis
sudo apt install -y redis-server
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Install Git (optional)
sudo apt install -y git

# Clone Exprsn (if not already)
git clone https://github.com/your-org/exprsn.git
cd exprsn

# Install Exprsn CLI
cd cli
npm install
npm link

# Verify installation
exprsn install verify
```

### RHEL/CentOS/Fedora (YUM/DNF)

```bash
# Install Node.js 18+
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install PostgreSQL 15
sudo yum install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-$(rpm -E %{rhel})-x86_64/pgdg-redhat-repo-latest.noarch.rpm
sudo yum install -y postgresql15-server postgresql15-contrib

# Initialize PostgreSQL
sudo /usr/pgsql-15/bin/postgresql-15-setup initdb
sudo systemctl start postgresql-15
sudo systemctl enable postgresql-15

# Install Redis
sudo yum install -y redis
sudo systemctl start redis
sudo systemctl enable redis

# Install Git (optional)
sudo yum install -y git

# Clone and install CLI
git clone https://github.com/your-org/exprsn.git
cd exprsn/cli
npm install
npm link

exprsn install verify
```

### macOS (Homebrew)

```bash
# Install Homebrew (if not installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js 18+
brew install node@18

# Install PostgreSQL 15
brew install postgresql@15
brew services start postgresql@15

# Install Redis
brew install redis
brew services start redis

# Install Git (usually pre-installed)
brew install git

# Clone and install CLI
git clone https://github.com/your-org/exprsn.git
cd exprsn/cli
npm install
npm link

exprsn install verify
```

### Windows (Manual Installation)

```powershell
# Install Node.js
# Download and install from: https://nodejs.org/

# Install PostgreSQL
# Download and install from: https://www.postgresql.org/download/windows/
# Use installer, set password, and start service

# Install Redis (Windows Subsystem for Linux or Docker)
# Option 1: Docker Desktop
# Download from: https://www.docker.com/products/docker-desktop

# Option 2: WSL2
wsl --install
wsl
sudo apt update
sudo apt install -y redis-server
redis-server

# Install Git
# Download from: https://git-scm.com/download/win

# Clone and install CLI
git clone https://github.com/your-org/exprsn.git
cd exprsn\cli
npm install
npm link

exprsn install verify
```

## Docker Installation

### Using Exprsn CLI

```bash
# Install Docker first
exprsn install docker

# Generate docker-compose.yml
exprsn install docker-setup --compose --services postgres,redis

# Start services
docker-compose up -d

# Verify
docker ps
```

### Manual Docker Setup

```bash
# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: exprsn-postgres
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: exprsn
      POSTGRES_DB: exprsn
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - exprsn

  redis:
    image: redis:7
    container_name: exprsn-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    networks:
      - exprsn

volumes:
  postgres_data:
  redis_data:

networks:
  exprsn:
    driver: bridge
EOF

# Start containers
docker-compose up -d

# Verify
docker-compose ps
```

## Binary Installation (Alternative)

### PostgreSQL Binary

```bash
# Download from: https://www.enterprisedb.com/download-postgresql-binaries

# Linux
wget https://get.enterprisedb.com/postgresql/postgresql-15.x-linux-x64-binaries.tar.gz
tar -xvf postgresql-15.x-linux-x64-binaries.tar.gz
cd pgsql

# Initialize database
bin/initdb -D data

# Start PostgreSQL
bin/pg_ctl -D data -l logfile start
```

### Redis Binary

```bash
# Download and compile
wget https://download.redis.io/redis-stable.tar.gz
tar -xzvf redis-stable.tar.gz
cd redis-stable
make

# Install
sudo make install

# Start Redis
redis-server
```

## Post-Installation Setup

### Configure PostgreSQL

```bash
# Create postgres user (if needed)
sudo -u postgres createuser -s $USER

# Set password
psql -U postgres -c "ALTER USER postgres PASSWORD 'exprsn';"

# Test connection
psql -U postgres -h localhost
```

### Configure Redis

```bash
# Test connection
redis-cli ping

# Should return: PONG
```

### Initialize Exprsn System

```bash
# Check prerequisites
exprsn system preflight

# Initialize databases
exprsn system init

# Start services
exprsn services start --all
```

## Automated Installation Script

```bash
#!/bin/bash
# install-exprsn.sh - Automated Exprsn installation

set -e

echo "=== Exprsn CLI Installation ==="

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
else
    OS=$(uname -s)
fi

echo "Detected OS: $OS"

# Install based on OS
case $OS in
    ubuntu|debian)
        echo "Installing via APT..."
        sudo apt update
        sudo apt install -y nodejs npm postgresql-15 redis-server git
        ;;
    centos|rhel|fedora)
        echo "Installing via YUM..."
        sudo yum install -y nodejs npm postgresql15-server redis git
        ;;
    darwin|Darwin)
        echo "Installing via Homebrew..."
        brew install node@18 postgresql@15 redis git
        ;;
    *)
        echo "Unsupported OS: $OS"
        echo "Please install manually"
        exit 1
        ;;
esac

# Clone repository (if not exists)
if [ ! -d "./exprsn" ]; then
    git clone https://github.com/your-org/exprsn.git
    cd exprsn
else
    cd exprsn
fi

# Install CLI
cd cli
npm install
npm link

# Verify
echo ""
echo "=== Verification ==="
exprsn --version
exprsn install verify

echo ""
echo "=== Installation Complete ==="
echo "Run 'exprsn' to start the interactive CLI"
```

## Verification

### Check All Prerequisites

```bash
exprsn system preflight
```

Expected output:
```
━━━ System Prerequisites ━━━

  ✓ Node.js        OK
  ✓ npm            OK
  ✓ PostgreSQL     OK
  ✓ Redis          OK
  ✓ Git            OK
  ✓ Docker         OK

✓ All critical prerequisites satisfied
```

### Test Services

```bash
# List services
exprsn services list

# Start CA (critical)
exprsn services start ca

# Check health
exprsn services health
```

## Troubleshooting

### Node.js Version Issues

```bash
# Check version
node --version

# Should be >= 18.0.0

# Install specific version with nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18
```

### PostgreSQL Connection Issues

```bash
# Check if running
pg_isready

# Check authentication
sudo nano /etc/postgresql/15/main/pg_hba.conf

# Add this line:
# local   all   all   trust

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Redis Connection Issues

```bash
# Check if running
redis-cli ping

# Start Redis
sudo systemctl start redis

# Check logs
sudo journalctl -u redis -f
```

### Permission Issues

```bash
# Fix npm permissions
sudo chown -R $USER:$USER ~/.npm

# Fix CLI link
cd cli
npm unlink
npm link
```

## Upgrading

```bash
# Update CLI
cd exprsn/cli
git pull
npm install
npm link

# Or use the built-in updater
exprsn install update
```

## Uninstallation

```bash
# Unlink CLI
npm unlink -g @exprsn/cli

# Remove CLI files
cd exprsn/cli
rm -rf node_modules

# Optional: Remove databases
exprsn system db drop --force

# Optional: Uninstall PostgreSQL
sudo apt remove postgresql-15  # Ubuntu
brew uninstall postgresql@15   # macOS

# Optional: Uninstall Redis
sudo apt remove redis-server   # Ubuntu
brew uninstall redis           # macOS
```

## Next Steps

After installation:

1. **Configure Services**: `exprsn config edit <service>`
2. **Initialize System**: `exprsn system init`
3. **Start Services**: `exprsn services start --all`
4. **Create Users**: `exprsn users create`
5. **Issue Certificates**: `exprsn ca issue`

For detailed usage, see [README.md](README.md)
