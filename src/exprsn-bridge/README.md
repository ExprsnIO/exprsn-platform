# Exprsn Bridge - API Gateway & Service Mesh

**Version:** 1.0.0
**Port:** 3010
**Status:** Production-Ready

---

## Overview

Exprsn Bridge is the central API gateway and service mesh for the Exprsn microservices ecosystem. It provides intelligent routing, authentication, rate limiting, and validation using a declarative JSON Lexicon Specification.

### Key Features

- ✅ **Lexicon-Based Routing** - Declarative API routing using JSON Lexicon v1.0
- ✅ **CA Token Authentication** - Cryptographically-signed token validation
- ✅ **Fine-Grained Permissions** - Permission-based access control
- ✅ **Request Validation** - JSON Schema validation for all inputs
- ✅ **Rate Limiting** - Per-route and global rate limiting
- ✅ **Service Discovery** - Dynamic service registry and health checks
- ✅ **Hot Reload** - Live lexicon reloading in development mode
- ✅ **Request Logging** - Comprehensive request/response logging
- ✅ **Proxy Middleware** - Transparent proxying to backend services

---

## Architecture

### JSON Lexicon Specification

Bridge uses **JSON Lexicon files** to define API routes declaratively. Each service has its own lexicon file that specifies:

- Route paths and HTTP methods
- Target backend service and endpoint
- Authentication requirements
- Permission checks
- Input validation schemas
- Rate limiting rules

**Example Lexicon Structure:**

```json
{
  "lexicon": {
    "version": "1.0",
    "service": {
      "name": "exprsn-auth",
      "version": "1.0.0",
      "description": "Authentication Service"
    },
    "routes": [
      {
        "path": "/api/auth/login",
        "method": "POST",
        "target": {
          "service": "auth",
          "path": "/api/auth/login",
          "timeout": 10000
        },
        "auth": {
          "required": false
        },
        "validation": {
          "body": {
            "type": "object",
            "required": ["email", "password"],
            "properties": {
              "email": { "type": "string", "format": "email" },
              "password": { "type": "string", "minLength": 8 }
            }
          }
        },
        "rateLimit": {
          "windowMs": 900000,
          "max": 10
        }
      }
    ]
  }
}
```

### Middleware Chain

Each proxied request flows through the following middleware chain:

1. **Global Rate Limiter** - Prevents abuse
2. **Request Logger** - Logs all requests
3. **Route-Specific Rate Limiter** - Per-route limits
4. **Authentication Middleware** - Validates CA tokens
5. **Permission Middleware** - Checks token permissions
6. **Validation Middleware** - Validates request data
7. **Proxy Middleware** - Forwards to backend service

---

## Quick Start

### Prerequisites

- Node.js 18+
- Running CA service (Port 3000) for token validation
- At least one backend service to proxy

### Installation

```bash
cd src/exprsn-bridge
npm install
```

### Configuration

Create `.env` file (already created from `.env.example`):

```env
NODE_ENV=development
PORT=3010

# Certificate Authority
CA_SERVICE_URL=http://localhost:3000

# Backend Services
AUTH_SERVICE_URL=http://localhost:3001
TIMELINE_SERVICE_URL=http://localhost:3004
# ... (see .env.example for all services)

# Logging
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=1000
```

### Running the Service

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

The Bridge service will:
1. Load all lexicon files from `src/config/lexicons/`
2. Create routes dynamically based on lexicons
3. Start listening on port 3010

### Verify Installation

```bash
# Check Bridge health
curl http://localhost:3010/health

# Get service information
curl http://localhost:3010/

# List all services
curl http://localhost:3010/api/discovery/services
```

---

## API Endpoints

### Core Endpoints

#### `GET /`
Get Bridge service information and loaded lexicons.

**Response:**
```json
{
  "service": "Exprsn Bridge",
  "version": "1.0.0",
  "description": "Service Integration & API Gateway",
  "lexicons": [...],
  "totalRoutes": 150,
  "features": [...]
}
```

