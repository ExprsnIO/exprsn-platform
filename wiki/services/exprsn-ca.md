# exprsn-ca - Certificate Authority

**Port**: 3000 | **Status**: ✅ Production Ready | **Priority**: Critical (Must Start First)

## Overview

The **exprsn-ca** service is the foundational security component of the Exprsn platform. It provides a complete Certificate Authority implementation with OCSP/CRL support and the unique CA Token authentication system used across all microservices.

⚠️ **CRITICAL**: This service **MUST** start before any other service, as all inter-service authentication depends on it.

---

## Features

### Certificate Authority
- **X.509 Certificate Management**: Issue, revoke, and manage digital certificates
- **Root CA**: 4096-bit RSA key for maximum security
- **Intermediate CA**: Support for CA hierarchy
- **End Entity Certificates**: 2048-bit RSA keys for services and users

### OCSP (Online Certificate Status Protocol)
- **Port**: 2560
- **Real-time validation**: Check certificate revocation status
- **High performance**: Redis caching for OCSP responses
- **RFC 6960 compliant**: Industry-standard implementation

### CRL (Certificate Revocation List)
- **Automated generation**: Periodic CRL updates
- **HTTP distribution**: CRL available via HTTP endpoint
- **Delta CRLs**: Support for incremental updates

### CA Token System
- **RSA-SHA256-PSS Signatures**: Cryptographically secure tokens
- **Fine-grained Permissions**: read, write, update, delete, append
- **Resource-specific**: Tokens tied to specific URLs/resources
- **Flexible Expiry**: Time-based or usage-based expiration
- **Checksum Verification**: SHA-256 checksums for integrity

---

## Architecture

```
┌─────────────────────────────────────────┐
│           exprsn-ca (Port 3000)         │
├─────────────────────────────────────────┤
│                                         │
│  ┌──────────────┐    ┌──────────────┐  │
│  │ Certificate  │    │  CA Token    │  │
│  │   Manager    │    │   Manager    │  │
│  └──────┬───────┘    └──────┬───────┘  │
│         │                   │          │
│  ┌──────▼───────────────────▼───────┐  │
│  │     PostgreSQL Database          │  │
│  │  - Certificates                  │  │
│  │  - CA Tokens                     │  │
│  │  - Revocation Records            │  │
│  └──────────────────────────────────┘  │
│                                         │
│  ┌──────────────┐    ┌──────────────┐  │
│  │OCSP Responder│    │     CRL      │  │
│  │  Port 2560   │    │  Generator   │  │
│  └──────────────┘    └──────────────┘  │
└─────────────────────────────────────────┘
```

---

## API Endpoints

### Certificate Management

#### Issue Certificate
```http
POST /api/certificates/issue
Content-Type: application/json

{
  "commonName": "service.exprsn.io",
  "organizationUnit": "exprsn-timeline",
  "validityDays": 365,
  "keySize": 2048
}
```

#### Revoke Certificate
```http
POST /api/certificates/:serialNumber/revoke
Content-Type: application/json

{
  "reason": "keyCompromise"
}
```

#### Get Certificate
```http
GET /api/certificates/:serialNumber
```

### CA Token Management

#### Generate Token
```http
POST /api/tokens/generate
Content-Type: application/json

{
  "permissions": {
    "read": true,
    "write": true,
    "update": false,
    "delete": false,
    "append": false
  },
  "resource": {
    "type": "url",
    "value": "https://api.exprsn.io/timeline/*"
  },
  "expiryType": "time",
  "expiresAt": "2025-12-31T23:59:59Z"
}
```

#### Validate Token
```http
POST /api/tokens/validate
Content-Type: application/json

{
  "token": "{CA_TOKEN_JSON}",
  "resource": "https://api.exprsn.io/timeline/posts",
  "action": "write"
}
```

#### Revoke Token
```http
POST /api/tokens/:tokenId/revoke
```

### OCSP

#### OCSP Request
```http
POST /ocsp
Content-Type: application/ocsp-request

{OCSP_REQUEST_DER}
```

### CRL

#### Get CRL
```http
GET /crl
```

---

## Configuration

### Environment Variables

