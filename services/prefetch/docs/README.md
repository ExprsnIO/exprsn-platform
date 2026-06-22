# Exprsn Prefetch

**Timeline Prefetching & Caching Service for Exprsn Platform**

Version: 1.0.0
Port: 3005
Status: ✅ **Production Ready**

---

## Overview

The **Exprsn Prefetch** service is a high-performance caching layer designed to optimize timeline delivery by proactively prefetching and caching user timelines before they're requested. This dramatically reduces latency for timeline loads and improves overall user experience.

### Key Features

- **Multi-Tier Redis Caching** - Hot (5min) and Warm (15min) cache tiers for optimal performance
- **Bull Queue Processing** - Reliable background job processing with automatic retries
- **Activity-Based Prefetching** - Intelligently prefetches timelines for recently active users
- **Service-to-Service Auth** - Secure CA token-based authentication with automatic caching
- **Comprehensive Monitoring** - Detailed health checks, metrics, and queue statistics
- **Graceful Degradation** - Continues operation even when dependencies are degraded

---

## Architecture

### Service Dependencies

**Critical:**
- Redis (Cache storage) - Ports: Hot (DB 0), Warm (DB 1)
- exprsn-timeline (Port 3004) - Source of timeline data
- exprsn-ca (Port 3000) - Token generation and validation

**Optional:**
- PostgreSQL (Job queue persistence & analytics) - Port 5432

### Data Flow

```
┌─────────────────┐
│  Client Request │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  1. Check Hot Cache (5min TTL)  │
└────────┬────────────────────────┘
         │ miss
         ▼
┌─────────────────────────────────┐
│  2. Check Warm Cache (15min)    │
└────────┬────────────────────────┘
         │ miss
         ▼
┌─────────────────────────────────┐
│  3. Fetch from Timeline Service │
│     (with CA token auth)        │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  4. Cache in Hot/Warm Tier      │
│     (based on priority)         │
└─────────────────────────────────┘
```

### Background Job Processing

```
┌──────────────────┐
│ Activity Tracker │
└────────┬─────────┘
         │ (every 60s)
         ▼
┌──────────────────────────┐
│  Activity-Based Strategy │ ──┐
└──────────────────────────┘   │
                               │
┌──────────────────────────┐   │
│   Manual Prefetch API    │ ──┤
└──────────────────────────┘   │
                               ▼
                    ┌──────────────────┐
                    │   Bull Queue     │
                    │  (Redis-backed)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼──────────┐
                    │  Queue Processor  │
                    │  (100 concurrent) │
                    └────────┬──────────┘
                             │
                    ┌────────▼──────────┐
                    │ Prefetch Timeline │
                    │    to Cache       │
                    └───────────────────┘
```

---

## API Reference

### Prefetch Operations

#### Schedule Prefetch Job

Queue a prefetch operation for background processing.

```http
POST /api/prefetch/schedule/:userId
Authorization: Bearer <CA_TOKEN>
Content-Type: application/json

{
  "priority": "high",  // "high" | "medium" | "low"
  "delay": 0          // Delay in milliseconds (optional)
}
```

**Response:**
```json
{
  "success": true,
  "message": "Prefetch job scheduled",
  "data": {
    "jobId": "prefetch:user123:1703184000000",
    "userId": "550e8400-e29b-41d4-a716-446655440000",
    "priority": "high",
    "delay": 0
  }
}
```

#### Immediate Prefetch

Bypass queue and prefetch immediately (use sparingly).

```http
POST /api/prefetch/immediate/:userId
Authorization: Bearer <CA_TOKEN>
Content-Type: application/json

{
  "priority": "medium"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "success": true,
    "cached": false,
    "tier": "hot",
    "postsCount": 42,
    "duration": 234
  }
}
```

### Cache Operations

#### Get Cached Timeline

Retrieve timeline from cache (hot → warm fallback).

```http
GET /api/cache/:userId
Authorization: Bearer <CA_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "posts": [...],
    "fetchedAt": 1703184000000,
    "postsCount": 42,
    "tier": "hot"
  },
  "meta": {
    "cached": true,
    "tier": "hot",
    "fetchedAt": 1703184000000
  }
}
```

#### Check Cache Status

Check if timeline is cached and get TTL.

```http
GET /api/cache/status/:userId
Authorization: Bearer <CA_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cached": true,
    "tier": "hot",
    "ttl": 243,
    "expiresIn": 243000
  }
}
```

#### Invalidate Cache

