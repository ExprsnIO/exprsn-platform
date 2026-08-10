# Setup Configuration API Reference

Complete API documentation for the Exprsn Platform Setup Configuration utility.

## Table of Contents

- [Overview](#overview)
- [Environment Configuration](#environment-configuration)
- [Service Management](#service-management)
- [Database Operations](#database-operations)
- [Redis Management](#redis-management)
- [System Health](#system-health)

---

## Overview

The Setup Configuration API provides comprehensive management of the Exprsn platform infrastructure including:

- **21 Microservices** across 4 categories (Core, Business, Infrastructure, Platform)
- **18 PostgreSQL Databases** with individual service isolation
- **16 Redis Databases** (0-15) with service-specific prefixes
- **Complete Environment Configuration** from .env variables
- **Real-time WebSocket Monitoring** via Socket.IO

**Base URL:** `/lowcode/api/setup`

**Authentication:** No authentication required in development mode (`LOW_CODE_DEV_AUTH=true`)

---

## Environment Configuration

### GET /api/setup/environment

Get all environment configuration variables from process.env and .env file.

**Response:**
```json
{
  "success": true,
  "config": {
    "application": {
      "nodeEnv": "development",
      "port": 5001,
      "serviceName": "exprsn-svr"
    },
    "database": {
      "host": "localhost",
      "port": 5432,
      "name": "exprsn_svr",
      "user": "postgres",
      "poolMax": 20,
      "poolMin": 5
    },
    "redis": {
      "enabled": true,
      "host": "localhost",
      "port": 6379,
      "db": 0,
      "cacheTTL": 3600
    },
    "ca": {
      "url": "http://localhost:3000",
      "verifyTokens": true,
      "publicKeyPath": "./keys/ca-public.pem"
    },
    "lowCode": {
      "devAuth": true
    },
    "security": {
      "enableSQLInjection": true,
      "enableXSS": true,
      "allowedOrigins": ["http://localhost:3000"]
    },
    "codeExecution": {
      "enabled": true,
      "timeout": 5000,
      "memoryLimit": 128
    },
    "socketIO": {
      "enabled": true,
      "path": "/socket.io",
      "corsOrigins": ["http://localhost:3000"]
    },
    "storage": {
      "maxFileSize": 10485760,
      "uploadDir": "./uploads",
      "staticDir": "./public"
    },
    "rateLimit": {
      "windowMs": 60000,
      "maxRequests": 100
    },
    "logging": {
      "level": "info",
      "dir": "./logs",
      "maxFiles": 30
    }
  }
}
```

### PUT /api/setup/environment

Update environment configuration (writes to .env file).

**Request Body:**
```json
{
  "database": {
    "host": "localhost",
    "port": 5432,
    "poolMax": 30
  },
  "redis": {
    "enabled": true,
    "cacheTTL": 7200
  },
  "security": {
    "enableSQLInjection": true,
    "enableXSS": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Configuration updated successfully",
  "note": "Server restart required for changes to take effect"
}
```

---

## Service Management

### GET /api/setup/services

Get all 21 microservices with health status.

**Response:**
```json
{
  "success": true,
  "services": [
    {
      "id": "exprsn-ca",
      "name": "Certificate Authority",
      "port": 3000,
      "category": "core",
      "status": "running",
      "database": "exprsn_ca",
      "redisDB": 0,
      "dependencies": [],
      "autoStart": true,
      "icon": "fa-certificate",
      "color": "#FF6B35",
      "description": "PKI infrastructure and CA token generation",
      "uptime": 3600,
      "responseTime": 45
    }
  ],
  "count": 21
}
```

**Service Categories:**
- **core** - exprsn-ca, exprsn-auth
- **messaging** - exprsn-spark
- **content** - exprsn-timeline
- **infrastructure** - exprsn-prefetch, exprsn-moderator, exprsn-setup
- **storage** - exprsn-filevault, exprsn-gallery, exprsn-vault
- **communication** - exprsn-live, exprsn-bridge, exprsn-nexus, exprsn-pulse, exprsn-herald
- **business** - exprsn-forge
- **platform** - exprsn-svr, exprsn-workflow, exprsn-payments, exprsn-atlas

### GET /api/setup/services/:serviceId

Get individual service details.

**Parameters:**
- `serviceId` - Service identifier (e.g., "exprsn-ca")

**Response:**
```json
{
  "success": true,
  "service": {
    "id": "exprsn-ca",
    "name": "Certificate Authority",
    "port": 3000,
    "status": "running"
  }
}
```

### POST /api/setup/services/:serviceId/test

Test service connection and health.

**Response:**
```json
{
  "success": true,
  "serviceId": "exprsn-ca",
  "port": 3000,
  "responseTime": 45,
  "uptime": 3600,
  "running": true
}
```

---

## Database Operations

### GET /api/setup/databases

Get all 18 service databases with connection status.

**Response:**
```json
{
  "success": true,
  "databases": [
    {
      "id": "exprsn_ca",
      "name": "exprsn_ca",
      "service": "Certificate Authority",
      "connected": true,
      "tableCount": 12,
      "size": "45 MB",
      "priority": 1
    }
  ],
  "count": 18
}
```

**Database List:**
1. exprsn_ca - Certificate Authority
2. exprsn_auth - Authentication & SSO
3. exprsn_spark - Real-time Messaging
4. exprsn_timeline - Social Feed
5. exprsn_moderator - Content Moderation
6. exprsn_filevault - File Storage
7. exprsn_gallery - Media Management
8. exprsn_live - Video Streaming
9. exprsn_bridge - Social Integration
10. exprsn_nexus - API Gateway
11. exprsn_pulse - Analytics
12. exprsn_vault - Secrets Management
13. exprsn_herald - Notifications
14. exprsn_setup - Service Discovery
15. exprsn_lowcode - Low-Code Platform
16. exprsn_forge - CRM/ERP/Groupware
17. exprsn_workflow - Workflow Automation
18. exprsn_payments - Payment Processing

### GET /api/setup/databases/:databaseId/statistics

Get detailed database statistics including table sizes, connections, and more.

**Response:**
```json
{
  "success": true,
  "statistics": {
    "tableCount": 12,
    "databaseSize": "45 MB",
    "connectionCount": 5,
    "largestTables": [
      {
        "tablename": "certificates",
        "size": "15 MB",
        "size_bytes": 15728640
      }
    ]
  }
}
```

### POST /api/setup/databases/:databaseId/test

Test database connection.

**Response:**
```json
{
  "success": true,
  "databaseId": "exprsn_ca",
  "name": "exprsn_ca",
  "connected": true,
  "tableCount": 12,
  "size": "45 MB",
  "version": "PostgreSQL 15.3"
}
```

### POST /api/setup/databases/:databaseId/migrate

Run Sequelize migrations for database.

**Response:**
```json
{
  "success": true,
  "message": "Migrations completed successfully",
  "migrations": {
    "executed": 5,
    "failed": 0
  }
}
```

### GET /api/setup/databases/:databaseId/migrations

Get migration status showing executed and pending migrations.

**Response:**
```json
{
  "success": true,
  "migrations": {
    "executed": 5,
    "pending": 2,
    "executedList": [
      {
        "name": "20240101000000-create-certificates.js",
        "created_at": "2024-01-01T00:00:00.000Z"
      }
    ],
    "pendingList": [
      "20240115000000-add-ocsp-table.js",
      "20240120000000-add-crl-table.js"
    ]
  }
}
```

### POST /api/setup/databases/:databaseId/backup

Create SQL backup of database using pg_dump.

**Request Body (Optional):**
```json
{
  "backupPath": "/path/to/custom/backup.sql"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Database backed up successfully",
  "backup": {
    "filename": "/Users/project/backups/exprsn_ca_2024-01-15T10-30-00-000Z.sql",
    "size": 5242880,
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### POST /api/setup/databases/:databaseId/restore

Restore database from SQL backup using psql.

**Request Body:**
```json
{
  "backupFile": "/path/to/backup.sql"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Database restored successfully",
  "restore": {
    "database": "exprsn_ca",
    "file": "/path/to/backup.sql",
    "timestamp": "2024-01-15T10:35:00.000Z"
  }
}
```

---

## Redis Management

### GET /api/setup/redis

Get Redis configuration and overall status.

**Response:**
```json
{
  "success": true,
  "redis": {
    "enabled": true,
    "host": "localhost",
    "port": 6379,
    "connected": true,
    "databases": [
      {
        "db": 0,
        "service": "exprsn-ca",
        "purpose": "CA token cache",
        "prefix": "ca:",
        "keyCount": 150
      }
    ]
  }
}
```

**Redis Database Allocations (0-15):**
- **DB 0** - exprsn-ca (CA token cache, prefix: `ca:`)
- **DB 1** - exprsn-auth (Sessions & OAuth, prefix: `auth:`)
- **DB 2** - exprsn-spark (Chat & presence, prefix: `spark:`)
- **DB 3** - exprsn-timeline (Feed cache, prefix: `timeline:`)
- **DB 4** - exprsn-prefetch (Prefetch cache, prefix: `prefetch:`)
- **DB 5** - exprsn-moderator (Moderation queue, prefix: `mod:`)
- **DB 6** - exprsn-filevault (File metadata, prefix: `file:`)
- **DB 7** - exprsn-gallery (Media cache, prefix: `gallery:`)
- **DB 8** - exprsn-live (Streaming state, prefix: `live:`)
- **DB 9** - exprsn-nexus (API cache, prefix: `nexus:`)
- **DB 10** - exprsn-pulse (Analytics buffer, prefix: `pulse:`)
- **DB 11** - exprsn-herald (Notification queue, prefix: `herald:`)
- **DB 12** - exprsn-forge (CRM cache, prefix: `forge:`)
- **DB 13** - exprsn-workflow (Workflow state, prefix: `workflow:`)
- **DB 14** - exprsn-payments (Payment processing, prefix: `payment:`)
- **DB 15** - exprsn-svr (Low-Code cache, prefix: `lowcode:`)

### POST /api/setup/redis/test

Test Redis connection with custom host/port/password.

**Request Body:**
```json
{
  "host": "localhost",
  "port": 6379,
  "password": "optional-password"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Redis connection successful",
  "host": "localhost",
  "port": 6379,
  "responseTime": 12
}
```

### POST /api/setup/redis/flush/:dbNumber

Flush all keys from specific Redis database (DANGER - use with caution).

**Parameters:**
- `dbNumber` - Database number (0-15)

**Response:**
```json
{
  "success": true,
  "message": "Redis database flushed successfully",
  "db": 0,
  "deletedKeys": 150
}
```

### GET /api/setup/redis/:dbNumber/info

Get detailed statistics for specific Redis database.

**Parameters:**
- `dbNumber` - Database number (0-15)

**Response:**
```json
{
  "success": true,
  "dbNumber": 0,
  "statistics": {
    "keyCount": 150,
    "expiresCount": 45,
    "usedMemory": "2.5M",
    "maxMemory": "512M",
    "sampleKeys": [
      {
        "key": "ca:token:abc123",
        "type": "string",
        "ttl": "3600s"
      }
    ]
  }
}
```

### GET /api/setup/redis/:dbNumber/keys

Get keys matching pattern from Redis database (with limit).

**Parameters:**
- `dbNumber` - Database number (0-15)

**Query Parameters:**
- `pattern` - Key pattern (default: "*"), e.g., "ca:token:*"
- `limit` - Maximum keys to return (default: 100)

**Response:**
```json
{
  "success": true,
  "pattern": "ca:token:*",
  "dbNumber": 0,
  "totalMatches": 150,
  "returned": 100,
  "keys": [
    {
      "key": "ca:token:abc123",
      "type": "string",
      "ttl": "3600s",
      "value": "{\"userId\":\"123\",\"permissions\":{\"read\":true}}"
    }
  ]
}
```

### DELETE /api/setup/redis/:dbNumber/keys

Delete keys matching pattern from Redis database.

**Parameters:**
- `dbNumber` - Database number (0-15)

**Request Body:**
```json
{
  "pattern": "ca:token:expired:*"
}
```

**Response:**
```json
{
  "success": true,
  "pattern": "ca:token:expired:*",
  "dbNumber": 0,
  "deleted": 25
}
```

---

## System Health

### GET /api/setup/system-health

Get complete system health overview including services, databases, and Redis.

**Response:**
```json
{
  "success": true,
  "health": {
    "overall": {
      "status": "healthy",
      "timestamp": "2024-01-15T10:00:00.000Z"
    },
    "services": {
      "running": 18,
      "total": 21,
      "percentage": 86,
      "details": []
    },
    "databases": {
      "connected": 17,
      "total": 18,
      "percentage": 94,
      "details": []
    },
    "redis": {
      "connected": true,
      "databases": 16,
      "totalKeys": 1500
    }
  }
}
```

**Health Status Values:**
- `healthy` - >= 90% services/databases operational
- `degraded` - 70-89% services/databases operational
- `unhealthy` - < 70% services/databases operational
- `critical` - Critical services (exprsn-ca, exprsn-svr) or databases (exprsn_ca, exprsn_lowcode) down

### GET /api/setup/config

Get current runtime configuration (non-sensitive values).

**Response:**
```json
{
  "success": true,
  "config": {
    "environment": "development",
    "port": 5001,
    "database": {
      "host": "localhost",
      "port": 5432,
      "name": "exprsn_lowcode",
      "user": "postgres"
    },
    "redis": {
      "enabled": true,
      "host": "localhost",
      "port": 6379
    },
    "security": {
      "devAuthEnabled": true,
      "sessionSecret": "***",
      "jwtSecret": "***"
    },
    "forge": {
      "enabled": true,
      "serviceUrl": "http://localhost:3016"
    },
    "workflow": {
      "enabled": true,
      "serviceUrl": "http://localhost:3017"
    }
  }
}
```

### GET /api/setup/config/export

Export complete configuration as downloadable JSON file.

**Response:** JSON file download with complete configuration for all services, databases, and Redis allocations.

---

## WebSocket Events

The Setup Configuration system uses Socket.IO for real-time monitoring.

**Connect to WebSocket:**
```javascript
const socket = io({
  path: '/socket.io',
  transports: ['websocket', 'polling']
});

socket.emit('join-setup-room');
```

**Emitted Events:**

### system-health-update
Broadcasts every 5 seconds with complete system health.

```javascript
socket.on('system-health-update', (health) => {
  console.log('System health:', health);
});
```

### service-status-update
Broadcasts when service status changes.

```javascript
socket.on('service-status-update', (data) => {
  console.log('Service update:', data);
  // { serviceId: 'exprsn-ca', status: 'running', responseTime: 45, uptime: 3600 }
});
```

### database-status-update
Broadcasts when database connection status changes.

```javascript
socket.on('database-status-update', (data) => {
  console.log('Database update:', data);
  // { databaseId: 'exprsn_ca', connected: true, tableCount: 12, size: '45 MB' }
});
```

**Received Events:**

### check-service
Manually trigger service health check.

```javascript
socket.emit('check-service', { serviceId: 'exprsn-ca' }, (response) => {
  console.log('Service health:', response);
});
```

### check-database
Manually trigger database connection check.

```javascript
socket.emit('check-database', { databaseId: 'exprsn_ca' }, (response) => {
  console.log('Database status:', response);
});
```

---

## Error Responses

All endpoints return standardized error responses:

```json
{
  "success": false,
  "message": "Human-readable error message",
  "error": "Technical error details"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (service/database not found)
- `500` - Internal Server Error

---

## Environment Variables Reference

Complete list of environment variables managed by the Setup Configuration system:

### Application
- `NODE_ENV` - Environment (development/production)
- `PORT` - Server port (default: 5001)
- `SERVICE_NAME` - Service identifier

### Database
- `DB_HOST` - PostgreSQL host
- `DB_PORT` - PostgreSQL port (default: 5432)
- `DB_NAME` - Database name
- `DB_USER` - Database username
- `DB_PASSWORD` - Database password
- `DB_POOL_MAX` - Max connection pool size (default: 20)
- `DB_POOL_MIN` - Min connection pool size (default: 5)

### Redis
- `REDIS_ENABLED` - Enable/disable Redis (default: true)
- `REDIS_HOST` - Redis host
- `REDIS_PORT` - Redis port (default: 6379)
- `REDIS_PASSWORD` - Redis password (optional)
- `REDIS_DB` - Default Redis database number (default: 0)
- `CACHE_TTL` - Default cache TTL in seconds (default: 3600)

### CA Integration
- `CA_URL` - Certificate Authority URL
- `CA_VERIFY_TOKENS` - Verify CA tokens (default: true)
- `CA_PUBLIC_KEY_PATH` - Path to CA public key

### Low-Code Platform
- `LOW_CODE_DEV_AUTH` - Bypass authentication in dev mode (default: false)

### Security
- `SESSION_SECRET` - Express session secret
- `JWT_SECRET` - JWT signing secret
- `ENABLE_SQL_INJECTION_DETECTION` - Enable SQL injection detection
- `ENABLE_XSS_PROTECTION` - Enable XSS protection
- `ALLOWED_ORIGINS` - Comma-separated CORS origins

### Code Execution
- `CODE_EXECUTION_ENABLED` - Enable code execution (default: true)
- `CODE_EXECUTION_TIMEOUT` - Execution timeout in ms (default: 5000)
- `CODE_EXECUTION_MEMORY_LIMIT` - Memory limit in MB (default: 128)

### Socket.IO
- `SOCKET_IO_ENABLED` - Enable Socket.IO (default: true)
- `SOCKET_IO_PATH` - Socket.IO path (default: /socket.io)
- `SOCKET_IO_CORS_ORIGINS` - Comma-separated CORS origins

### File Storage
- `MAX_FILE_SIZE` - Max upload size in bytes (default: 10485760)
- `UPLOAD_DIR` - Upload directory (default: ./uploads)
- `STATIC_DIR` - Static files directory (default: ./public)

### Rate Limiting
- `RATE_LIMIT_WINDOW_MS` - Rate limit window in ms (default: 60000)
- `RATE_LIMIT_MAX_REQUESTS` - Max requests per window (default: 100)

### Logging
- `LOG_LEVEL` - Log level (default: info)
- `LOG_DIR` - Log directory (default: ./logs)
- `LOG_MAX_FILES` - Max log files to keep (default: 30)

---

## Usage Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

// Get system health
const health = await axios.get('http://localhost:5001/lowcode/api/setup/system-health');
console.log('System status:', health.data.health.overall.status);

// Get all services
const services = await axios.get('http://localhost:5001/lowcode/api/setup/services');
console.log(`Running services: ${services.data.services.filter(s => s.status === 'running').length}`);

// Test specific service
const test = await axios.post('http://localhost:5001/lowcode/api/setup/services/exprsn-ca/test');
console.log('CA response time:', test.data.responseTime, 'ms');

// Get database statistics
const stats = await axios.get('http://localhost:5001/lowcode/api/setup/databases/exprsn_ca/statistics');
console.log('Database size:', stats.data.statistics.databaseSize);

// Backup database
const backup = await axios.post('http://localhost:5001/lowcode/api/setup/databases/exprsn_ca/backup');
console.log('Backup created:', backup.data.backup.filename);

// Get Redis keys
const keys = await axios.get('http://localhost:5001/lowcode/api/setup/redis/0/keys?pattern=ca:token:*&limit=50');
console.log(`Found ${keys.data.totalMatches} matching keys`);
```

### cURL

```bash
# Get system health
curl http://localhost:5001/lowcode/api/setup/system-health

# Get all services
curl http://localhost:5001/lowcode/api/setup/services

# Test service
curl -X POST http://localhost:5001/lowcode/api/setup/services/exprsn-ca/test

# Run database migrations
curl -X POST http://localhost:5001/lowcode/api/setup/databases/exprsn_ca/migrate

# Backup database
curl -X POST http://localhost:5001/lowcode/api/setup/databases/exprsn_ca/backup

# Get Redis DB info
curl http://localhost:5001/lowcode/api/setup/redis/0/info

# Flush Redis DB (CAUTION!)
curl -X POST http://localhost:5001/lowcode/api/setup/redis/flush/0
```

---

## Security Notes

1. **Development Mode Only** - The Setup Configuration API should only be exposed in development mode with `LOW_CODE_DEV_AUTH=true`

2. **Production Deployment** - In production, this API should be:
   - Protected by CA token authentication
   - Limited to admin users only
   - Accessible only from internal networks
   - Monitored for security events

3. **Sensitive Operations** - Operations like database backup/restore and Redis flush should require additional confirmation

4. **Environment Variables** - The API exposes environment configuration - ensure sensitive values (passwords, secrets) are never returned in responses

---

*Generated for Exprsn Platform Setup Configuration v1.0*
*Last Updated: 2024-01-15*