#### `GET /health`
Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "service": "exprsn-bridge",
  "version": "1.0.0",
  "timestamp": "2024-12-24T10:00:00.000Z"
}
```

---

### Service Discovery Endpoints

All discovery endpoints are mounted at `/api/discovery`.

#### `GET /api/discovery/services`
List all registered services.

**Response:**
```json
{
  "success": true,
  "data": {
    "services": [
      {
        "name": "ca",
        "url": "http://localhost:3000",
        "port": "3000",
        "protocol": "http"
      },
      {
        "name": "auth",
        "url": "http://localhost:3001",
        "port": "3001",
        "protocol": "http"
      }
    ],
    "count": 22
  }
}
```

#### `GET /api/discovery/services/:name`
Get details for a specific service.

**Example:** `GET /api/discovery/services/auth`

#### `GET /api/discovery/health/all`
Check health status of all registered services.

**Query Parameters:**
- `timeout` - Timeout in milliseconds (default: 3000)

**Response:**
```json
{
  "success": true,
  "data": {
    "overall": "healthy",
    "healthy": 20,
    "total": 22,
    "services": [
      {
        "service": "ca",
        "url": "http://localhost:3000",
        "status": "healthy",
        "statusCode": 200,
        "responseTime": 45,
        "data": {...},
        "timestamp": "2024-12-24T10:00:00.000Z"
      }
    ]
  }
}
```

**Status Values:**
- `healthy` - Service responded with 200 OK
- `unhealthy` - Service responded but with non-200 status
- `unreachable` - Service did not respond

#### `GET /api/discovery/health/:service`
Check health of a specific service.

**Example:** `GET /api/discovery/health/auth?timeout=5000`

#### `GET /api/discovery/metrics`
Get aggregated metrics from all services.

---

### Admin Endpoints

All admin endpoints require CA token authentication with appropriate permissions.

#### `GET /api/admin/lexicons`
Get all loaded lexicons.

**Headers:**
```
Authorization: Bearer <ca-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "lexicons": [
      {
        "service": "exprsn-auth",
        "version": "1.0.0",
        "description": "Authentication Service",
        "routes": 25,
        "policies": {...}
      }
    ],
    "totalRoutes": 150,
    "routesByService": {
      "exprsn-auth": 25,
      "exprsn-ca": 18,
      "exprsn-timeline": 20
    }
  }
}
```

#### `POST /api/admin/lexicons/reload`
Reload all lexicon files.

**Headers:**
```
Authorization: Bearer <ca-token>
```

**Permissions Required:** `{ update: true }`

**Response:**
```json
{
  "success": true,
  "message": "Lexicons reloaded successfully",
  "data": {
    "count": 22,
    "lexicons": [...]
  }
}
```

**Note:** Lexicon reload does not update active routes. Restart the server for route changes to take effect.

#### `GET /api/admin/routes`
Get all routes from all lexicons.

**Query Parameters:**
- `service` - Filter routes by service name

**Example:** `GET /api/admin/routes?service=exprsn-auth`

#### `GET /api/admin/stats`
Get Bridge service statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "uptime": 3600.5,
    "memory": {...},
    "environment": "development",
    "version": "1.0.0",
    "lexicons": {
      "loaded": 22,
      "totalRoutes": 150
    },
    "services": 22,
    "timestamp": "2024-12-24T10:00:00.000Z"
  }
}
```

---

## Proxied Service Routes

All backend service routes are automatically created from lexicon files. Routes follow the pattern:

```
/api/{service}/{endpoint}
```

**Examples:**
- `POST /api/auth/login` → `http://localhost:3001/api/auth/login`
- `GET /api/timeline/posts` → `http://localhost:3004/api/posts`
- `POST /api/ca/tokens/generate` → `http://localhost:3000/api/tokens/generate`

### Supported Services

