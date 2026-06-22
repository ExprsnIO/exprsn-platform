# Timeline Service - TLS, Service Integration & RBAC Updates

This document describes the comprehensive updates made to the exprsn-timeline service.

## 🔒 TLS Support

### Features
- **Automatic TLS/HTTPS support** with graceful fallback to HTTP
- **Self-signed certificate generation** for local development
- **Environment-based configuration** for flexible deployment

### Usage

1. **Generate TLS certificates** (for local development):
   ```bash
   npm run generate-certs
   ```

2. **Enable TLS** in your `.env` file:
   ```env
   TLS_ENABLED=true
   TLS_CERT_PATH=./certs/localhost-cert.pem
   TLS_KEY_PATH=./certs/localhost-key.pem
   ```

3. **Start the service**:
   ```bash
   npm start
   ```
   Service will be available at `https://localhost:3004`

### Certificate Generation Script

- **Location**: `scripts/generate-tls-certs.js`
- **Features**:
  - Uses `node-forge` for cross-platform compatibility
  - Generates RSA 2048-bit keys
  - Creates self-signed certificates valid for 1 year
  - Includes Subject Alternative Names (SANs) for localhost and 127.0.0.1
  - Sets restrictive permissions on private keys (chmod 600)

⚠️ **Important**: Generated certificates are for **development only**. Use proper CA-signed certificates in production.

---

## 🔗 Service Integration

### Integrated Services

#### 1. **Herald Service** (Notifications)
- **URL**: `http://localhost:3014` (configurable)
- **Purpose**: Multi-channel notifications for timeline events
- **Integration**: `src/services/heraldService.js`

**Features**:
- Send notifications for likes, comments, reposts, mentions
- Batch notification support
- Health check integration
- Configurable timeout and enable/disable flag

#### 2. **Spark Service** (Real-time Messaging)
- **URL**: `http://localhost:3002` (configurable)
- **Purpose**: Real-time event broadcasting via WebSocket
- **Integration**: `src/services/sparkService.js`

**Features**:
- Real-time event broadcasting to connected clients
- Multi-user broadcast support
- Follower notification on new posts
- Health check integration

#### 3. **Prefetch Service** (Timeline Caching)
- **URL**: `http://localhost:3005` (configurable)
- **Purpose**: Timeline caching and prefetching for performance
- **Integration**: `src/services/prefetchService.js`

**Features**:
- Cache invalidation for user timelines
- Timeline prefetching
- Cached timeline retrieval
- Bulk cache warming
- Health check integration

### Configuration

Add to your `.env` file:

```env
# Herald
HERALD_SERVICE_URL=http://localhost:3014
HERALD_ENABLED=true
HERALD_TIMEOUT=5000

# Spark
SPARK_SERVICE_URL=http://localhost:3002
SPARK_ENABLED=true
SPARK_TIMEOUT=5000

# Prefetch
PREFETCH_SERVICE_URL=http://localhost:3005
PREFETCH_ENABLED=true
PREFETCH_TIMEOUT=5000
```

### Service Health Checks

On startup, the Timeline service checks the health of all integrated services and logs their status:

```
[Timeline] Checking service integrations...
[Timeline] Herald service connected
[Timeline] Spark service connected
[Timeline] Prefetch service connected
```

If a service is unavailable, operations gracefully degrade with warning logs.

---

## 👮 RBAC (Role-Based Access Control)

### Features
- **Comprehensive RBAC middleware** using `@exprsn/shared`
- **Role-based route protection** for admin and moderator operations
- **Resource ownership validation** for edit/delete operations
- **User role enrichment** middleware

### Available Middlewares

#### 1. **User Role Enrichment**
```javascript
const { enrichUserRole } = require('./middleware/rbac');

// Add to your middleware chain
app.use(enrichUserRole);
```

Enriches `req` object with:
- `req.userRole` - Primary user role
- `req.userRoles` - Array of all user roles

#### 2. **Role Requirements**
```javascript
const { requireAdminRole, requireModeratorRole, requireSpecificRole } = require('./middleware/rbac');

// Admin only
router.post('/admin/action', requireAdminRole, handler);

// Moderators and admins
router.post('/moderate', requireModeratorRole, handler);

// Specific role(s)
router.post('/premium', requireSpecificRole('premium'), handler);
router.post('/action', requireSpecificRole(['editor', 'admin']), handler);
```

#### 3. **Resource Ownership**
```javascript
const { requirePostOwnerOrAdmin } = require('./middleware/rbac');

// Only post owner or admin can delete
router.delete('/posts/:id', requirePostOwnerOrAdmin, handler);
```

### Protected Routes

