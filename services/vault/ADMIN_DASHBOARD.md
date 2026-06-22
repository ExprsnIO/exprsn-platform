# Vault Administration Dashboard

## Overview

The Exprsn Vault Administration Dashboard provides comprehensive management of tokens, secrets, policies, and security analytics with AI-powered insights.

## Features

### 🔑 Token Management
- **Generate Tokens** - Create Vault access tokens with granular permissions
- **Revoke/Suspend** - Manage token lifecycle (active, revoked, expired, suspended)
- **Bulk Operations** - Revoke multiple tokens simultaneously
- **Entity Types** - Support for users, groups, organizations, services, and certificates
- **CA Integration** - Automatic CA token generation for cross-service authentication
- **IP Whitelisting** - Restrict token usage to specific IP addresses
- **Path Restrictions** - Limit token access to specific secret paths
- **Expiration & Usage Limits** - Configure token expiry dates and maximum usage counts

### 🔐 Secret Management
- **Create/Read/Update/Delete** - Full CRUD operations for secrets
- **Versioning** - Track secret history and rotation
- **Encryption** - AES-256-GCM encryption with data encryption keys (DEKs)
- **Access Control** - Fine-grained permissions per secret path

### 📋 Policy Management
- **Create Policies** - Define reusable access policies with JSONLex rules
- **Policy Types** - Secret, key, credential, and global policies
- **Enforcement Modes** - Enforcing, permissive, or audit modes
- **Priority System** - Control policy precedence
- **AI Suggestions** - AI-powered policy recommendations based on access patterns

### 📊 Analytics & AI
- **Anomaly Detection** - Detect unusual token usage patterns
  - Unusual access times
  - Rapid succession requests (potential abuse)
  - Access from new IP addresses
  - Permission escalation attempts
- **Risk Scoring** - AI-calculated risk scores (0-1) for each token
- **Access Reports** - Detailed reports with trends and insights
- **Usage Analytics** - Success rates, peak hours, top actions

### 🛠️ Maintenance
- **Purge Expired Tokens** - Remove expired tokens from database
- **Clear Redis Cache** - Flush cached tokens (use with caution)
- **Cache Statistics** - Monitor Redis cache health and performance

## Architecture

### Database Schema

#### VaultToken
```javascript
{
  id: UUID,
  tokenId: "vt_...",          // Public identifier
  tokenHash: "sha256...",     // SHA-256 hash of actual token
  displayName: string,
  entityType: enum,           // user, group, organization, service, certificate
  entityId: string,
  permissions: JSONB,         // { secrets: { read: true }, keys: { write: false } }
  pathPrefixes: string[],     // ["/app1/*", "/shared/*"]
  ipWhitelist: string[],      // ["192.168.1.1", "10.0.0.*"]
  expiresAt: timestamp,
  maxUses: integer,
  usageCount: integer,
  status: enum,               // active, revoked, expired, suspended
  caTokenId: string,          // Associated CA token ID
  riskScore: float,           // AI-calculated risk (0-1)
  lastUsedAt: timestamp,
  lastUsedFrom: string        // Last IP address
}
```

#### AccessPolicy
```javascript
{
  id: UUID,
  name: string,
  policyType: enum,           // secret, key, credential, global
  rules: JSONB,               // JSONLex policy rules
  priority: integer,
  enforcementMode: enum,      // enforcing, permissive, audit
  aiSuggested: boolean,
  aiConfidence: float,
  status: enum                // active, draft, deprecated
}
```

#### TokenBinding
```javascript
{
  id: UUID,
  tokenId: UUID,              // FK to VaultToken
  policyId: UUID,             // FK to AccessPolicy
  permissions: JSONB,         // Override permissions
  boundAt: timestamp,
  status: enum                // active, inactive
}
```

### Services

#### TokenService (`services/tokenService.js`)
- Token generation with CA integration
- Token validation with Redis caching
- Revocation with Herald/Bridge notifications
- Expiration and cleanup
- Usage tracking

#### RedisCache (`services/redisCache.js`)
- Token caching with automatic TTL
- Expired token purging
- Cache statistics
- Fallback to database on cache miss

#### AIPolicyService (`services/aiPolicyService.js`)
- Access pattern analysis
- Policy suggestions based on:
  - Time clustering (business hours detection)
  - Common path usage
  - Consistent IP patterns
  - Usage rate analysis
- Anomaly detection:
  - Unusual access times
  - Rapid requests (abuse detection)
  - New IP addresses
  - Permission escalation attempts
- Access reporting with AI insights