| Service | Port | Routes | Description |
|---------|------|--------|-------------|
| `ca` | 3000 | 16 | Certificate Authority |
| `auth` | 3001 | 30+ | Authentication & OAuth2 |
| `spark` | 3002 | 20+ | Real-time Messaging |
| `timeline` | 3004 | 15+ | Social Feed |
| `prefetch` | 3005 | 10+ | Timeline Caching |
| `moderator` | 3006 | 12+ | Content Moderation |
| `filevault` | 3007 | 15+ | File Storage |
| `gallery` | 3008 | 10+ | Media Galleries |
| `live` | 3009 | 12+ | Live Streaming |
| `nexus` | 3011 | 20+ | Groups & Events |
| `pulse` | 3012 | 10+ | Analytics |
| `vault` | 3013 | 12+ | Secrets Management |
| `herald` | 3014 | 15+ | Notifications |
| `setup` | 3015 | 8+ | Service Discovery |
| `forge` | 3016 | 30+ | Business/CRM |
| `workflow` | 3017 | 20+ | Workflow Automation |
| `payments` | 3018 | 10+ | Payment Gateway |
| `atlas` | 3019 | 12+ | Geospatial |
| `dbadmin` | 3020 | 10+ | Database Admin |
| `bluesky` | 3021 | 12+ | AT Protocol |

---

## Development

### Adding a New Service

1. **Create Lexicon File:** `src/config/lexicons/{service}.lexicon.json`

```json
{
  "lexicon": {
    "version": "1.0",
    "service": {
      "name": "exprsn-myservice",
      "version": "1.0.0",
      "description": "My Service Description"
    },
    "routes": [
      {
        "path": "/api/myservice/endpoint",
        "method": "GET",
        "target": {
          "service": "myservice",
          "path": "/api/endpoint",
          "timeout": 5000
        },
        "auth": {
          "required": true,
          "permissions": {
            "read": true
          }
        }
      }
    ],
    "policies": {
      "defaultAuth": true,
      "defaultRateLimit": {
        "windowMs": 60000,
        "max": 100
      }
    }
  }
}
```

2. **Add Service URL to `.env`:**

```env
MYSERVICE_SERVICE_URL=http://localhost:3022
```

3. **Add Service to `src/config/index.js`:**

```javascript
services: {
  // ... existing services
  myservice: process.env.MYSERVICE_SERVICE_URL || 'http://localhost:3022'
}
```

4. **Restart Bridge Service**

The routes will be automatically created and available immediately.

### Lexicon Validation

Lexicons are validated against a JSON schema on load. Validation errors will be logged but won't prevent the service from starting (invalid lexicons are skipped).

**Validate all lexicons:**

```bash
node validate-lexicons.js
```

### Hot Reload (Development Only)

In development mode, lexicon files are watched for changes. When a lexicon is modified:

1. The file is automatically reloaded
2. A warning is logged
3. **Routes are NOT updated** (requires restart)

To apply route changes, restart the server:

```bash
npm run dev  # Will restart automatically with nodemon
```

---

## Security

### Authentication

Bridge validates CA tokens using the shared `validateCAToken` middleware:

```javascript
const { validateCAToken } = require('@exprsn/shared');
```

Tokens are validated by:
1. Checking signature with CA public key
2. Verifying token hasn't expired
3. Checking OCSP status (not revoked)
4. Validating resource permissions

### Authorization

Permission checks are enforced based on lexicon configuration:

```json
{
  "auth": {
    "required": true,
    "permissions": {
      "read": true,
      "write": false,
      "delete": false
    }
  }
}
```

### Rate Limiting

Two levels of rate limiting:

**Global Rate Limit** (all requests):
- Window: 15 minutes
- Max: 1000 requests per IP

**Route-Specific Limits** (from lexicon):
```json
{
  "rateLimit": {
    "windowMs": 60000,
    "max": 100
  }
}
```

### Request Validation

All requests are validated using AJV (JSON Schema):
- Path parameters
- Query parameters
- Request body
- Headers

Invalid requests receive a `400 Bad Request` with detailed error information.

---

## Error Handling

### Standard Error Response