```bash
# Service Configuration
PORT=3000
NODE_ENV=production
SERVICE_NAME=exprsn-ca

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=exprsn_ca
DB_USER=postgres
DB_PASSWORD=secure_password
DB_SSL=true

# CA Configuration
CA_NAME=Exprsn Root CA
CA_DOMAIN=exprsn.io
CA_ROOT_KEY_SIZE=4096
CA_INTERMEDIATE_KEY_SIZE=4096
CA_ENTITY_KEY_SIZE=2048

# Certificate Validity (in days)
CA_ROOT_VALIDITY_DAYS=7300       # 20 years
CA_INTERMEDIATE_VALIDITY_DAYS=3650   # 10 years
CA_ENTITY_VALIDITY_DAYS=365      # 1 year

# OCSP Configuration
OCSP_ENABLED=true
OCSP_PORT=2560
OCSP_CACHE_TTL=3600

# CRL Configuration
CRL_ENABLED=true
CRL_UPDATE_INTERVAL=86400        # 24 hours
CRL_NEXT_UPDATE_DAYS=7

# Security
JWT_ALGORITHM=RS256
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

---

## Database Schema

### Certificates Table
```sql
CREATE TABLE certificates (
  id UUID PRIMARY KEY,
  serial_number VARCHAR(255) UNIQUE NOT NULL,
  common_name VARCHAR(255) NOT NULL,
  organization_unit VARCHAR(255),
  subject_dn TEXT NOT NULL,
  issuer_dn TEXT NOT NULL,
  not_before TIMESTAMP NOT NULL,
  not_after TIMESTAMP NOT NULL,
  key_size INTEGER NOT NULL,
  certificate_pem TEXT NOT NULL,
  private_key_pem TEXT,
  public_key_pem TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  revoked_at TIMESTAMP,
  revocation_reason VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### CA Tokens Table
```sql
CREATE TABLE ca_tokens (
  id UUID PRIMARY KEY,
  version VARCHAR(10) DEFAULT '1.0',
  permissions JSONB NOT NULL,
  resource JSONB NOT NULL,
  expiry_type VARCHAR(50) NOT NULL,
  expires_at TIMESTAMP,
  max_uses INTEGER,
  current_uses INTEGER DEFAULT 0,
  signature TEXT NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  revoked_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Security Considerations

### Key Storage
- **Private keys** are encrypted at rest using AES-256
- **Root CA private key** stored in secure hardware (HSM recommended for production)
- **Key rotation** supported every 5-7 years for intermediate CAs

### Signature Algorithm
- **Always use RSA-SHA256-PSS** (PSS padding mode)
- Never use plain RSA or deprecated algorithms (MD5, SHA-1)
- Minimum 2048-bit keys (4096-bit for root CA)

### Token Security
- Tokens include SHA-256 checksums for integrity verification
- Signatures verified before granting access
- OCSP validation prevents use of revoked certificates
- Rate limiting on token generation endpoints

### Best Practices
1. **Rotate certificates** before expiration
2. **Monitor OCSP logs** for unusual validation patterns
3. **Audit token generation** regularly
4. **Revoke immediately** on suspected compromise
5. **Use hardware security modules** (HSM) in production

---

## Monitoring

### Health Check
```bash
curl http://localhost:3000/health
```

### Metrics
- Certificate issuance rate
- OCSP request volume
- Token generation/validation rates
- Revocation frequency
- Database query performance

### Logging
```javascript
{
  "level": "info",
  "message": "Certificate issued",
  "serialNumber": "A1B2C3D4E5F6",
  "commonName": "timeline.exprsn.io",
  "validityDays": 365
}
```

---

## Troubleshooting

### Issue: OCSP Responder Not Accessible
**Solution**: Check OCSP_PORT (2560) is not blocked by firewall
```bash
lsof -i :2560
```

### Issue: Token Validation Failing
**Symptoms**: "Invalid signature" errors
**Solution**: 
1. Verify certificate not revoked
2. Check system time synchronization (NTP)
3. Verify RSA-SHA256-PSS algorithm usage

### Issue: Certificate Expiration
**Solution**: Implement automated renewal
```bash
# Check certificate expiration
openssl x509 -in cert.pem -noout -enddate

# Renew before expiration
curl -X POST http://localhost:3000/api/certificates/renew \
  -H "Content-Type: application/json" \
  -d '{"serialNumber": "SERIAL"}'
```

---

## Development

### Running Locally
```bash
cd src/exprsn-ca
npm install
npm run migrate
npm run seed
npm start
```

### Testing
```bash
npm test
npm run test:coverage
```

### Generating Test Certificates
```bash
node scripts/generate-test-cert.js
```

---

## Migration Path

### From Other CA Systems
1. Export existing certificates as PEM
2. Import into exprsn-ca database
3. Configure CRL distribution points
4. Update OCSP responder URL
5. Test validation before cutover

---

## Related Documentation

- [Security Architecture](../architecture/Security-Architecture)
- [CA Token System](../architecture/CA-Token-System)
- [exprsn-auth Integration](exprsn-auth)
- [Production Deployment](../guides/Production-Deployment)

---

## Support

For CA-specific issues:
- Check logs: `src/exprsn-ca/logs/`
- Open issue: [GitHub Issues](https://github.com/ExprsnIO/Exprsn/issues)
- Review: [OCSP RFC 6960](https://tools.ietf.org/html/rfc6960)
