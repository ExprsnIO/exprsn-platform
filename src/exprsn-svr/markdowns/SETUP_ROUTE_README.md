# SVR Setup Route Documentation

## Overview

The `/setup` route provides a comprehensive web interface and API for managing **exprsn-svr** configuration, monitoring system health, and integrating with all Exprsn microservices.

## Quick Access

**Web Interface:**
```
https://localhost:5001/setup
```

**API Base URL:**
```
https://localhost:5001/setup/api/
```

---

## Features

### 1. **Service Discovery & Health Monitoring**
- Automatically discovers all 17 Exprsn microservices
- Real-time health status for each service
- Endpoint availability testing
- Service categorization (core, messaging, content, infrastructure, automation, media)

### 2. **Database Configuration**
- PostgreSQL connection details
- Real-time connection testing
- Version information
- Pool configuration display

### 3. **Redis Configuration**
- Redis connection status
- Cache TTL settings
- Database selection
- Version information
- Connection testing

### 4. **Environment Variable Management**
- Complete .env configuration viewer
- Sensitive value masking (passwords, secrets)
- Grouped by category:
  - Application Settings
  - Database Settings
  - Redis Settings
  - Security Settings
  - Code Execution
  - Socket.IO
  - Storage
  - Rate Limiting
  - Logging

### 5. **Service Integration**
- URLs for all 17 microservices
- Service descriptions and ports
- Available endpoints per service
- Running/stopped status indicators

---

## Web Interface

### Tabs

#### 1. **Overview Tab**
- System summary statistics
- Quick status checks for PostgreSQL and Redis
- Service count and environment information

#### 2. **Services Tab**
- Grid view of all discovered services
- Service cards showing:
  - Name and category
  - Description
  - Port and URL
  - Running status
  - Available endpoints

#### 3. **Database Tab**
- PostgreSQL configuration details
- Connection status with live testing
- Version information
- Error diagnostics

#### 4. **Redis Tab**
- Redis configuration details
- Connection status with live testing
- Version information
- Enable/disable status

#### 5. **Configuration Tab**
- Accordion-organized environment variables
- Application, Database, Redis, and Security settings
- Download .env template option

---

## API Endpoints

### System Status

#### `GET /setup/api/status`
Get complete system status including services, database, and Redis.

**Response:**
```json
{
  "success": true,
  "timestamp": "2025-12-21T23:19:25.705Z",
  "service": {
    "name": "exprsn-svr",
    "port": 5001,
    "env": "development",
    "uptime": 20.74
  },
  "database": {
    "connected": true,
    "version": "PostgreSQL 18.1...",
    "database": "exprsn_svr",
    "host": "localhost",
    "port": 5432
  },
  "redis": {
    "enabled": true,
    "connected": true,
    "host": "localhost",
    "port": 6379,
    "db": 0,
    "version": "8.2.2"
  },
  "services": [...]
}
```

### Service Management