Remove timeline from all cache tiers.

```http
DELETE /api/cache/:userId/timeline
Authorization: Bearer <CA_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "message": "Cache invalidated",
  "data": {
    "userId": "550e8400-e29b-41d4-a716-446655440000"
  }
}
```

### Queue Management

#### Get Queue Statistics

View current queue status and job counts.

```http
GET /api/prefetch/queue/stats
Authorization: Bearer <CA_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "name": "prefetch",
    "waiting": 23,
    "active": 5,
    "completed": 1247,
    "failed": 3,
    "delayed": 0
  }
}
```

#### Get Failed Jobs

Retrieve failed jobs for debugging.

```http
GET /api/prefetch/queue/failed?limit=10
Authorization: Bearer <CA_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "jobs": [
      {
        "id": "123",
        "userId": "550e8400-e29b-41d4-a716-446655440000",
        "priority": "medium",
        "failedReason": "Timeline service timeout",
        "attempts": 3,
        "timestamp": 1703184000000
      }
    ],
    "count": 1
  }
}
```

#### Retry Failed Job

Retry a specific failed job.

```http
POST /api/prefetch/queue/retry/:jobId
Authorization: Bearer <CA_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "message": "Job retry initiated",
  "data": {
    "success": true,
    "jobId": "123"
  }
}
```

### Metrics & Monitoring

#### Get Metrics

Retrieve cache hit rates and prefetch performance metrics.

```http
GET /api/prefetch/metrics
Authorization: Bearer <CA_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "cache": {
      "hitRate": 0.87,
      "hotHits": 1234,
      "warmHits": 234,
      "misses": 200
    },
    "prefetch": {
      "totalJobs": 1500,
      "successful": 1497,
      "failed": 3,
      "avgDuration": 187
    },
    "timestamp": "2024-12-21T12:00:00.000Z"
  }
}
```

#### Get Metrics by Date

Retrieve historical metrics for a specific date.

```http
GET /api/prefetch/metrics/2024-12-21
Authorization: Bearer <CA_TOKEN>
```

### Health Checks

#### Comprehensive Health Check

```http
GET /health
```

**Response:**
```json
{
  "service": "exprsn-prefetch",
  "status": "healthy",
  "timestamp": "2024-12-21T12:00:00.000Z",
  "uptime": 86400,
  "checks": {
    "hotCache": {
      "status": "connected",
      "latency": "2ms",
      "memory": "45.3MB",
      "db": 0,
      "keys": 1247
    },
    "warmCache": {
      "status": "connected",
      "latency": "2ms",
      "db": 1,
      "keys": 523
    },
    "timeline": {
      "status": "connected",
      "timelineStatus": "healthy"
    },
    "ca": {
      "status": "connected",
      "caStatus": "healthy"
    },
    "memory": {
      "status": "healthy",
      "heapUsed": "87MB",
      "heapTotal": "120MB",
      "heapPercentage": "72%"
    },
    "queue": {
      "status": "healthy",
      "waiting": 5,
      "active": 2,
      "completed": 1247,
      "failed": 3
    }
  }
}
```

#### Redis-Only Health Check

```http
GET /health/redis
```

#### Timeline Service Health

```http
GET /health/timeline
```

#### CA Service Health

```http
GET /health/ca
```

#### Kubernetes Probes

```http
GET /health/ready   # Readiness probe
GET /health/live    # Liveness probe
```

---

## Configuration

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Application
NODE_ENV=development
PREFETCH_SERVICE_PORT=3005
PREFETCH_SERVICE_HOST=prefetch.exprsn.io

# Worker Configuration
PREFETCH_WORKER_COUNT=20
PREFETCH_JOB_CONCURRENCY=100
PREFETCH_BATCH_SIZE=50

# Redis (Cache)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_CLUSTER_MODE=false
REDIS_DB_HOT=0    # Hot cache database
REDIS_DB_WARM=1   # Warm cache database

# Service URLs
CA_URL=http://localhost:3000
TIMELINE_SERVICE_URL=http://localhost:3004
AUTH_SERVICE_URL=http://localhost:3001

# Cache Configuration (milliseconds)
HOT_CACHE_TTL=300000    # 5 minutes
WARM_CACHE_TTL=900000   # 15 minutes
COLD_CACHE_TTL=3600000  # 1 hour (reserved for future ScyllaDB)