### API Endpoints

#### Token Management
```
POST   /api/admin/tokens/generate       - Generate new token
GET    /api/admin/tokens                - List tokens
GET    /api/admin/tokens/:tokenId       - Get token details
POST   /api/admin/tokens/:tokenId/revoke - Revoke token
POST   /api/admin/tokens/:tokenId/suspend - Suspend token
POST   /api/admin/tokens/:tokenId/reactivate - Reactivate token
POST   /api/admin/tokens/bulk/revoke    - Bulk revoke tokens
```

#### Policy Management
```
POST   /api/admin/policies              - Create policy
GET    /api/admin/policies              - List policies
GET    /api/admin/policies/:policyId    - Get policy details
PUT    /api/admin/policies/:policyId    - Update policy
DELETE /api/admin/policies/:policyId    - Delete policy
POST   /api/admin/policies/suggest      - Get AI policy suggestions
```

#### Analytics & Reports
```
GET    /api/admin/dashboard/stats       - Dashboard statistics
POST   /api/admin/reports/access        - Generate access report
GET    /api/admin/tokens/:tokenId/anomalies - Detect anomalies
```

#### Maintenance
```
POST   /api/admin/maintenance/purge     - Purge expired tokens
POST   /api/admin/maintenance/cache/clear - Clear Redis cache
```

## Token Generation Flow

1. **Generate Token Value** - `hvs.{base64url-random-bytes}`
2. **Create Token Record** - Store hash, permissions, metadata
3. **CA Integration** (optional) - Generate associated CA token
4. **Calculate Risk Score** - AI-based initial risk assessment
5. **Bind Policies** - Link to access policies if specified
6. **Cache in Redis** - Fast validation for subsequent requests
7. **Return Token** - **ONE-TIME DISPLAY** (never shown again)

## Token Validation Flow

1. **Check Redis Cache** - Fast path for cached tokens
2. **Validate Hash** - SHA-256 hash comparison
3. **Check Status** - Active, revoked, expired, suspended
4. **Check Expiration** - Timestamp validation
5. **Check Usage Limit** - Compare against maxUses
6. **Validate Context** - IP whitelist, path prefixes
7. **Update Usage** - Increment usageCount, update lastUsedAt
8. **Return Result** - Valid/invalid with permissions

## AI Features

### Risk Scoring Algorithm
```javascript
score = 0.0
score += permissionCount * 0.1    // More permissions = higher risk
score += wildcardPaths ? 0.2 : 0  // Wildcard paths = higher risk
score -= hasIPWhitelist ? 0.1 : 0 // IP whitelist = lower risk
score += isService ? 0.15 : 0     // Service tokens = higher risk
riskScore = clamp(score, 0, 1)
```

### Anomaly Detection

**Unusual Access Times**
- Detects access outside normal business hours (9am-5pm)
- Severity: Medium

**Rapid Requests**
- >10 requests within 10 seconds
- Severity: High (potential abuse)

**New IP Addresses**
- Access from IPs not seen in previous 7 days
- Severity: Medium

**Permission Escalation**
- >5 failed attempts with permission errors
- Severity: Critical

### Policy Suggestions

**Time-based Restrictions**
- Suggests if 80%+ of access occurs during specific hours
- Confidence: Based on access pattern consistency

**Path-based Restrictions**
- Suggests limiting to top 5 most-accessed paths
- Confidence: 0.8

**IP Whitelisting**
- Suggests if 80%+ of access from consistent IPs
- Confidence: 0.85

**Rate Limiting**
- Suggests based on average requests per hour
- Limit: avgRequestsPerHour * 1.5
- Confidence: 0.9

## Integration

### CA Service Integration
```javascript
// Generate CA token on Vault token creation
const caToken = await serviceRequest({
  method: 'POST',
  url: 'http://localhost:3000/api/tokens/generate',
  data: {
    resource: pathPrefixes.join(','),
    permissions: permissions,
    expiresAt: expiresAt
  },
  serviceName: 'exprsn-vault'
});
```

### Herald Notifications
```javascript
// Notify on token revocation
await serviceRequest({
  method: 'POST',
  url: 'http://localhost:3014/api/notifications/send',
  data: {
    type: 'vault_token_revoked',
    recipient: token.entityId,
    data: { tokenId, reason, revokedBy }
  }
});
```

### Bridge Events
```javascript
// Publish revocation event
await serviceRequest({
  method: 'POST',
  url: 'http://localhost:3003/api/events/publish',
  data: {
    topic: 'vault.token.revoked',
    payload: { tokenId, entityType, entityId, reason }
  }
});
```