#### `GET /setup/api/services`
Get list of all available services with their status.

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
      "running": true,
      "health": {...},
      "endpoints": [...],
      "url": "http://localhost:3000"
    }
  ]
}
```

#### `GET /setup/api/services/:serviceId`
Get detailed information about a specific service.

**Example:**
```bash
curl -k https://localhost:5001/setup/api/services/exprsn-timeline
```

**Response:**
```json
{
  "success": true,
  "service": {
    "id": "exprsn-timeline",
    "name": "Social Feed",
    "port": 3004,
    "category": "content",
    "description": "Posts, interactions, Bull queues",
    "running": true,
    "health": {...},
    "url": "http://localhost:3004",
    "endpoints": {
      "/health": {
        "available": true,
        "status": 200,
        "data": {...}
      }
    }
  }
}
```

### Configuration Management

#### `GET /setup/api/config`
Get current SVR configuration with sensitive values masked.

**Response:**
```json
{
  "success": true,
  "config": {
    "application": {...},
    "database": {
      "host": "localhost",
      "port": 5432,
      "password": "***MASKED***"
    },
    "redis": {...},
    "security": {
      "sessionSecret": "***MASKED***",
      "jwtSecret": "***MASKED***"
    }
  }
}
```

#### `GET /setup/api/config/env-template`
Get environment variable template with all available options.

**Response:**
```json
{
  "success": true,
  "template": {
    "APPLICATION": {...},
    "DATABASE": {...},
    "REDIS": {...},
    "SECURITY": {...}
  },
  "serviceUrls": {
    "EXPRSN_CA_URL": "http://localhost:3000",
    "EXPRSN_TIMELINE_URL": "http://localhost:3004",
    ...
  }
}
```

### Connection Testing

#### `POST /setup/api/config/test-db`
Test PostgreSQL connection.

**Response:**
```json
{
  "success": true,
  "status": {
    "connected": true,
    "version": "PostgreSQL 18.1...",
    "database": "exprsn_svr",
    "host": "localhost",
    "port": 5432
  }
}
```

#### `POST /setup/api/config/test-redis`
Test Redis connection.

**Response:**
```json
{
  "success": true,
  "status": {
    "enabled": true,
    "connected": true,
    "host": "localhost",
    "port": 6379,
    "db": 0,
    "version": "8.2.2"
  }
}
```

#### `POST /setup/api/config/test-service`
Test connection to a specific service.

**Request:**
```json
{
  "serviceId": "exprsn-timeline"
}
```

**Response:**
```json
{
  "success": true,
  "service": {
    "id": "exprsn-timeline",
    "name": "Social Feed",
    "port": 3004,
    "running": true,
    "health": {...}
  }
}
```

---

## Service Definitions

The setup route discovers and monitors these 17 services:

| Service ID | Port | Category | Description |
|------------|------|----------|-------------|
| **exprsn-ca** | 3000 | core | X.509 CA, OCSP, CRL, CA Tokens |
| **exprsn-auth** | 3001 | core | OAuth2, OIDC, SAML, MFA |
| **exprsn-spark** | 3002 | messaging | E2EE messaging, Socket.IO |
| **exprsn-timeline** | 3004 | content | Posts, interactions, Bull queues |
| **exprsn-prefetch** | 3005 | infrastructure | Timeline cache service |
| **exprsn-moderator** | 3006 | content | AI moderation, Herald integration |
| **exprsn-filevault** | 3007 | media | S3/Disk/IPFS, versioning |
| **exprsn-gallery** | 3008 | media | Albums, image processing |
| **exprsn-live** | 3009 | media | Live streaming, WebRTC |
| **exprsn-bridge** | 3010 | infrastructure | API Gateway, rate limiting |
| **exprsn-nexus** | 3011 | content | Groups, events, CalDAV |
| **exprsn-pulse** | 3012 | infrastructure | Analytics, Prometheus metrics |
| **exprsn-vault** | 3013 | infrastructure | Secrets management |
| **exprsn-herald** | 3014 | messaging | Notifications (push, email, SMS) |
| **exprsn-setup** | 3015 | core | Service discovery, configuration |
| **exprsn-forge** | 3016 | automation | Business platform (CRM/ERP) |
| **exprsn-workflow** | 3017 | automation | Workflow automation, 15 step types |

---

## Configuration Options

### Application Settings
```bash
NODE_ENV=development          # Environment (development/staging/production)
PORT=5001                     # Server port
SERVICE_NAME=exprsn-svr       # Service identifier
```

### Database Settings
```bash
DB_HOST=localhost             # PostgreSQL host
DB_PORT=5432                  # PostgreSQL port
DB_NAME=exprsn_svr            # Database name
DB_USER=postgres              # Database user
DB_PASSWORD=                  # Database password
DB_POOL_MAX=20                # Max pool connections
DB_POOL_MIN=5                 # Min pool connections
```

### Redis Settings
```bash
REDIS_ENABLED=true            # Enable/disable Redis
REDIS_HOST=localhost          # Redis host
REDIS_PORT=6379               # Redis port
REDIS_PASSWORD=               # Redis password (optional)
REDIS_DB=0                    # Redis database number
CACHE_TTL=3600                # Cache time-to-live (seconds)
```

### CA Integration
```bash
CA_URL=http://localhost:3000            # CA service URL
CA_VERIFY_TOKENS=true                   # Enable token verification
CA_PUBLIC_KEY_PATH=./keys/ca-public.pem # CA public key path
```

### Security Settings
```bash
SESSION_SECRET=                          # Session secret (generate with crypto.randomBytes)
JWT_SECRET=                              # JWT secret (generate with crypto.randomBytes)
ENABLE_SQL_INJECTION_DETECTION=true      # SQL injection protection
ENABLE_XSS_PROTECTION=true               # XSS protection
ALLOWED_ORIGINS=http://localhost:3000    # CORS allowed origins (comma-separated)
```

### Code Execution
```bash
CODE_EXECUTION_ENABLED=true    # Enable server-side code execution
CODE_EXECUTION_TIMEOUT=5000    # Execution timeout (ms)
CODE_EXECUTION_MEMORY_LIMIT=128 # Memory limit (MB)
```

### Socket.IO
```bash
SOCKET_IO_ENABLED=true                          # Enable Socket.IO
SOCKET_IO_PATH=/socket.io                       # Socket.IO path
SOCKET_IO_CORS_ORIGINS=http://localhost:3000    # CORS origins (comma-separated)
```

### File Storage
```bash
MAX_FILE_SIZE=10485760         # Max file size (bytes, default 10MB)
UPLOAD_DIR=./uploads           # Upload directory
STATIC_DIR=./public            # Static files directory
```

### Rate Limiting
```bash
RATE_LIMIT_WINDOW_MS=60000     # Rate limit window (ms)
RATE_LIMIT_MAX_REQUESTS=100    # Max requests per window
```

### Logging
```bash
LOG_LEVEL=info                 # Logging level (debug/info/warn/error)
LOG_DIR=./logs                 # Log directory
LOG_MAX_FILES=30               # Max log files to keep
```

---

## Usage Examples

### Starting the Service

```bash
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr
npm start
```

Then navigate to: **https://localhost:5001/setup**

### Testing Database Connection

```bash
curl -k -X POST https://localhost:5001/setup/api/config/test-db
```

### Getting System Status

```bash
curl -k https://localhost:5001/setup/api/status | python3 -m json.tool
```

### Checking Specific Service

```bash
curl -k https://localhost:5001/setup/api/services/exprsn-timeline | python3 -m json.tool
```

### Getting Configuration Template

```bash
curl -k https://localhost:5001/setup/api/config/env-template | python3 -m json.tool
```

---

## Integration with Other Services

The setup route integrates with:

1. **exprsn-setup** (Port 3015) - Leverages service discovery and configuration management
2. **All Exprsn Services** - Health checks and endpoint discovery
3. **PostgreSQL** - Database connection monitoring
4. **Redis** - Cache status monitoring

---

## Security Notes

1. **Sensitive Value Masking**: Passwords, secrets, and tokens are automatically masked in API responses
2. **HTTPS Enabled**: The server runs on HTTPS with TLS certificates
3. **CORS Protection**: Configurable allowed origins
4. **SQL Injection Detection**: Optional protection enabled via environment variable
5. **XSS Protection**: Helmet middleware for security headers

---

## Files Created

### Routes
- `src/exprsn-svr/routes/setup.js` - Main setup route handler

### Views
- `src/exprsn-svr/views/setup.ejs` - Web interface template

### Documentation
- `src/exprsn-svr/SETUP_ROUTE_README.md` - This file

---

## Dependencies

All required dependencies are already included in `package.json`:
- `ioredis` (5.3.2) - Redis client
- `axios` (1.6.5) - HTTP client for service discovery
- `express` (4.18.2) - Web framework
- `ejs` (3.1.9) - Templating engine
- `dotenv` (16.3.1) - Environment variable management

---

## Troubleshooting

### Port Already in Use
```bash
# Find process using port 5001
lsof -i :5001

