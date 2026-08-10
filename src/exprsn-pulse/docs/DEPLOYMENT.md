# Exprsn Pulse - Deployment Guide

Complete guide for deploying Exprsn Pulse Analytics & Business Intelligence Service.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Database Setup](#database-setup)
- [Security](#security)
- [TLS/HTTPS](#tlshttps)
- [Service Integration](#service-integration)
- [Production Deployment](#production-deployment)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

## Prerequisites

### Required

- **Node.js**: 18+ (LTS recommended)
- **PostgreSQL**: 12+ for data persistence
- **npm**: 8+ or yarn 1.22+

### Recommended

- **Redis**: 7+ for caching and session storage
- **nginx**: For reverse proxy and load balancing

### Optional

- **exprsn-setup**: For service discovery
- **exprsn-auth**: For authentication and RBAC
- **exprsn-bridge**: For API gateway integration

## Installation

### 1. Clone or Navigate to Directory

```bash
cd src/exprsn-pulse
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with your configuration (see [Configuration](#configuration) section).

### 4. Database Setup

```bash
# Create database
npm run db:create

# Run migrations
npm run migrate

# Seed initial data (optional)
npm run seed
```

### 5. Start Service

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## Configuration

### Essential Environment Variables

```env
# Application
NODE_ENV=production
PULSE_PORT=3012

# Database
DB_HOST=localhost
DB_NAME=exprsn_pulse
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Session Secret (CRITICAL: Change in production!)
SESSION_SECRET=generate-a-random-64-char-string-here
```

### Redis Configuration

```env
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
```

**Benefits of Redis:**
- **Caching**: 10x faster dashboard/query rendering
- **Sessions**: Persistent sessions across restarts
- **Multi-instance**: Support for horizontal scaling
- **Real-time**: Socket.IO pub/sub for multiple servers

### Service Discovery

```env
CA_URL=http://localhost:3000
AUTH_URL=http://localhost:3001
SETUP_URL=http://localhost:3015
BRIDGE_URL=http://localhost:3010
```

**Integration Features:**
- Auto-registration with exprsn-setup
- User/role/permission sync with exprsn-auth
- CA token validation for all API requests
- Heartbeat monitoring every 30 seconds

## Database Setup

### Automatic Setup

```bash
npm run db:create
npm run migrate
```

### Manual Setup

```sql
-- Create database
CREATE DATABASE exprsn_pulse;

-- Create user (optional)
CREATE USER pulse_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE exprsn_pulse TO pulse_user;
```

Then run migrations:

```bash
npm run migrate
```

### Database Maintenance

```bash
# Rollback last migration
npm run migrate:undo

# Rollback all migrations
npm run migrate:undo:all

# Drop and recreate database
npm run db:drop
npm run db:create
npm run migrate
```

## Security

### CA Token Authentication

All API endpoints require valid CA tokens from exprsn-ca.

**Token Requirements:**
- RSA-SHA256-PSS signatures (minimum 2048-bit keys)
- Valid expiry timestamp
- OCSP validation (certificate not revoked)
- Appropriate permissions for the requested operation

### Role-Based Access Control (RBAC)

Admin-only endpoints:
- `/settings` - System configuration
- `/admin/permissions` - RBAC management
- `/admin/audit` - Audit log viewer
- `/api/cache/stats` - Cache statistics
- `/api/cache/flush` - Cache invalidation

### Rate Limiting

**Global Rate Limit:**
- 1000 requests per 15 minutes per IP

**Admin Rate Limit:**
- 100 requests per 15 minutes per IP

Configure via:
```env
RATE_LIMIT_MAX=1000
```

### Security Headers

Automatic security headers via Helmet:
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security (when TLS enabled)

## TLS/HTTPS

### Auto-Generated Self-Signed Certificates

```env
TLS_ENABLED=true
HTTPS_PORT=3443
```

**What happens:**
1. Service generates 2048-bit RSA self-signed certificate
2. Certificate valid for 1 year
3. Automatically regenerates when expired
4. HTTP server (port 3012) redirects all traffic to HTTPS (port 3443)

**Certificate stored at:**
- `/certs/server-cert.pem`
- `/certs/server-key.pem`

### Custom Certificates

```env
TLS_ENABLED=true
TLS_KEY_PATH=/path/to/your/private-key.pem
TLS_CERT_PATH=/path/to/your/certificate.pem
```

### Certificate Attributes (Auto-Generated)

```env
TLS_COMMON_NAME=pulse.yourdomain.com
TLS_COUNTRY=US
TLS_STATE=California
TLS_LOCALITY=San Francisco
TLS_ORG=Your Company
TLS_OU=Analytics
```

### Production TLS Recommendations

1. **Use Let's Encrypt** or commercial CA
2. **Setup nginx** reverse proxy with TLS termination
3. **Enable HSTS** (Strict-Transport-Security header)
4. **Configure certificate renewal** automation
5. **Use strong ciphers** (TLS 1.2+ only)

## Service Integration

### Service Discovery (exprsn-setup)

**Automatic Registration:**
```javascript
{
  name: 'exprsn-pulse',
  displayName: 'Exprsn Pulse',
  port: 3012,
  httpsPort: 3443, // when TLS enabled
  capabilities: ['analytics', 'dashboards', 'reports'],
  healthEndpoint: '/health',
  metricsEndpoint: '/metrics'
}
```

**Heartbeat:** Every 30 seconds

**Graceful Deregistration:** On SIGTERM/SIGINT

### Authentication (exprsn-auth)

**Features:**
- User data fetching via REST API
- Role/permission synchronization
- Batch user lookups for dashboards
- Token-based service-to-service communication

**Endpoints Used:**
- `GET /api/users/:id` - Fetch user details
- `POST /api/users/batch` - Batch user lookup
- `GET /api/users/:id/roles` - Get user roles
- `GET /api/roles` - Get all roles
- `GET /api/permissions` - Get all permissions

## Production Deployment

### Recommended Architecture

```
[nginx Load Balancer]
        |
        +-- [Exprsn Pulse Instance 1] ──┐
        |                                |
        +-- [Exprsn Pulse Instance 2] ──┤
        |                                ├── [Redis Cluster]
        +-- [Exprsn Pulse Instance 3] ──┘
                                         |
                                    [PostgreSQL]
```

### nginx Configuration

```nginx
upstream pulse_backend {
    least_conn;
    server 127.0.0.1:3012;
    server 127.0.0.1:3013;
    server 127.0.0.1:3014;
}

server {
    listen 443 ssl http2;
    server_name pulse.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://pulse_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Socket.IO support
    location /pulse-realtime {
        proxy_pass http://pulse_backend/pulse-realtime;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### PM2 Process Management

```bash
# Install PM2
npm install -g pm2

# Start service
pm2 start src/index.js --name exprsn-pulse

# Start cluster mode (4 instances)
pm2 start src/index.js -i 4 --name exprsn-pulse

# Monitor
pm2 monit

# Logs
pm2 logs exprsn-pulse

# Auto-restart on file changes (development)
pm2 start src/index.js --name exprsn-pulse --watch

# Save configuration
pm2 save

# Setup startup script
pm2 startup
```

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3012 3443

CMD ["node", "src/index.js"]
```

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  pulse:
    build: .
    ports:
      - "3012:3012"
      - "3443:3443"
    environment:
      - NODE_ENV=production
      - DB_HOST=postgres
      - REDIS_HOST=redis
      - REDIS_ENABLED=true
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: exprsn_pulse
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: secure_password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## Monitoring

### Health Endpoint

```bash
curl http://localhost:3012/health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "exprsn-pulse",
  "version": "1.0.0",
  "timestamp": "2025-12-21T23:28:20.518Z",
  "database": "connected",
  "cache": {
    "enabled": true,
    "connected": true,
    "healthy": true
  },
  "realtime": {
    "connections": 42,
    "dashboards": 12
  }
}
```

### Prometheus Metrics

```bash
curl http://localhost:3012/metrics
```

**Available Metrics:**
- `exprsn_pulse_http_requests_total` - Total HTTP requests
- `exprsn_pulse_http_request_duration_seconds` - Request duration
- `process_cpu_user_seconds_total` - CPU usage
- `process_resident_memory_bytes` - Memory usage
- `nodejs_eventloop_lag_seconds` - Event loop lag

### Logging

**Structured JSON Logging** via Winston:

```json
{
  "level": "info",
  "message": "Exprsn Pulse HTTP started on port 3012",
  "service": "exprsn-pulse",
  "timestamp": "2025-12-21T23:28:04.472Z",
  "environment": "production"
}
```

**Log Levels:**
- `error`: Critical errors
- `warn`: Warnings (non-fatal issues)
- `info`: Informational messages
- `debug`: Detailed debugging (development only)

Configure via:
```env
LOG_LEVEL=info
LOG_FORMAT=json
```

### Cache Statistics

```bash
# Admin only
curl -H "Authorization: Bearer <token>" \
  http://localhost:3012/api/cache/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "connected": true,
    "totalKeys": 1247,
    "keysByType": {
      "dashboard": 42,
      "visualization": 128,
      "query": 834,
      "dataset": 187,
      "report": 56
    },
    "ttl": {
      "dashboard": 300,
      "visualization": 600,
      "query": 180
    }
  }
}
```

## Troubleshooting

### Database Connection Errors

**Symptom:** `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solutions:**
```bash
# Check PostgreSQL is running
pg_isready

# Start PostgreSQL (macOS)
brew services start postgresql@15

# Start PostgreSQL (Ubuntu/Linux)
sudo systemctl start postgresql

# Verify .env credentials
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=correct_password
```

### Redis Connection Failures

**Symptom:** Redis service initialization warnings

**Solutions:**
```bash
# Check Redis status
redis-cli ping

# Start Redis (macOS)
brew services start redis

# Start Redis (Ubuntu/Linux)
sudo systemctl start redis

# If Redis is optional, disable it:
REDIS_ENABLED=false
```

### Port Already in Use

**Symptom:** `Error: listen EADDRINUSE :::3012`

**Solutions:**
```bash
# Find process using port 3012
lsof -i :3012

# Kill process
kill -9 <PID>

# Or use different port
PULSE_PORT=3013 npm start
```

### TLS Certificate Issues

**Symptom:** Browser shows "NET::ERR_CERT_AUTHORITY_INVALID"

**Expected:** Self-signed certificates trigger browser warnings

**Solutions:**
1. **Development**: Click "Advanced" → "Proceed to localhost"
2. **Production**: Use certificates from trusted CA (Let's Encrypt)
3. **Testing**: Add certificate to system trust store

### Service Discovery Failed

**Symptom:** `warn: Failed to register with exprsn-setup`

**Impact:** Non-fatal, service continues normally

**Solutions:**
1. Ensure exprsn-setup is running on `http://localhost:3015`
2. Update `SETUP_URL` in `.env`
3. If not using service discovery, ignore warning

### Low Performance

**Check:**
1. **Enable Redis caching**: `REDIS_ENABLED=true`
2. **Monitor query cache stats**: `/api/cache/stats`
3. **Check database indexes**: Ensure all migrations run
4. **Review Prometheus metrics**: `/metrics`
5. **Increase concurrent queries**: `MAX_CONCURRENT_QUERIES=20`

### Memory Leaks

**Monitor:**
```bash
# PM2 memory monitoring
pm2 monit

# Or use Node.js built-in
node --inspect src/index.js
```

**Solutions:**
1. Restart service periodically: `pm2 restart exprsn-pulse`
2. Enable Redis caching to reduce database load
3. Limit query result sizes
4. Configure proper cache TTLs

## Additional Resources

- **Main Documentation**: `README.md`
- **API Documentation**: http://localhost:3012/
- **Health Check**: http://localhost:3012/health
- **Metrics**: http://localhost:3012/metrics
- **Exprsn Ecosystem**: See root `CLAUDE.md`

## Support

For issues or questions:
- GitHub Issues: https://github.com/exprsn/pulse/issues
- Documentation: Internal wiki
- Email: engineering@exprsn.com
