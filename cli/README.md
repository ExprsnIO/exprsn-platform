# Exprsn Installation CLI

Cross-platform installer for the Exprsn Certificate Authority Ecosystem.

## Supported Operating Systems

### macOS
- macOS 10.15+ (Catalina and newer)
- Package manager: Homebrew

### Linux
- **Ubuntu** 20.04, 22.04, 24.04
- **Debian** 11, 12
- **Fedora** 38, 39, 40
- **RHEL/CentOS** 8, 9
- **Arch Linux** (latest)
- **Rocky Linux** 8, 9
- **AlmaLinux** 8, 9

## Installation

### Quick Install (Recommended)

```bash
cd /path/to/exprsn
npm install ./cli
npm link ./cli
exprsn-install install
```

### Manual Installation

```bash
cd cli
npm install
npm link
exprsn-install install
```

## Commands

### Install

Install Exprsn and all system dependencies:

```bash
exprsn-install install                    # Full installation with prompts
exprsn-install install -y                 # Accept all defaults
exprsn-install install --skip-deps        # Skip system dependencies
exprsn-install install --dev              # Include development tools
exprsn-install install --production       # Production optimized
```

### Configure

Configure Exprsn environment:

```bash
exprsn-install configure                  # Quick configuration
exprsn-install configure -i               # Interactive wizard
exprsn-install configure -f config.json   # Load from file
```

### Check

Verify system requirements:

```bash
exprsn-install check                      # Check all dependencies
exprsn-install check -v                   # Verbose output
exprsn-install check --fix                # Attempt auto-fix
```

### Service Management

Start, stop, and manage services:

```bash
# Start services
exprsn-install start                      # Start default services
exprsn-install start -a                   # Start all services
exprsn-install start ca auth timeline     # Start specific services

# Stop services
exprsn-install stop -a                    # Stop all services
exprsn-install stop ca auth               # Stop specific services

# Restart services
exprsn-install restart -a                 # Restart all
exprsn-install restart timeline           # Restart specific

# Check status
exprsn-install status                     # Show service status
exprsn-install status --json              # JSON output
```

### Uninstall

Remove Exprsn:

```bash
exprsn-install uninstall                  # Remove app (keep databases)
exprsn-install uninstall --full           # Complete removal
exprsn-install uninstall --keep-data      # Keep all data
exprsn-install uninstall -y               # Skip confirmation
```

## What Gets Installed

### System Dependencies

#### All Platforms
- Node.js 18+
- npm 9+
- PostgreSQL 14+
- Redis 7+
- FFmpeg (for media processing)
- Build tools (gcc, make, etc.)

#### Optional
- Elasticsearch 8+ (for Timeline search)

### Exprsn Services (23 total)

**Production Services (15):**
1. exprsn-ca (Port 3000) - Certificate Authority
2. exprsn-setup (Port 3015) - Setup & Management
3. exprsn-auth (Port 3001) - Authentication
4. exprsn-spark (Port 3002) - Messaging
5. exprsn-timeline (Port 3004) - Social Timeline
6. exprsn-prefetch (Port 3005) - Timeline Prefetch
7. exprsn-moderator (Port 3006) - Content Moderation
8. exprsn-filevault (Port 3007) - File Storage
9. exprsn-gallery (Port 3008) - Media Gallery
10. exprsn-live (Port 3009) - Live Streaming
11. exprsn-bridge (Port 3010) - API Gateway
12. exprsn-nexus (Port 3011) - Groups & Events
13. exprsn-pulse (Port 3012) - Analytics
14. exprsn-vault (Port 3013) - Secrets Management
15. exprsn-herald (Port 3014) - Notifications

**Business Services:**
16. exprsn-svr (Port 5001) - Business Hub (Low-Code + Forge)
17. exprsn-workflow (Port 3017) - Workflow Automation

**Development Services:**
18. exprsn-payments (Port 3018) - Payment Processing
19. exprsn-atlas (Port 3019) - Geospatial Services
20. exprsn-bluesky (Port 3020) - Bluesky Integration
21. exprsn-dbadmin (Port TBD) - Database Administration

## Platform-Specific Notes

### macOS

The installer uses Homebrew. If not installed, get it from https://brew.sh

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Ubuntu/Debian

Requires sudo access:

```bash
sudo exprsn-install install
```

The installer adds NodeSource repository for Node.js 18.

### Fedora/RHEL/CentOS

PostgreSQL requires initialization:

```bash
sudo postgresql-setup --initdb
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

The installer handles this automatically.

### Arch Linux

Uses pacman package manager. Build tools installed via base-devel:

```bash
sudo pacman -S base-devel
```

## Configuration

After installation, configure Exprsn:

```bash
exprsn-install configure -i
```

This creates a `.env` file with:

- Database credentials
- Redis configuration  
- Service auto-start settings
- Security keys
- Environment settings

### Manual Configuration

Edit `.env` directly:

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

# Environment
NODE_ENV=development
AUTO_START_SERVICES=ca,setup,timeline,bridge

# CA Configuration
CA_NAME=Exprsn Root CA
OCSP_ENABLED=true
```

## Troubleshooting

### Permission Denied

Run with sudo (Linux):

```bash
sudo exprsn-install install
```

### Port Already in Use

Check what's using the port:

```bash
lsof -i :3000
```

Kill the process:

```bash
kill -9 <PID>
```

### PostgreSQL Connection Failed

Start PostgreSQL:

```bash
# macOS
brew services start postgresql@15

# Linux
sudo systemctl start postgresql
```

### Redis Connection Failed

Start Redis:

```bash
# macOS
brew services start redis

# Linux
sudo systemctl start redis
```

### Node Version Too Old

The installer automatically installs Node.js 18+. If manual installation needed:

```bash
# macOS
brew install node@18

# Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
sudo apt install -y nodejs
```

## Development

### Building the CLI

```bash
cd cli
npm install
npm link
```

### Testing

```bash
exprsn-install check
exprsn-install status
```

## Requirements

### Minimum System Requirements

- **CPU:** 2 cores
- **RAM:** 4 GB
- **Disk:** 10 GB free space
- **OS:** 64-bit operating system

### Recommended System Requirements

- **CPU:** 4+ cores
- **RAM:** 8+ GB
- **Disk:** 20+ GB free space (SSD recommended)
- **OS:** Latest LTS version

## License

MIT License - Copyright (c) 2024 Rick Holland

## Support

For issues and questions:
- GitHub: https://github.com/ExprsnIO/Exprsn
- Email: engineering@exprsn.com
