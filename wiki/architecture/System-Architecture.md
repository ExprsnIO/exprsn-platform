# System Architecture

This document describes the overall architecture of the Exprsn platform.

---

## High-Level Overview

Exprsn is a **microservices-based platform** that follows the **database-per-service** pattern. Each service is independently deployable, scalable, and maintains its own data store.

```
┌──────────────────────────────────────────────────────────────┐
│                      External Clients                         │
│            (Web Browsers, Mobile Apps, APIs)                  │
└────────────────────────┬─────────────────────────────────────┘
                         │
                    ┌────▼────┐
                    │   TLS   │
                    │  (443)  │
                    └────┬────┘
                         │
         ┌───────────────▼────────────────┐
         │    exprsn-bridge (Port 3010)   │
         │         API Gateway            │
         │  - Routing                     │
         │  - Rate Limiting               │
         │  - Request/Response Transform  │
         └───────────────┬────────────────┘
                         │
         ┌───────────────┼────────────────┐
         │               │                │
    ┌────▼────┐    ┌────▼────┐    ┌─────▼─────┐
    │   CA    │    │  Auth   │    │  Timeline │
    │  :3000  │    │  :3001  │    │   :3004   │
    └────┬────┘    └────┬────┘    └─────┬─────┘
         │               │                │
         └───────────────┼────────────────┘
                         │
                    ┌────▼────┐
                    │  Redis  │
                    │ Cluster │
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │PostgreSQL│
                    │ Cluster │
                    └─────────┘
```

---

## Core Architectural Principles

### 1. Microservices Architecture

Each service:
- **Runs independently**: Own process, port, and deployment
- **Owns its data**: Dedicated PostgreSQL database
- **Communicates via APIs**: REST + WebSocket
- **Is fault-isolated**: Failures don't cascade
- **Scales independently**: Based on individual load

### 2. Database-Per-Service

```
exprsn-ca       → exprsn_ca (PostgreSQL)
exprsn-auth     → exprsn_auth (PostgreSQL)
exprsn-timeline → exprsn_timeline (PostgreSQL)
exprsn-svr      → exprsn_svr (PostgreSQL)
...
```

**Benefits**:
- Schema independence
- Technology flexibility
- Clear ownership
- Easier scaling
- Reduced coupling

**Challenges** Addressed:
- **Distributed transactions**: Event-driven patterns
- **Data consistency**: Eventually consistent with event sourcing
- **Cross-service queries**: Dedicated aggregation services

### 3. Security-First Design

#### CA Token System
All inter-service communication uses **CA Tokens**:

```javascript
{
  "id": "uuid",
  "version": "1.0",
  "permissions": {
    "read": true,
    "write": false,
    "update": false,
    "delete": false,
    "append": false
  },
  "resource": {
    "type": "url",
    "value": "https://api.exprsn.io/timeline/*"
  },
  "signature": "RSA-SHA256-PSS signature",
  "expiresAt": "2026-12-31T23:59:59Z"
}
```

**Security Features**:
- RSA-SHA256-PSS signatures (2048/4096-bit keys)
- OCSP validation for certificate status
- Fine-grained permissions
- Resource-specific access control
- Cryptographic checksums

### 4. Event-Driven Communication

Services communicate via:

#### Synchronous (REST API)
- Direct service-to-service HTTP calls
- CA token authentication
- Request/response pattern
- Suitable for immediate operations

#### Asynchronous (Message Queues)
- Bull queues (Redis-backed)
- Fire-and-forget pattern
- Suitable for long-running operations
- Example: Timeline fan-out, content moderation

#### Real-time (WebSocket)
- Socket.IO for persistent connections
- Pub/sub pattern
- Suitable for: messaging, notifications, live updates

---

## Service Layers

### Layer 1: Foundation (Must Start First)

#### exprsn-ca (Port 3000)
- **Role**: Certificate Authority
- **Critical**: YES - Must start before all others
- **Provides**: CA tokens, OCSP, CRL
- **Dependencies**: None

#### exprsn-setup (Port 3015)
- **Role**: Service Discovery & Management
- **Critical**: YES
- **Provides**: Health checks, service registry
- **Dependencies**: CA

### Layer 2: Core Services

#### exprsn-auth (Port 3001)
- **Role**: Authentication & Identity
- **Provides**: OAuth2/OIDC, SAML, MFA, user management
- **Dependencies**: CA

#### exprsn-vault (Port 3013)
- **Role**: Secrets Management
- **Provides**: Encrypted secrets storage, key rotation
- **Dependencies**: CA, Auth

### Layer 3: Infrastructure Services

