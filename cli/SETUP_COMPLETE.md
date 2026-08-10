# 🎉 Exprsn CLI - Setup Complete!

Congratulations! Your Exprsn Certificate Authority ecosystem is ready to use.

## ✅ What's Installed

### System Components
- ✅ **Node.js 18+** - JavaScript runtime
- ✅ **npm** - Package manager
- ✅ **PostgreSQL 18.1** - Database (via Postgres.app)
- ✅ **Redis 7** - Caching and queues
- ✅ **Git** - Version control
- ✅ **Docker** - Container runtime

### Exprsn Components
- ✅ **Exprsn CLI** - Interactive management tool
- ✅ **17 PostgreSQL Databases** - Created and ready
- ✅ **4 Services Migrated** - nexus, pulse, vault, svr
- ✅ **Sample Data** - Seeded in svr database

## 🚀 Quick Start Commands

### From the CLI Directory

```bash
cd /Users/rickholland/Downloads/Exprsn/cli

# Check system status
./exprsn services list

# Start core services (recommended order)
./start-exprsn.sh

# Or start all services at once
./exprsn services start --all

# Monitor service health
./exprsn services health

# Interactive mode (explore all features)
./exprsn
```

### From Anywhere (Add to PATH)

Add this to your `~/.zshrc`:

```bash
export PATH="/Users/rickholland/Downloads/Exprsn/cli:$PATH"
```

Then reload shell:
```bash
source ~/.zshrc
```

Now use `exprsn` from anywhere!

## 📋 Available Services (21 Total)

### Core Services
1. **exprsn-ca** (Port 3000) - Certificate Authority ⚡ START FIRST
2. **exprsn-setup** (Port 3015) - Service discovery
3. **exprsn-auth** (Port 3001) - Authentication & SSO

### Production Services (15 total)
- **exprsn-spark** (3002) - Real-time messaging
- **exprsn-timeline** (3004) - Social feed
- **exprsn-prefetch** (3005) - Timeline caching
- **exprsn-moderator** (3006) - Content moderation
- **exprsn-filevault** (3007) - File storage
- **exprsn-gallery** (3008) - Media galleries
- **exprsn-live** (3009) - Live streaming
- **exprsn-bridge** (3010) - API gateway
- **exprsn-nexus** (3011) - Groups & events
- **exprsn-pulse** (3012) - Analytics
- **exprsn-vault** (3013) - Secrets management
- **exprsn-herald** (3014) - Notifications
- **exprsn-workflow** (3017) - Workflow automation
- **exprsn-svr** (5001) - Business Hub (Low-Code + Forge)

### Development Services
- **exprsn-payments** (3018) - Payment processing
- **exprsn-atlas** (3019) - Geospatial services
- **exprsn-dbadmin** (3020) - DB administration
- **exprsn-bluesky** (3021) - AT Protocol integration

## 🎯 Common Tasks

### Service Management

```bash
# List all services
./exprsn services list

# Start a service
./exprsn services start ca
./exprsn services start timeline

# Stop a service
./exprsn services stop timeline

# Restart a service
./exprsn services restart spark

# View logs
./exprsn services logs ca --follow

# Health check
./exprsn services health
./exprsn services health --watch
```

### Certificate Authority

```bash
# Issue a certificate (interactive)
./exprsn ca issue

# List certificates
./exprsn ca list

# Create a CA token
./exprsn ca token create

# Check OCSP status
./exprsn ca ocsp --status
```

### User Management

```bash
# Create a user (interactive)
./exprsn users create

# List users
./exprsn users list

# Reset password
./exprsn users reset-password <userId>
```

### Configuration

```bash
# List all configs
./exprsn config list

# Edit service config
./exprsn config edit ca

# Set a value
./exprsn config set ca PORT 3000

# Show config
./exprsn config show ca
```

### System Operations

```bash
# System health check
./exprsn system health

# Run migrations
./exprsn system db migrate

# Backup databases
./exprsn system db backup

# Clear cache
./exprsn system cache --clear
```

## 🎨 Interactive Mode

For the best experience, use interactive mode:

```bash
./exprsn
```

Navigate through menus with arrow keys:
- 🚀 Service Management
- 🔐 Certificate Authority
- 👥 Users & Access
- ⚙️ Configuration
- 📊 System Monitor
- 💾 Installation & Setup
- 🔧 System Operations

## 📁 Important Files

```
cli/
├── exprsn                    # Main CLI command (use this!)
├── start-exprsn.sh          # Helper to start core services
├── verify-postgres.sh       # Verify PostgreSQL installation
├── README.md                # Full documentation
├── INSTALLATION.md          # Installation guides
├── QUICKSTART.md            # 5-minute guide
└── SETUP_COMPLETE.md        # This file
```

## 🔧 Helper Scripts

### Start Core Services
```bash
./start-exprsn.sh
```
Starts CA, setup, auth, timeline, and spark in the correct order.

### Verify PostgreSQL
```bash
./verify-postgres.sh
```
Checks that Postgres.app is running and accessible.

## 🌐 Access URLs (when services are running)

- **CA Service**: http://localhost:3000
- **Auth Service**: http://localhost:3001
- **Timeline**: http://localhost:3004
- **Business Hub (SVR)**: http://localhost:5001
- **API Gateway (Bridge)**: http://localhost:3010
- **OCSP Responder**: http://localhost:2560

## 💡 Pro Tips

1. **Always start CA first**: All services depend on it
   ```bash
   ./exprsn services start ca
   ```

2. **Use interactive mode** for exploration
   ```bash
   ./exprsn
   ```

3. **Monitor logs** when debugging
   ```bash
   ./exprsn services logs <service> --follow
   ```

4. **Check health regularly**
   ```bash
   ./exprsn services health --watch
   ```

5. **Backup before major changes**
   ```bash
   ./exprsn system db backup
   ./exprsn config backup
   ```

## 🐘 PostgreSQL Management

### Using Postgres.app

- **Menu bar icon**: Click 🐘 to manage servers
- **Double-click database**: Opens psql terminal
- **Preferences**: Configure ports, versions, etc.

### Command Line

```bash
# List databases
psql -l

# Connect to a database
psql -d exprsn_ca

# Run SQL
psql -d exprsn_ca -c "SELECT * FROM certificates;"
```

## 📚 Learn More

- **Full CLI Documentation**: [README.md](README.md)
- **Platform Installation**: [INSTALLATION.md](INSTALLATION.md)
- **Quick Start**: [QUICKSTART.md](QUICKSTART.md)

## 🆘 Troubleshooting

### Service won't start

```bash
# Check logs
./exprsn services logs <service>

# Verify config
./exprsn config show <service>

# Check if port is in use
lsof -i :<port>
```

### Database connection error

```bash
# Verify PostgreSQL is running
./verify-postgres.sh

# Check Postgres.app menu bar icon
```

### Command not found

```bash
# Use from CLI directory
cd /Users/rickholland/Downloads/Exprsn/cli
./exprsn

# Or add to PATH (see above)
```

## 🎉 You're All Set!

Your Exprsn CLI is ready to manage the entire Certificate Authority ecosystem!

**Next steps:**
1. Start core services: `./start-exprsn.sh`
2. Explore interactive mode: `./exprsn`
3. Create your first user: `./exprsn users create`
4. Issue a certificate: `./exprsn ca issue`

Happy coding with Exprsn! 🚀