| Route | Protection | Allowed Roles |
|-------|-----------|---------------|
| `GET /api/jobs/*` | ✅ Admin only | admin |
| `POST /api/jobs/:queueName/pause` | ✅ Admin only | admin |
| `POST /api/jobs/:queueName/resume` | ✅ Admin only | admin |
| `POST /api/jobs/:queueName/clean` | ✅ Admin only | admin |
| `DELETE /api/posts/:id` | ✅ Owner or Admin | owner, admin |
| `PUT /api/posts/:id` | ✅ Owner or Admin | owner, admin |

### Role Integration with Auth Service

In production, integrate with the exprsn-auth service to fetch user roles:

```javascript
// In src/middleware/rbac.js - getUserRoles()
async function getUserRoles(userId) {
  const response = await axios.get(
    `${AUTH_SERVICE_URL}/api/users/${userId}/roles`,
    {
      headers: {
        'Authorization': `Bearer ${serviceToken}`
      }
    }
  );
  return response.data.roles;
}
```

### Default Roles

The platform supports these standard roles:
- **`user`** - Regular authenticated user
- **`moderator`** - Content moderation privileges
- **`admin`** - Full administrative access

---

## 📁 New Files

### Scripts
- `scripts/generate-tls-certs.js` - TLS certificate generation utility

### Services
- `src/services/sparkService.js` - Spark real-time messaging integration
- `src/services/prefetchService.js` - Prefetch caching integration
- `src/services/heraldService.js` - Herald notification integration (already existed)

### Middleware
- `src/middleware/rbac.js` - RBAC middleware and helpers

### Configuration
- `.env.example` - Complete environment configuration template

---

## 🔧 Modified Files

### Core Service
- `src/index.js`
  - Added TLS/HTTPS server configuration
  - Added service health checks on startup
  - Updated Socket.IO initialization to work with TLS
  - Added service integration imports

### Configuration
- `src/config/index.js`
  - Added Spark service configuration
  - Added Prefetch service configuration

### Routes
- `src/routes/jobs.js`
  - Added admin-only RBAC protection

### Package Configuration
- `package.json`
  - Added `generate-certs` script
  - Added `node-forge` dependency

---

## 🚀 Quick Start

1. **Install dependencies** (if not already done):
   ```bash
   npm install
   ```

2. **Generate TLS certificates** (optional, for HTTPS):
   ```bash
   npm run generate-certs
   ```

3. **Configure environment** (copy and edit):
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start the service**:
   ```bash
   npm start
   ```

5. **Access the service**:
   - HTTP: `http://localhost:3004`
   - HTTPS (if enabled): `https://localhost:3004`
   - WebSocket: `ws://localhost:3004` or `wss://localhost:3004`

---

## 🔍 Testing

### Test TLS Configuration
```bash
curl -k https://localhost:3004/health
```

### Test Service Integration Health
```bash
curl http://localhost:3004/health
```

Response should include service integration status.

### Test RBAC Protection
```bash
# Without admin role - should fail
curl -H "Authorization: Bearer <user-token>" \
  http://localhost:3004/api/jobs/stats

# With admin role - should succeed
curl -H "Authorization: Bearer <admin-token>" \
  http://localhost:3004/api/jobs/stats
```

---

## 📝 Environment Variables Reference

See `.env.example` for complete list. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `TLS_ENABLED` | `false` | Enable HTTPS/TLS |
| `TLS_CERT_PATH` | `./certs/localhost-cert.pem` | TLS certificate path |
| `TLS_KEY_PATH` | `./certs/localhost-key.pem` | TLS private key path |
| `SPARK_ENABLED` | `true` | Enable Spark integration |
| `PREFETCH_ENABLED` | `true` | Enable Prefetch integration |
| `HERALD_ENABLED` | `true` | Enable Herald integration |

---

## 🛡️ Security Considerations

### TLS Certificates
- ✅ Use CA-signed certificates in production
- ✅ Store private keys securely (chmod 600)
- ✅ Rotate certificates before expiration
- ✅ Never commit certificates to version control

### RBAC
- ✅ Validate roles on every protected request
- ✅ Integrate with centralized auth service for role management
- ✅ Log authorization failures for security monitoring
- ✅ Use principle of least privilege

### Service Integration
- ✅ Use mutual TLS for service-to-service communication in production
- ✅ Implement circuit breakers for resilience
- ✅ Set appropriate timeouts to prevent cascading failures
- ✅ Monitor service health continuously

---

## 📖 Related Documentation

- [Exprsn Platform Overview](../../CLAUDE.md)
- [Token Specification](../../TOKEN_SPECIFICATION_V1.0.md)
- [Shared Library Documentation](../shared/README.md)
- [Herald Service](../exprsn-herald/README.md)
- [Spark Service](../exprsn-spark/README.md)
- [Prefetch Service](../exprsn-prefetch/README.md)

---

**Last Updated**: 2025-12-21
**Author**: Rick Holland <engineering@exprsn.com>
