# exprsn-bluesky Deployment Guide

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Deployment Methods](#deployment-methods)
4. [Configuration](#configuration)
5. [Database Setup](#database-setup)
6. [Docker Deployment](#docker-deployment)
7. [Production Deployment](#production-deployment)
8. [Health Monitoring](#health-monitoring)
9. [Rollback Procedures](#rollback-procedures)
10. [Troubleshooting](#troubleshooting)

---

## Quick Start

### Local Development with Docker Compose

```bash
# 1. Copy environment file
cp .env.example .env

# 2. Configure environment variables
nano .env

# 3. Start all services
docker-compose up -d

# 4. Run migrations
docker-compose run --rm migration

# 5. Check health
curl http://localhost:3018/health
```

Service will be available at: http://localhost:3018

---

## Prerequisites

### Required

- **Node.js:** 18+ (for local development)
- **PostgreSQL:** 12+
- **Redis:** 7+ (optional but recommended for caching)
- **Docker:** 20+ (for container deployment)
- **Docker Compose:** 1.29+ (for multi-container setup)

### Optional

- **nginx:** For reverse proxy in production
- **Let's Encrypt:** For TLS certificates

### External Dependencies

The BlueSky service integrates with these Exprsn services:
- **exprsn-ca** (Port 3000) - REQUIRED: Token generation/validation
- **exprsn-auth** (Port 3001) - REQUIRED: User authentication
- **exprsn-timeline** (Port 3004) - Feed integration
- **exprsn-herald** (Port 3014) - Notifications
- **exprsn-filevault** (Port 3007) - Media storage
- **exprsn-moderator** (Port 3006) - Content moderation
- **exprsn-workflow** (Port 3017) - Workflow automation

**Important:** exprsn-ca must be running before starting exprsn-bluesky.

---

## Deployment Methods

### 1. Docker Compose (Recommended for Development)

**Pros:**
- Easy setup with all dependencies
- Isolated environment
- Consistent across machines

**Cons:**
- Requires Docker installed
- Slightly more resource intensive

### 2. Docker (Production)

**Pros:**
- Lightweight and portable
- Easy scaling
- Zero-downtime deployments

**Cons:**
- Requires external database and Redis

### 3. Direct Node.js (Development Only)

**Pros:**
- Fast iteration during development
- Direct debugging

**Cons:**
- Requires manual dependency management
- Not recommended for production

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

#### Critical Configuration

**Security (MUST CHANGE IN PRODUCTION):**
```env
JWT_SECRET=<generate with: openssl rand -hex 64>
ENCRYPTION_KEY=<generate with: openssl rand -hex 32>
DB_PASSWORD=<secure database password>
```

**Service URLs:**
```env
CA_URL=http://localhost:3000
AUTH_URL=http://localhost:3001
TIMELINE_URL=http://localhost:3004
HERALD_URL=http://localhost:3014
FILEVAULT_URL=http://localhost:3007
```

**BlueSky Configuration:**
```env
BLUESKY_DOMAIN=exprsn.io
PDS_ENDPOINT=https://pds.exprsn.io
```

### Security Best Practices

1. **Never commit `.env` files** - Use `.env.example` only
2. **Generate strong secrets** - Use `openssl rand -hex 64`
3. **Restrict CORS** - Set specific origins in production
4. **Enable TLS** - Always use HTTPS in production
5. **Secure database** - Use strong passwords and restrict access
6. **Redis authentication** - Enable password if Redis is exposed

---

## Database Setup

### Create Database

```bash
# PostgreSQL via psql
createdb exprsn_bluesky

# Or via SQL
psql -U postgres -c "CREATE DATABASE exprsn_bluesky;"
```

### Run Migrations

```bash
# Local
npm run migrate

# Docker
docker-compose run --rm migration

# Production
docker-compose -f docker-compose.prod.yml run --rm migration
```

### Verify Database

```bash
psql -U postgres -d exprsn_bluesky -c "\dt"
```

Expected tables:
- accounts
- repositories
- records
- blobs
- events
- subscriptions
- SequelizeMeta (migration tracking)

---

## Docker Deployment

### Build Image

```bash
docker build -t exprsn-bluesky:latest .
```

### Run Container

```bash
docker run -d \
  --name exprsn-bluesky \
  --env-file .env \
  -p 3018:3018 \
  exprsn-bluesky:latest
```

### Using Docker Compose

#### Development

```bash
docker-compose up -d
```

#### Production

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  bluesky:
    image: exprsn-bluesky:latest
    env_file: .env.production
    ports:
      - "3018:3018"
    restart: always
    depends_on:
      - postgres
      - redis
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3018/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Deploy:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

## Production Deployment

### Automated Deployment Script

```bash
# Make scripts executable
chmod +x scripts/*.sh

# Deploy to production
./scripts/deploy.sh production

# Check health
./scripts/health-check.sh https://pds.exprsn.io
```

### Manual Production Steps

#### 1. Prepare Environment

```bash
# Clone repository
git clone https://github.com/yourusername/exprsn.git
cd exprsn/src/exprsn-bluesky

# Create production environment
cp .env.example .env.production
nano .env.production
```

#### 2. Build and Deploy

```bash
# Build production image
docker build -t exprsn-bluesky:$(git rev-parse --short HEAD) .
docker tag exprsn-bluesky:$(git rev-parse --short HEAD) exprsn-bluesky:latest

# Run migrations
docker-compose -f docker-compose.prod.yml run --rm migration

# Deploy with zero downtime
docker-compose -f docker-compose.prod.yml up -d --no-deps --scale bluesky=2 bluesky

# Wait for health check
sleep 30

# Scale back to single instance
docker-compose -f docker-compose.prod.yml up -d --no-deps --scale bluesky=1 bluesky
```

#### 3. Configure Reverse Proxy

**nginx configuration:**

```nginx
upstream bluesky_backend {
  server localhost:3018;
}

server {
  listen 443 ssl http2;
  server_name pds.exprsn.io;

  ssl_certificate /etc/letsencrypt/live/pds.exprsn.io/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/pds.exprsn.io/privkey.pem;

  location / {
    proxy_pass http://bluesky_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  # WebSocket support for firehose
  location /ws {
    proxy_pass http://bluesky_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
  }
}
```

#### 4. Configure Firewall

```bash
# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Internal services (if needed)
sudo ufw allow from <internal-network> to any port 3018
```

---

## Health Monitoring

### Health Check Endpoints

**Basic Health:**
```bash
curl http://localhost:3018/health
```

**Expected Response:**
```json
{
  "status": "healthy",
  "service": "exprsn-bluesky",
  "timestamp": "2025-12-22T14:00:00.000Z"
}
```

**DID Document:**
```bash
curl http://localhost:3018/.well-known/did.json
```

**XRPC Server Description:**
```bash
curl http://localhost:3018/xrpc/com.atproto.server.describeServer
```

### Automated Health Monitoring

```bash
# Run health check script
./scripts/health-check.sh https://pds.exprsn.io
```

### Integration with Monitoring Tools

**Prometheus Metrics** (Future):
```
http://localhost:3018/metrics
```

**Datadog Integration:**
```bash
# Add Datadog agent to docker-compose
# Configure logs and metrics collection
```

---

## Rollback Procedures

### Automatic Rollback

```bash
./scripts/rollback.sh
```

### Manual Rollback

#### 1. Identify Previous Version

```bash
docker images exprsn-bluesky
```

#### 2. Stop Current Service

```bash
docker-compose stop bluesky
```

#### 3. Rollback Image

```bash
docker tag exprsn-bluesky:<previous-version> exprsn-bluesky:latest
docker-compose up -d bluesky
```

#### 4. Rollback Database (if needed)

```bash
# Check migration status
npm run migrate:status

# Undo last migration
npm run migrate:undo

# Or undo specific migration
npm run migrate:undo:all --to 20231219000000-create-bluesky-tables.js
```

#### 5. Verify Rollback

```bash
./scripts/health-check.sh
docker-compose logs -f bluesky
```

---

## Troubleshooting

### Service Won't Start

**Check logs:**
```bash
docker-compose logs bluesky
```

**Common issues:**
- Database connection failed - verify DB_HOST, DB_PORT, credentials
- Redis connection failed - check REDIS_HOST, REDIS_PORT
- Port already in use - change PORT in .env
- Missing encryption key - set ENCRYPTION_KEY

### Database Connection Errors

```bash
# Test database connection
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT 1"

# Check if database exists
psql -U postgres -l | grep exprsn_bluesky

# Recreate database
dropdb exprsn_bluesky
createdb exprsn_bluesky
npm run migrate
```

### Redis Connection Errors

```bash
# Test Redis connection
redis-cli -h $REDIS_HOST -p $REDIS_PORT ping

# Service will run without Redis (caching disabled)
# Set REDIS_ENABLED=false to disable Redis requirement
```

### Performance Issues

**Check resource usage:**
```bash
docker stats exprsn-bluesky
```

**Optimize:**
1. Increase PostgreSQL connection pool
2. Enable Redis caching
3. Add database indexes
4. Scale horizontally with load balancer

### Authentication Failures

**Verify CA service:**
```bash
curl $CA_URL/health
```

**Check token generation:**
```bash
# View logs for token validation errors
docker-compose logs bluesky | grep -i "token"
```

**Common fixes:**
- Ensure exprsn-ca is running
- Verify CA_URL is correct
- Check firewall rules between services

---

## Scaling

### Horizontal Scaling

```bash
# Scale to 3 instances
docker-compose up -d --scale bluesky=3

# Add load balancer (nginx)
# Configure session affinity if needed
```

### Vertical Scaling

Update docker-compose.yml:

```yaml
services:
  bluesky:
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
```

---

## Backup and Recovery

### Database Backup

```bash
# Backup
pg_dump -U postgres exprsn_bluesky > backup-$(date +%Y%m%d).sql

# Restore
psql -U postgres exprsn_bluesky < backup-20251222.sql
```

### Automated Backups

```bash
# Add to crontab
0 2 * * * pg_dump -U postgres exprsn_bluesky | gzip > /backups/exprsn_bluesky-$(date +\%Y\%m\%d).sql.gz
```

---

## Security Checklist

- [ ] Change all default passwords
- [ ] Generate new JWT_SECRET and ENCRYPTION_KEY
- [ ] Configure CORS to specific origins
- [ ] Enable TLS/HTTPS
- [ ] Restrict database access
- [ ] Enable Redis authentication
- [ ] Configure firewall rules
- [ ] Regular security updates
- [ ] Monitor logs for suspicious activity
- [ ] Backup encryption keys securely

---

## Maintenance

### Updating the Service

```bash
# Pull latest code
git pull origin main

# Rebuild image
docker build -t exprsn-bluesky:$(git rev-parse --short HEAD) .

# Deploy using deployment script
./scripts/deploy.sh production
```

### Database Maintenance

```bash
# Vacuum database (monthly)
psql -U postgres -d exprsn_bluesky -c "VACUUM ANALYZE;"

# Check database size
psql -U postgres -d exprsn_bluesky -c "SELECT pg_size_pretty(pg_database_size('exprsn_bluesky'));"
```

### Log Rotation

Configure in docker-compose.yml:

```yaml
services:
  bluesky:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

---

## Additional Resources

- **Service Documentation:** [README.md](README.md)
- **Testing Guide:** [TESTING.md](TESTING.md)
- **Production Readiness:** [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md)
- **Changelog:** [CHANGELOG.md](CHANGELOG.md)
- **AT Protocol Specification:** https://atproto.com

---

**Last Updated:** 2025-12-22
**Maintainer:** Rick Holland <engineering@exprsn.com>
**Service Version:** 1.0.0