#### exprsn-bridge (Port 3010)
- **Role**: API Gateway
- **Provides**: Routing, rate limiting, transformation
- **Dependencies**: CA, Setup

#### exprsn-pulse (Port 3012)
- **Role**: Analytics & Metrics
- **Provides**: Monitoring, dashboards, Prometheus export
- **Dependencies**: CA, Auth

### Layer 4: Application Services

#### exprsn-timeline (Port 3004)
- **Role**: Social Feed
- **Provides**: Posts, likes, comments, feed algorithms
- **Dependencies**: CA, Auth, Herald, Moderator

#### exprsn-spark (Port 3002)
- **Role**: Real-time Messaging
- **Provides**: Direct messages, group chat, E2EE
- **Dependencies**: CA, Auth

#### exprsn-svr (Port 5001)
- **Role**: Business Hub
- **Provides**: Low-Code platform, CRM, ERP, Groupware
- **Dependencies**: CA, Auth, Workflow

#### exprsn-nexus (Port 3011)
- **Role**: Groups & Events
- **Provides**: Social groups, events, RSVPs
- **Dependencies**: CA, Auth, Timeline

### Layer 5: Media & Content Services

#### exprsn-filevault (Port 3007)
- **Role**: File Storage
- **Provides**: S3-compatible storage, virus scanning
- **Dependencies**: CA, Auth

#### exprsn-gallery (Port 3008)
- **Role**: Media Management
- **Provides**: Photo/video galleries, processing
- **Dependencies**: CA, Auth, FileVault

#### exprsn-live (Port 3009)
- **Role**: Live Streaming
- **Provides**: WebRTC, HLS/DASH, streaming
- **Dependencies**: CA, Auth, FileVault

#### exprsn-moderator (Port 3006)
- **Role**: Content Moderation
- **Provides**: AI moderation, review workflows
- **Dependencies**: CA, Auth

### Layer 6: Support Services

#### exprsn-herald (Port 3014)
- **Role**: Notifications
- **Provides**: Multi-channel notifications (email, SMS, push)
- **Dependencies**: CA, Auth

#### exprsn-workflow (Port 3017)
- **Role**: Automation
- **Provides**: Visual workflow designer, execution engine
- **Dependencies**: CA, Auth

#### exprsn-prefetch (Port 3005)
- **Role**: Feed Optimization
- **Provides**: Timeline prefetching, caching
- **Dependencies**: CA, Timeline

---

## Data Flow

### Example: Creating a Post on Timeline

```
1. Client → Bridge (3010)
   POST /api/timeline/posts
   Headers: Authorization: Bearer {JWT}

2. Bridge → Auth (3001)
   Validates JWT token

3. Bridge → Timeline (3004)
   Forwards request with CA token

4. Timeline → PostgreSQL
   INSERT INTO posts (...)

5. Timeline → Bull Queue
   Enqueue fan-out job
   {
     type: 'fanout_post',
     postId: '...',
     authorId: '...'
   }

6. Timeline Worker
   - Fetch followers
   - Create feed entries
   - Batch insert to DB

7. Timeline → Herald (3014)
   Trigger notifications
   {
     type: 'new_post',
     recipients: followers,
     postId: '...'
   }

8. Herald → Notification Channels
   - Email (SMTP)
   - Push (FCM/APNS)
   - In-app (WebSocket)

9. Timeline → Moderator (3006)
   Queue content check
   {
     postId: '...',
     content: '...'
   }

10. Moderator Worker
    - AI analysis
    - Flag if needed
    - Update post status

11. Timeline → Response
    {
      success: true,
      post: { id, content, ... }
    }
```

---

## Scaling Strategy

### Horizontal Scaling

Services can be scaled independently:

```
┌──────────────────────────┐
│     Load Balancer        │
└────────┬─────────────────┘
         │
    ┌────┼────┐
    │    │    │
   ┌▼┐  ┌▼┐  ┌▼┐
   │1│  │2│  │3│  Timeline instances
   └┬┘  └┬┘  └┬┘
    │    │    │
    └────┼────┘
         │
    ┌────▼────┐
    │PostgreSQL│
    │ Primary  │
    └────┬─────┘
         │
    ┌────┼────┐
   ┌▼┐  ┌▼┐  ┌▼┐
   │R│  │R│  │R│  Read replicas
   └─┘  └─┘  └─┘
```

### Vertical Scaling

Increase resources for specific services:
- **Timeline**: High compute (fan-out operations)
- **Gallery**: High I/O (media processing)
- **Database**: High memory (caching)

### Database Scaling