```json
{
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {...}
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `AUTHENTICATION_REQUIRED` | 401 | No token provided |
| `INVALID_TOKEN` | 401 | Token validation failed |
| `INSUFFICIENT_PERMISSIONS` | 403 | Missing required permissions |
| `VALIDATION_ERROR` | 400 | Request validation failed |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `SERVICE_UNAVAILABLE` | 503 | Backend service not configured |
| `BAD_GATEWAY` | 502 | Backend service unreachable |
| `SERVICE_NOT_FOUND` | 404 | Service not registered |

---

## Monitoring & Observability

### Logging

Bridge uses Winston for structured logging:

```javascript
logger.info('Request received', {
  method: 'POST',
  path: '/api/auth/login',
  ip: '127.0.0.1'
});
```

**Log Levels:** `error`, `warn`, `info`, `debug`

Set level via `LOG_LEVEL` environment variable.

### Health Monitoring

Use the service discovery endpoints to monitor backend service health:

```bash
# Check all services
curl http://localhost:3010/api/discovery/health/all

# Watch health continuously
watch -n 5 'curl -s http://localhost:3010/api/discovery/health/all | jq .data.overall'
```

### Metrics

Get aggregated metrics from all services:

```bash
curl http://localhost:3010/api/discovery/metrics
```

---

## Testing

### Manual Testing

```bash
# Test health endpoint
curl http://localhost:3010/health

# Test proxied route (no auth)
curl http://localhost:3010/api/ca/health

# Test authenticated route
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3010/api/auth/me

# Test validation
curl -X POST http://localhost:3010/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"invalid","password":"short"}'
```

### Integration Tests

Integration tests will verify:
- Lexicon loading
- Route creation
- Authentication flow
- Permission checks
- Validation
- Proxying to backend services
- Error handling

---

## Troubleshooting

### Bridge Won't Start

**Check:** Lexicon files are valid JSON
```bash
node validate-lexicons.js
```

**Check:** Port 3010 is available
```bash
lsof -i :3010
```

### Routes Not Working

**Check:** Lexicon was loaded
```bash
curl http://localhost:3010/api/admin/lexicons
```

**Check:** Service URL is configured
```bash
curl http://localhost:3010/api/discovery/services
```

### 502 Bad Gateway

**Cause:** Backend service is not running

**Solution:** Start the target service or check service URL in `.env`

### Token Validation Fails

**Check:** CA service is running
```bash
curl http://localhost:3000/health
```

**Check:** Token is valid and not expired
```bash
# Use CA token introspection endpoint
curl -X POST http://localhost:3000/api/tokens/validate \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR_TOKEN"}'
```

---

## Production Deployment

### Environment Configuration

```env
NODE_ENV=production
PORT=3010
LOG_LEVEL=warn

# Use production service URLs
CA_SERVICE_URL=https://ca.exprsn.io
AUTH_SERVICE_URL=https://auth.exprsn.io
# ...

# Tighten rate limits
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=500

# Restrict CORS
CORS_ORIGIN=https://app.exprsn.io,https://admin.exprsn.io
```

### Best Practices

1. **Use HTTPS:** Run behind a TLS terminator (nginx, Traefik)
2. **Enable Certificate Binding:** Set `certificateBinding: true` in sensitive lexicons
3. **Monitor Health:** Set up automated health checks
4. **Log Aggregation:** Send logs to centralized logging (e.g., ELK, Datadog)
5. **Rate Limiting:** Adjust limits based on actual traffic patterns
6. **Service Discovery:** Use service mesh (Consul, Linkerd) for production

---

## Contributing

When adding new features:

1. Follow existing middleware patterns
2. Add comprehensive error handling
3. Update this README
4. Add integration tests
5. Validate lexicon changes

---

## License

MIT License - Copyright (c) 2024 Rick Holland

---

## Support

- **Email:** engineering@exprsn.com
- **Documentation:** See `CLAUDE.md` in repository root
- **Issues:** Report bugs via GitHub Issues