# Prefetch Strategies
ENABLE_ACTIVITY_BASED=true
ENABLE_EVENT_TRIGGERED=true
ENABLE_PREDICTIVE=false
ACTIVITY_CHECK_INTERVAL=60000  # 1 minute

# Performance
MAX_TIMELINE_SIZE=100
PREFETCH_TIMEOUT=10000  # 10 seconds

# Service Authentication
SERVICE_CERTIFICATE_TOKEN=<your_service_cert_token>

# Logging
LOG_LEVEL=info
LOG_DIR=./logs
```

### Cache Tiers

| Tier | TTL | Use Case | Redis DB |
|------|-----|----------|----------|
| **Hot** | 5 minutes | Recently active users, high-priority prefetch | 0 |
| **Warm** | 15 minutes | Medium activity users, standard prefetch | 1 |
| **Cold** | 1 hour | Low activity users (future ScyllaDB implementation) | N/A |

### Queue Configuration

- **Concurrency:** 100 concurrent jobs
- **Retry Strategy:** Exponential backoff (2s, 4s, 8s)
- **Max Attempts:** 3
- **Completed Job Retention:** Last 100
- **Failed Job Retention:** Last 50

---

## Development

### Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings

# 3. Start in development mode
npm run dev

# 4. Start worker process (separate terminal)
npm run worker
```

### Project Structure

```
src/exprsn-prefetch/
├── src/
│   ├── index.js                  # Main application server
│   ├── worker.js                 # Background worker process
│   ├── config/
│   │   └── index.js              # Configuration management
│   ├── routes/
│   │   ├── health.js             # Health check endpoints
│   │   ├── prefetch.js           # Prefetch & cache routes
│   │   └── config.js             # Configuration routes
│   ├── services/
│   │   ├── prefetchService.js    # Core prefetch logic
│   │   └── metricsService.js     # Metrics collection
│   ├── middleware/
│   │   ├── auth.js               # CA token validation
│   │   └── validation.js         # Input validation
│   ├── queues/
│   │   └── prefetchQueue.js      # Bull queue implementation
│   ├── strategies/
│   │   └── activityBased.js      # Activity-based prefetch strategy
│   ├── cache/
│   │   └── redis.js              # Redis cache manager
│   └── utils/
│       ├── logger.js             # Winston logger
│       └── caClient.js           # CA token client (uses @exprsn/shared)
├── package.json
├── tsconfig.json                 # TypeScript configuration (future)
├── .env.example                  # Environment template
└── README.md                     # This file
```

### Available Scripts

```bash
# Development
npm run dev              # Start with auto-reload (tsx)
npm run worker           # Start worker with auto-reload

# Production
npm run build            # Compile TypeScript (future)
npm start                # Start compiled service

# Testing
npm test                 # Run tests
npm run test:coverage    # Run with coverage
npm run test:integration # Integration tests
npm run test:load        # Load tests with k6

# Maintenance
npm run lint             # ESLint
npm run format           # Prettier
```

### Testing

```bash
# Unit tests
npm test

# With coverage
npm run test:coverage

# Integration tests (requires Redis + Timeline service)
npm run test:integration

# Load tests (requires k6)
npm run test:load
```

---

## Deployment

### Prerequisites