#### Read Replicas
```
Primary (Write) → Replica 1 (Read)
                → Replica 2 (Read)
                → Replica 3 (Read)
```

#### Sharding (Future)
```
Users A-M → Shard 1
Users N-Z → Shard 2
```

### Cache Strategy

```
Client Request
    ↓
┌───────────┐
│ Redis     │ ← Check cache
│ (L1)      │
└───────────┘
    ↓ Miss
┌───────────┐
│ PostgreSQL│ ← Query database
│           │
└───────────┘
    ↓
Update cache
```

---

## Technology Choices

### Why Node.js?
- **Asynchronous I/O**: Excellent for I/O-bound operations
- **JavaScript**: Shared language with frontend
- **npm ecosystem**: Rich package availability
- **Performance**: V8 engine optimization
- **WebSocket**: Native support for real-time

### Why PostgreSQL?
- **ACID compliance**: Data integrity
- **JSONB**: Flexible schema where needed
- **PostGIS**: Geospatial support (Atlas)
- **Full-text search**: Built-in search capabilities
- **Replication**: Read replicas, failover
- **Performance**: Excellent for OLTP workloads

### Why Redis?
- **In-memory**: Microsecond latency
- **Data structures**: Lists, sets, sorted sets
- **Pub/Sub**: Real-time messaging
- **Persistence**: RDB + AOF
- **Clustering**: Horizontal scaling
- **Use cases**: Caching, sessions, queues, rate limiting

### Why Elasticsearch? (Optional)
- **Full-text search**: Advanced search capabilities
- **Timeline search**: Fast search across millions of posts
- **Aggregations**: Analytics queries
- **Scaling**: Distributed by design

---

## Deployment Architecture

### Development
```
All services on localhost
Single PostgreSQL instance
Single Redis instance
```

### Staging
```
Docker Compose
Separate containers per service
Shared PostgreSQL + Redis
```

### Production
```
Kubernetes (or similar)
├── Service pods (replicas)
├── PostgreSQL cluster (primary + replicas)
├── Redis cluster (3+ nodes)
├── Load balancers
├── Monitoring (Prometheus + Grafana)
└── Logging (ELK stack)
```

---

## Monitoring & Observability

### Health Checks
Each service exposes `/health`:
```
GET /health
Response:
{
  "status": "healthy",
  "uptime": 3600,
  "database": "connected",
  "redis": "connected"
}
```

### Metrics
Prometheus-compatible `/metrics`:
```
# HELP http_requests_total Total HTTP requests
http_requests_total{method="GET",status="200"} 1234
```

### Logging
Structured JSON logging:
```json
{
  "level": "info",
  "timestamp": "2026-01-01T12:00:00Z",
  "service": "exprsn-timeline",
  "message": "Post created",
  "userId": "uuid",
  "postId": "uuid"
}
```

### Distributed Tracing (Future)
Request IDs propagated across services:
```
X-Request-ID: req-123456
```

---

## Security Architecture

### Defense in Depth

```
Layer 1: Network
  - Firewall rules
  - VPC isolation
  - TLS/SSL

Layer 2: Gateway
  - Rate limiting
  - IP whitelisting
  - DDoS protection

Layer 3: Authentication
  - CA tokens
  - JWT validation
  - OCSP checking

Layer 4: Authorization
  - RBAC
  - Permission checking
  - Resource-level access

Layer 5: Application
  - Input validation
  - SQL injection protection
  - XSS prevention

Layer 6: Data
  - Encryption at rest
  - Encryption in transit
  - Secure key storage
```

---

## Disaster Recovery

### Backup Strategy
- **PostgreSQL**: Daily full backup + WAL archiving
- **Redis**: RDB snapshots + AOF
- **Files**: S3 versioning + cross-region replication
- **Retention**: 30 days minimum

### Recovery Time Objective (RTO)
- **Critical services**: 1 hour
- **Non-critical services**: 4 hours

### Recovery Point Objective (RPO)
- **Database**: 15 minutes (WAL archiving)
- **Files**: Near-zero (S3 replication)

---

## Future Enhancements

### Service Mesh
- Istio or Linkerd integration
- mTLS between all services
- Advanced traffic management
- Circuit breaking

### Multi-Region
- Active-active across regions
- Geographic routing
- Data residency compliance

### GraphQL Gateway
- Unified GraphQL API
- Schema federation
- Real-time subscriptions

---

## Related Documentation

- [CA Token System](CA-Token-System)
- [Database Architecture](Database-Architecture)
- [Security Architecture](Security-Architecture)
- [Service Gaps Analysis](Service-Gaps-Analysis)

---

**Last Updated**: December 31, 2025
