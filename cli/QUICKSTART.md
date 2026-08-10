# Exprsn CLI - Quick Start Guide

Get up and running with Exprsn CLI in 5 minutes!

## 🚀 Installation (3 steps)

```bash
# 1. Navigate to Exprsn directory
cd /Users/rickholland/Downloads/Exprsn/cli

# 2. Install dependencies
npm install

# 3. Link globally
npm link
```

## ✅ Verify Installation

```bash
exprsn --version
exprsn system preflight
```

## 🎯 First Steps

### Option 1: Interactive Mode (Recommended)

```bash
# Start interactive CLI
exprsn

# Navigate with arrow keys
# Press Enter to select
# Press Ctrl+C to go back/exit
```

### Option 2: Command Line

```bash
# Check system prerequisites
exprsn system preflight

# Install missing dependencies
exprsn install prereqs

# Initialize the system
exprsn system init

# Start all services
exprsn services start --all

# Check service status
exprsn services list
```

## 📋 Common Tasks

### Start/Stop Services

```bash
# Start CA (must start first)
exprsn services start ca

# Start a specific service
exprsn services start timeline

# Start all services
exprsn services start --all

# Stop a service
exprsn services stop timeline

# View service logs
exprsn services logs ca --follow
```

### Manage Users

```bash
# Create a user (interactive)
exprsn users create

# List all users
exprsn users list

# Reset password
exprsn users reset-password <userId>
```

### Configure Services

```bash
# List all configurations
exprsn config list

# Edit service config interactively
exprsn config edit ca

# Set a specific value
exprsn config set ca PORT 3000

# View configuration
exprsn config show ca
```

### Certificate Authority

```bash
# Issue a certificate (interactive)
exprsn ca issue

# Create a CA token (interactive)
exprsn ca token create

# List certificates
exprsn ca list

# Check OCSP status
exprsn ca ocsp --status
```

### Database Operations

```bash
# Create all databases
exprsn system db create

# Run migrations
exprsn system db migrate

# Seed databases
exprsn system db seed

# Backup databases
exprsn system db backup
```

## 🐳 Docker Alternative

If you prefer Docker:

```bash
# Generate docker-compose.yml
exprsn install docker-setup --compose

# Start containers
docker-compose up -d

# Verify
docker ps
```

## 🔧 Troubleshooting

### Command not found

```bash
cd /Users/rickholland/Downloads/Exprsn/cli
npm link
```

### Service won't start

```bash
# Check logs
exprsn services logs <service>

# Check configuration
exprsn config show <service>

# Verify prerequisites
exprsn system preflight
```

### Database connection error

```bash
# Check PostgreSQL is running
pg_isready

# Create databases
exprsn system db create

# Check configuration
exprsn config show root
```

## 📚 Learn More

- **Full Documentation**: [README.md](README.md)
- **Installation Guide**: [INSTALLATION.md](INSTALLATION.md)
- **Run automated install**: `./scripts/install.sh`

## 🎨 Interactive Menu Structure

```
Main Menu
├── 🚀 Service Management
│   ├── List all services
│   ├── Start/Stop/Restart services
│   ├── View logs
│   └── Health check
├── 🔐 Certificate Authority
│   ├── Manage certificates
│   ├── Manage CA tokens
│   └── OCSP/CRL operations
├── 👥 Users & Access
│   ├── User management
│   ├── Group management
│   └── Role management
├── ⚙️ Configuration
│   ├── Edit .env files
│   ├── Backup/restore
│   └── Environment management
├── 📊 System Monitor
│   ├── Health checks
│   ├── View logs
│   └── Cache statistics
├── 💾 Installation & Setup
│   ├── Install dependencies
│   ├── Docker setup
│   └── System detection
└── 🔧 System Operations
    ├── Initialize system
    ├── Database operations
    ├── Migrations
    └── Reset/maintenance
```

## 🎯 Most Common Workflows

### First-Time Setup

```bash
# 1. Install and link CLI
cd cli && npm install && npm link

# 2. Check prerequisites
exprsn system preflight

# 3. Install missing dependencies
exprsn install prereqs

# 4. Initialize system
exprsn system init

# 5. Start services
exprsn services start --all
```

### Daily Development

```bash
# Start interactive mode
exprsn

# Or start services directly
exprsn services start ca
exprsn services start timeline auth spark

# Monitor logs
exprsn services logs timeline --follow
```

### Production Deployment

```bash
# 1. Set environment
exprsn config set root NODE_ENV production

# 2. Initialize production databases
exprsn system init

# 3. Start production services
exprsn services start --all

# 4. Monitor health
exprsn services health --watch
```

## 💡 Pro Tips

1. **Use Tab Completion**: The CLI has full tab completion support
2. **Interactive Mode**: When in doubt, use `exprsn` without arguments for the interactive menu
3. **Logs are your friend**: Always check `exprsn services logs <service>` when troubleshooting
4. **Config validation**: Run `exprsn config validate <service>` before starting services
5. **Health monitoring**: Use `exprsn services health --watch` for continuous monitoring

## 🚦 Service Startup Order

Services should start in this order for proper operation:

1. **exprsn-ca** (Port 3000) - MUST start first
2. **exprsn-setup** (Port 3015) - Service discovery
3. All other services in any order

The CLI handles this automatically when you use `exprsn services start --all`

## 📞 Getting Help

```bash
# General help
exprsn --help

# Command-specific help
exprsn services --help
exprsn ca --help
exprsn users --help

# Interactive mode (easiest)
exprsn
```

---

**Ready to go!** Run `exprsn` to start the interactive CLI 🎉
