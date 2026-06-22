# Vault Admin Dashboard - Quick Start Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 7+ (optional but recommended)
- Exprsn CA service running on port 3000

## Setup

### 1. Install Dependencies

```bash
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-vault
npm install
```

### 2. Configure Environment

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env`:

```bash
# Server
NODE_ENV=development
VAULT_PORT=3013

# Database
DB_NAME=exprsn_vault
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432

# Redis (for token caching)
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# Master encryption key (generate with: openssl rand -hex 32)
VAULT_MASTER_KEY=your_32_byte_hex_key_here
```

### 3. Create Database

```bash
# Create database
createdb exprsn_vault

# Or using psql
psql -U postgres -c "CREATE DATABASE exprsn_vault;"
```

### 4. Run Migrations

```bash
npx sequelize-cli db:migrate
```

This creates:
- ✓ Encryption keys table
- ✓ Secrets table
- ✓ Leases table
- ✓ Audit logs table
- ✓ **Vault tokens table** (NEW)
- ✓ **Access policies table** (NEW)
- ✓ **Token bindings table** (NEW)

### 5. Start Redis (if using caching)

```bash
# macOS with Homebrew
brew services start redis

# Linux
sudo systemctl start redis

# Or run directly
redis-server
```

### 6. Start the Vault Service

```bash
# Development mode (with hot-reload)
npm run dev

# Production mode
npm start
```

The service will start on `http://localhost:3013`

## Accessing the Admin Dashboard

1. **Navigate to**: `http://localhost:3013/admin`

2. **Authenticate**: Use a CA token with admin permissions

3. **Explore features**:
   - **Dashboard**: View statistics and recent activity
   - **Tokens**: Manage Vault access tokens
   - **Secrets**: Create and manage encrypted secrets
   - **Policies**: Define access policies
   - **Analytics**: View AI-powered insights
   - **Maintenance**: Perform system maintenance

## Common Tasks

### Generate Your First Token

1. Click **"Tokens"** in the sidebar
2. Click **"Generate New Token"** button
3. Fill in the form:
   - **Display Name**: "My Development Token"
   - **Entity Type**: User
   - **Entity ID**: your_user_id
   - **Permissions**: Check "Read" and "Write"
   - **Path Prefixes**: `/dev/*`
4. Click **"Generate Token"**
5. **IMPORTANT**: Copy the token value immediately (shown only once!)

### Create a Secret

```bash
# Using curl with your generated token
curl -X POST http://localhost:3013/api/secrets/myapp/database \
  -H "Authorization: Bearer hvs.YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "db_password",
    "value": "super_secret_password_123"
  }'
```

### Create an Access Policy

1. Click **"Policies"** in the sidebar
2. Click **"Create Policy"** button
3. Configure:
   - **Name**: "Production Read-Only"
   - **Type**: Secret
   - **Rules**: `{ "pathPattern": "/prod/*", "permissions": { "read": true } }`
   - **Priority**: 100
   - **Enforcement Mode**: Enforcing
4. Click **"Create"**

### View AI Insights

1. Click **"Analytics & AI"** in the sidebar
2. Select a date range for reports
3. Click **"Generate"** to see:
   - Total access count
   - Success rate
   - Usage trends
   - Top actions
   - Peak hours

### Revoke a Token

1. Go to **"Tokens"** view
2. Find the token to revoke
3. Click the **red X icon** (Revoke button)
4. Confirm and provide a reason
5. Token is immediately invalidated

## Testing the API

### Health Check

```bash
curl http://localhost:3013/health
```

**Response**:
```json
{
  "status": "healthy",
  "service": "exprsn-vault",
  "version": "1.0.0",
  "timestamp": "2025-12-25T10:30:00.000Z"
}
```

### Generate Token via API

```bash
curl -X POST http://localhost:3013/api/admin/tokens/generate \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "API Test Token",
    "entityType": "service",
    "entityId": "api_service_1",
    "permissions": {
      "secrets": { "read": true }
    },
    "pathPrefixes": ["/api/*"],
    "expiresAt": "2026-12-31T23:59:59Z",
    "caIntegration": true
  }'
```

### List Tokens

```bash
curl http://localhost:3013/api/admin/tokens \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Get AI Policy Suggestions

```bash
curl -X POST http://localhost:3013/api/admin/policies/suggest \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "entityType": "user",
    "entityId": "user_12345"
  }'
```

## Troubleshooting

### Redis Connection Issues

If you see "Redis connection failed" warnings:

1. Check Redis is running: `redis-cli ping` (should return "PONG")
2. Verify Redis host/port in `.env`
3. Set `REDIS_ENABLED=false` to disable caching (not recommended for production)

### Database Connection Errors

```bash
# Test PostgreSQL connection
psql -U postgres -d exprsn_vault -c "SELECT 1;"

# Check credentials in .env match PostgreSQL settings
```

### Token Validation Failing

Common issues:
- Token expired: Check `expiresAt` timestamp
- Token revoked: Check status in database
- IP not whitelisted: Verify `ipWhitelist` settings
- Path not allowed: Check `pathPrefixes`

### Migration Issues

```bash
# Check migration status
npx sequelize-cli db:migrate:status

# Rollback last migration
npx sequelize-cli db:migrate:undo

# Re-run migrations
npx sequelize-cli db:migrate
```

## Performance Tips

### Enable Redis Caching
- Reduces token validation latency from ~50ms to <5ms
- Cache hit rate typically >95% for active tokens
- Automatic TTL based on token expiration

### Database Indexing
All critical indexes are created by migrations:
- `token_id` (unique)
- `token_hash`
- `entity_type, entity_id`
- `status`
- `expires_at`

### Batch Operations
- Use bulk revoke for multiple tokens
- Schedule purge operations during off-peak hours
- Configure appropriate rate limits

## Security Best Practices

### Token Generation
- Use strong, random entity IDs
- Set appropriate expiration dates
- Enable CA integration for cross-service auth
- Use IP whitelisting when possible
- Limit path prefixes to minimum required

### Secret Management
- Always encrypt secrets (automatic with Vault)
- Rotate secrets regularly
- Use different encryption keys for different environments
- Enable audit logging

### Access Control
- Follow principle of least privilege
- Use policies for reusable access patterns
- Monitor high-risk tokens
- Review AI anomaly alerts promptly

### Production Deployment
- Set `NODE_ENV=production`
- Generate a strong `VAULT_MASTER_KEY`
- Enable Redis for performance
- Configure proper rate limits
- Enable audit logging
- Use TLS/HTTPS
- Implement firewall rules

## Next Steps

1. **Explore the Full Documentation**: See `ADMIN_DASHBOARD.md`
2. **Set Up Monitoring**: Track metrics and alerts
3. **Configure Policies**: Create access policies for your use cases
4. **Enable Integrations**: Connect with CA, Herald, and Bridge services
5. **Review AI Insights**: Use anomaly detection and policy suggestions

## Support

For issues or questions:
- Check the logs: Look for errors in console output
- Review the documentation: `ADMIN_DASHBOARD.md`
- Examine audit logs: Query the `audit_logs` table
- Enable debug logging: Set `LOG_LEVEL=debug` in `.env`

---

**Congratulations!** 🎉 You now have a fully functional Vault Administration Dashboard with AI-powered security features!
