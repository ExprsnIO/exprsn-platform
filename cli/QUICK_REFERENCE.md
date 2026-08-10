# Exprsn CLI Quick Reference

## Installation

```bash
# Install CLI
npm run cli:install

# Full installation
exprsn-install install

# Quick install (no prompts)
exprsn-install install -y

# Skip system dependencies
exprsn-install install --skip-deps

# Production install
exprsn-install install --production
```

## Configuration

```bash
# Interactive wizard
exprsn-install configure -i

# Quick config
exprsn-install configure

# From file
exprsn-install configure -f config.json
```

## System Check

```bash
# Check all dependencies
exprsn-install check

# Verbose output
exprsn-install check -v

# Auto-fix issues
exprsn-install check --fix
```

## Service Management

```bash
# Start all services
exprsn-install start -a
npm start

# Start specific services
exprsn-install start ca auth timeline

# Stop all services
exprsn-install stop -a

# Stop specific services
exprsn-install stop timeline

# Restart services
exprsn-install restart -a
exprsn-install restart ca

# Check status
exprsn-install status
exprsn-install status --json
```

## Individual Services

```bash
# Start CA (must start first!)
npm run start:ca

# Start specific service
npm run start:auth
npm run start:timeline
npm run start:workflow

# Development mode
npm run dev:auth
npm run dev:timeline
```

## Database

```bash
# Create all databases
npm run db:create

# Run migrations
npm run migrate:all

# Seed data
npm run seed

# Full initialization
npm run init
```

## Maintenance

```bash
# Health check
npm run health
npm run health:watch

# Preflight check
npm run preflight
npm run preflight:fix

# Reset system
npm run reset
npm run reset:full
npm run reset:data
```

## Uninstall

```bash
# Remove Exprsn (keep databases)
exprsn-install uninstall

# Complete removal
exprsn-install uninstall --full

# Keep all data
exprsn-install uninstall --keep-data

# Skip confirmation
exprsn-install uninstall -y
```

## Platform Commands

### macOS

```bash
# Homebrew services
brew services start postgresql@15
brew services start redis
brew services stop postgresql@15

# Check what's running
brew services list
```

### Linux (systemd)

```bash
# Start services
sudo systemctl start postgresql
sudo systemctl start redis

# Stop services
sudo systemctl stop postgresql

# Enable on boot
sudo systemctl enable postgresql
sudo systemctl enable redis

# Check status
sudo systemctl status postgresql
```

## Ports

| Service | Port | Description |
|---------|------|-------------|
| exprsn-ca | 3000 | Certificate Authority |
| exprsn-auth | 3001 | Authentication |
| exprsn-spark | 3002 | Messaging |
| exprsn-timeline | 3004 | Social Timeline |
| exprsn-prefetch | 3005 | Timeline Prefetch |
| exprsn-moderator | 3006 | Content Moderation |
| exprsn-filevault | 3007 | File Storage |
| exprsn-gallery | 3008 | Media Gallery |
| exprsn-live | 3009 | Live Streaming |
| exprsn-bridge | 3010 | API Gateway |
| exprsn-nexus | 3011 | Groups & Events |
| exprsn-pulse | 3012 | Analytics |
| exprsn-vault | 3013 | Secrets Management |
| exprsn-herald | 3014 | Notifications |
| exprsn-setup | 3015 | Setup & Management |
| exprsn-workflow | 3017 | Workflow Automation |
| exprsn-payments | 3018 | Payments |
| exprsn-atlas | 3019 | Geospatial |
| exprsn-bluesky | 3020 | Bluesky |
| exprsn-svr | 5001 | Business Hub |
| OCSP | 2560 | OCSP Responder |

## Environment Variables

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ENABLED=true

# Services
AUTO_START_SERVICES=ca,setup,timeline,bridge
NODE_ENV=development

# CA
OCSP_ENABLED=true
OCSP_PORT=2560
```

## Troubleshooting

```bash
# Check port usage
lsof -i :3000

# Kill process on port
kill -9 $(lsof -i :3000 -t)

# Check PostgreSQL
pg_isready
psql -U postgres -l

# Check Redis
redis-cli ping

# Check Node version
node --version

# View logs
tail -f src/logs/*.log
```

## Help

```bash
# CLI help
exprsn-install --help

# Command help
exprsn-install install --help
exprsn-install configure --help

# Version
exprsn-install --version
```