- Node.js 18+
- Redis 7+ (two databases: 0 for hot, 1 for warm)
- exprsn-timeline service running
- exprsn-ca service running
- Valid service certificate token

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source
COPY src/ ./src/

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "require('http').get('http://localhost:3005/health/ready', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Run service
CMD ["node", "src/index.js"]
```

### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: exprsn-prefetch
spec:
  replicas: 3
  selector:
    matchLabels:
      app: exprsn-prefetch
  template:
    metadata:
      labels:
        app: exprsn-prefetch
    spec:
      containers:
      - name: prefetch
        image: exprsn/prefetch:1.0.0
        ports:
        - containerPort: 3005
        env:
        - name: NODE_ENV
          value: "production"
        - name: REDIS_HOST
          value: "redis-service"
        - name: TIMELINE_SERVICE_URL
          value: "http://exprsn-timeline:3004"
        - name: CA_URL
          value: "http://exprsn-ca:3000"
        livenessProbe:
          httpGet:
            path: /health/live
            port: 3005
          initialDelaySeconds: 10
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /health/ready
            port: 3005
          initialDelaySeconds: 5
          periodSeconds: 10
        resources:
          requests:
            memory: "256Mi"
            cpu: "200m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

---

## Performance Tuning

### Cache Hit Rate Optimization

**Target:** 85%+ cache hit rate

1. **Increase Hot Cache TTL** for very active users (edit `HOT_CACHE_TTL`)
2. **Tune Activity Check Interval** to catch user activity faster
3. **Adjust Worker Concurrency** based on Timeline service capacity

### Queue Optimization

**Target:** < 100 waiting jobs under normal load

1. **Increase Concurrency** (`PREFETCH_JOB_CONCURRENCY`) if Timeline service can handle it
2. **Batch Size Tuning** (`PREFETCH_BATCH_SIZE`) for bulk operations
3. **Add More Workers** (horizontal scaling)

### Memory Management

**Target:** < 512MB heap usage

1. Monitor `/health` endpoint for heap percentage
2. Adjust cache TTLs to reduce memory footprint
3. Tune Bull queue retention (`removeOnComplete`, `removeOnFail`)

---

## Monitoring

### Key Metrics to Track

1. **Cache Hit Rate** - Should be > 85%
2. **Prefetch Duration** - Should average < 200ms
3. **Queue Backlog** - Should be < 100 waiting jobs
4. **Failed Job Rate** - Should be < 1%
5. **Memory Usage** - Should be < 80% heap

### Prometheus Metrics

_(Future enhancement)_

```
# Cache metrics
prefetch_cache_hits_total{tier="hot"}
prefetch_cache_hits_total{tier="warm"}
prefetch_cache_misses_total

# Queue metrics
prefetch_queue_jobs_total{status="completed|failed"}
prefetch_queue_duration_seconds

# Service metrics
prefetch_timeline_fetch_duration_seconds
prefetch_token_refresh_total
```

---

## Troubleshooting

### High Cache Miss Rate

**Symptoms:** Cache hit rate < 70%

**Solutions:**
1. Check if `ACTIVITY_CHECK_INTERVAL` is too high (reduce to 30000ms)
2. Verify activity tracking is working (check logs for "Tracked activity")
3. Increase `HOT_CACHE_TTL` and `WARM_CACHE_TTL`

### Queue Backlog Building Up

**Symptoms:** Waiting jobs > 500

**Solutions:**
1. Increase `PREFETCH_JOB_CONCURRENCY`
2. Check Timeline service health (`GET /health/timeline`)
3. Scale horizontally (add more prefetch service instances)

### Token Validation Failures

**Symptoms:** `INVALID_TOKEN` or `EXPIRED_TOKEN` errors

**Solutions:**
1. Check `SERVICE_CERTIFICATE_TOKEN` is set correctly
2. Verify CA service is running (`GET /health/ca`)
3. Clear token cache: Service auto-clears and retries

### Redis Connection Issues

**Symptoms:** `ECONNREFUSED` on port 6379

**Solutions:**
```bash
# Check Redis is running
redis-cli ping

# Check Redis databases
redis-cli -n 0 DBSIZE  # Hot cache
redis-cli -n 1 DBSIZE  # Warm cache

# Restart Redis
# macOS: brew services restart redis
# Linux: sudo systemctl restart redis
```

---

## Roadmap

### v1.1 (Q1 2025)
- [ ] ScyllaDB cold cache tier for 24h+ retention
- [ ] Predictive prefetching using ML
- [ ] Enhanced metrics with Prometheus
- [ ] GraphQL subscription support

### v1.2 (Q2 2025)
- [ ] Event-triggered prefetching (new follower, new post)
- [ ] Distributed tracing with OpenTelemetry
- [ ] Auto-scaling based on queue depth

### v2.0 (Q3 2025)
- [ ] TypeScript migration
- [ ] Multi-region cache replication
- [ ] Advanced cache warming strategies

---

## Related Services

- **exprsn-timeline** (Port 3004) - Source of timeline data
- **exprsn-ca** (Port 3000) - Token generation & validation
- **exprsn-herald** (Port 3014) - Notification delivery
- **exprsn-pulse** (Port 3012) - Analytics integration

---

## Contributing

See main platform `CLAUDE.md` for contribution guidelines.

### Code Style

- Follow existing patterns in the service
- Use `@exprsn/shared` utilities where applicable
- Add JSDoc comments for all public functions
- Update tests for new features

---

## License

MIT © Exprsn Platform

---

## Support

- **Email:** engineering@exprsn.com
- **Documentation:** `/docs/services/prefetch.md`
- **Issues:** GitHub Issues

---

**Last Updated:** 2024-12-21
**Maintainer:** Rick Holland (engineering@exprsn.com)