# Kill the process
kill <PID>
```

### Database Connection Failed
- Ensure PostgreSQL is running
- Verify `DB_HOST`, `DB_PORT`, and `DB_NAME` in `.env`
- Check database exists: `psql -l | grep exprsn_svr`

### Redis Connection Failed
- Ensure Redis is running: `redis-cli ping`
- Verify `REDIS_HOST` and `REDIS_PORT` in `.env`
- Check if Redis is enabled: `REDIS_ENABLED=true`

### Service Not Discovered
- Verify the service is running on the expected port
- Check the service's `/health` endpoint returns 200 status
- Review service definitions in `routes/setup.js`

---

## Architecture Insights

**Service Discovery Pattern:**
The setup route uses a **parallel discovery pattern** where all services are checked simultaneously using `Promise.all()`, providing fast response times even when checking 17+ services.

**Connection Pooling:**
PostgreSQL connections use a pool (min: 5, max: 20) to efficiently handle multiple concurrent requests without overwhelming the database.

**Security-First Design:**
All sensitive configuration values (passwords, secrets, tokens) are automatically masked in API responses to prevent accidental exposure through logs or monitoring tools.

---

## Future Enhancements

Potential additions:
- Configuration editing via web interface
- Service restart/stop controls
- Real-time WebSocket updates for service status
- Configuration validation and suggestions
- Environment variable generation wizard
- Multi-environment configuration management
- Configuration diff viewer

---

## Support

For issues or questions:
- **Project:** Exprsn Certificate Authority Ecosystem
- **Version:** 1.0.0
- **Contact:** engineering@exprsn.com