## Security Considerations

### Token Storage
- **Actual token value**: NEVER stored (only SHA-256 hash)
- **Displayed once**: On generation only
- **Hash comparison**: Constant-time to prevent timing attacks

### Redis Caching
- **Auto-expiration**: TTL matches token expiresAt
- **Purge on revoke**: Immediate removal from cache
- **Graceful degradation**: Falls back to database on cache miss

### Permission Model
```javascript
permissions: {
  secrets: { read: true, write: false, delete: false },
  keys: { read: true, write: false },
  credentials: { read: true },
  admin: false  // Admin dashboard access
}
```

### Rate Limiting
- **Admin endpoints**: 100 requests / 15 minutes
- **Strict operations**: 10-20 requests / 15 minutes
- **Read operations**: 100 requests / minute
- **Crypto operations**: 50 requests / minute

## Usage Examples

### Generate User Token
```javascript
POST /api/admin/tokens/generate
{
  "displayName": "John's Development Token",
  "entityType": "user",
  "entityId": "user_12345",
  "permissions": {
    "secrets": { "read": true, "write": true }
  },
  "pathPrefixes": ["/dev/*"],
  "expiresAt": "2025-12-31T23:59:59Z",
  "caIntegration": true
}
```

### Create Policy
```javascript
POST /api/admin/policies
{
  "name": "Read-Only Production",
  "policyType": "secret",
  "rules": {
    "pathPattern": "/prod/*",
    "permissions": { "read": true },
    "ipWhitelist": ["10.0.1.0/24"]
  },
  "priority": 100,
  "enforcementMode": "enforcing"
}
```

### Get AI Suggestions
```javascript
POST /api/admin/policies/suggest
{
  "entityType": "user",
  "entityId": "user_12345"
}

// Response
[
  {
    "name": "Time-based access for user_12345",
    "policyType": "global",
    "rules": {
      "timeRestriction": {
        "allowedHours": [9, 10, 11, 12, 13, 14, 15, 16, 17],
        "allowedDays": [1, 2, 3, 4, 5]
      }
    },
    "aiSuggested": true,
    "aiConfidence": 0.87
  }
]
```

## Accessing the Dashboard

1. Navigate to `http://localhost:3013/admin`
2. Authenticate with Vault admin credentials
3. View real-time statistics on the Dashboard
4. Manage tokens, secrets, and policies
5. Review AI-powered insights and anomalies
6. Perform maintenance operations

## Environment Variables

```bash
# Vault Configuration
VAULT_PORT=3013
DB_NAME=exprsn_vault

# Redis Configuration
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# Service Integration
CA_SERVICE_URL=http://localhost:3000
HERALD_SERVICE_URL=http://localhost:3014
BRIDGE_SERVICE_URL=http://localhost:3003
```

## Database Migrations

Run migrations to create the token management tables:

```bash
cd src/exprsn-vault
npx sequelize-cli db:migrate
```

This creates:
- `vault_tokens` - Token records
- `access_policies` - Policy definitions
- `token_bindings` - Token-policy relationships

## Performance Considerations

### Redis Caching
- **Cache hit rate**: ~95% for active tokens
- **Validation latency**: <5ms (cached) vs ~50ms (database)
- **Memory usage**: ~1KB per cached token

### Database Indexing
- `token_id` (unique)
- `token_hash`
- `entity_type, entity_id` (composite)
- `status`
- `expires_at`

### Batch Operations
- Bulk revocation processes tokens in parallel
- Purge operations use batched queries
- AI analysis uses cached aggregations

## Monitoring & Alerts

### Metrics to Monitor
- Token generation rate
- Validation latency
- Cache hit rate
- High-risk token count
- Anomaly detection rate

### Recommended Alerts
- High-risk tokens > 10: Investigate
- Failed validations > 100/min: Potential attack
- Cache hit rate < 80%: Redis issues
- Critical anomalies detected: Immediate review

## Future Enhancements

- [ ] Hardware security module (HSM) integration
- [ ] Multi-region token replication
- [ ] Advanced ML models for anomaly detection
- [ ] Automated policy enforcement based on AI suggestions
- [ ] WebAuthn/FIDO2 support for admin authentication
- [ ] Blockchain-based immutable audit trail
- [ ] GraphQL API for complex queries
- [ ] Real-time WebSocket updates for dashboard

---

**Security Notice**: The Vault Administration Dashboard provides powerful capabilities. Ensure proper authentication, authorization, and audit logging are in place before deploying to production.
