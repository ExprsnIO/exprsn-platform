# exprsn-auth - Authentication & SSO

**Port**: 3001 | **Status**: ✅ Production Ready | **Test Coverage**: 260+ tests

## Overview

The **exprsn-auth** service provides comprehensive authentication, single sign-on (SSO), and identity management for the Exprsn platform. It supports multiple authentication protocols including OAuth2, OIDC, SAML 2.0, and integrates with the CA service for secure token management.

---

## Features

### Authentication Methods
- **Local Authentication**: Username/password with bcrypt hashing (12+ rounds)
- **OAuth2/OIDC Provider**: Full OAuth 2.0 and OpenID Connect implementation
- **SAML 2.0 SSO**: Enterprise single sign-on integration
- **Social Login**: Google, GitHub, Facebook, Twitter OAuth
- **LDAP/Active Directory**: Enterprise directory integration
- **API Keys**: Long-lived tokens for programmatic access

### Multi-Factor Authentication (MFA)
- **TOTP (Time-based)**: Google Authenticator, Authy compatible
- **SMS**: Text message verification codes
- **Email**: Email-based verification
- **Hardware Keys**: FIDO2/WebAuthn support (YubiKey, etc.)
- **Backup Codes**: Single-use recovery codes

### Identity & Access Management
- **User Management**: Create, update, delete users
- **Role-Based Access Control (RBAC)**: Flexible role and permission system
- **Organization Support**: Multi-tenant organizations
- **Group Management**: User groups with inherited permissions
- **Session Management**: Active session tracking and revocation

---

## Architecture

```
┌──────────────────────────────────────────────┐
│        exprsn-auth (Port 3001)               │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────┐ │
│  │   Local    │  │   OAuth2   │  │  SAML  │ │
│  │    Auth    │  │   /OIDC    │  │  2.0   │ │
│  └──────┬─────┘  └──────┬─────┘  └────┬───┘ │
│         │               │              │     │
│  ┌──────▼───────────────▼──────────────▼───┐ │
│  │         Session Manager                 │ │
│  │         (Redis-backed)                  │ │
│  └──────┬──────────────────────────────────┘ │
│         │                                     │
│  ┌──────▼──────────────────────────────────┐ │
│  │        PostgreSQL Database              │ │
│  │  - Users                                │ │
│  │  - Organizations                        │ │
│  │  - Roles & Permissions                  │ │
│  │  - OAuth2 Clients                       │ │
│  │  - Sessions                             │ │
│  └──────┬──────────────────────────────────┘ │
│         │                                     │
│  ┌──────▼──────────┐  ┌────────────────────┐ │
│  │  MFA Manager    │  │   CA Integration   │ │
│  └─────────────────┘  └────────────────────┘ │
└──────────────────────────────────────────────┘
```

---

## API Endpoints

### User Authentication

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "johndoe",
  "password": "SecurePassword123!",
  "firstName": "John",
  "lastName": "Doe"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "johndoe",
  "password": "SecurePassword123!",
  "mfaCode": "123456"  // If MFA enabled
}
```

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer {token}
```

### Multi-Factor Authentication

#### Enable TOTP
```http
POST /api/mfa/totp/enable
Authorization: Bearer {token}
```

Returns QR code and secret for authenticator app.

#### Verify TOTP
```http
POST /api/mfa/totp/verify
Authorization: Bearer {token}
Content-Type: application/json

{
  "code": "123456"
}
```

#### Generate Backup Codes
```http
POST /api/mfa/backup-codes/generate
Authorization: Bearer {token}
```

### OAuth2/OIDC

#### Authorization Endpoint
```http
GET /api/oauth2/authorize?
  response_type=code&
  client_id={client_id}&
  redirect_uri={redirect_uri}&
  scope=openid profile email&
  state={state}
```

#### Token Endpoint
```http
POST /api/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&
code={code}&
client_id={client_id}&
client_secret={client_secret}&
redirect_uri={redirect_uri}
```

#### UserInfo Endpoint
```http
GET /api/oauth2/userinfo
Authorization: Bearer {access_token}
```

### SAML 2.0

#### SSO Endpoint
```http
GET /api/saml/sso
```

#### Metadata
```http
GET /api/saml/metadata
```

#### Assertion Consumer Service (ACS)
```http
POST /api/saml/acs
```

---

## Configuration

### Environment Variables

```bash
# Service Configuration
PORT=3001
NODE_ENV=production
SERVICE_NAME=exprsn-auth

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=exprsn_auth
DB_USER=postgres
DB_PASSWORD=secure_password

# Session Configuration
SESSION_SECRET=generate-with-npm-run-setup
SESSION_MAX_AGE=86400000  # 24 hours
SESSION_SECURE=true  # HTTPS only
SESSION_SAME_SITE=strict

# JWT Configuration
JWT_PRIVATE_KEY=  # RSA 4096-bit
JWT_PUBLIC_KEY=
JWT_ALGORITHM=RS256
JWT_ACCESS_TOKEN_EXPIRY=3600  # 1 hour
JWT_REFRESH_TOKEN_EXPIRY=2592000  # 30 days

# OAuth2 Configuration
OAUTH2_AUTHORIZATION_CODE_LIFETIME=600  # 10 minutes
OAUTH2_ACCESS_TOKEN_LIFETIME=3600  # 1 hour
OAUTH2_REFRESH_TOKEN_LIFETIME=1209600  # 14 days

# SAML Configuration
SAML_ENABLED=true
SAML_ENTITY_ID=https://auth.exprsn.io
SAML_CALLBACK_URL=http://localhost:3001/api/saml/callback
SAML_CERT_PATH=./keys/saml-cert.pem
SAML_KEY_PATH=./keys/saml-key.pem

# Social OAuth Providers
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# MFA Configuration
MFA_TOTP_ISSUER=Exprsn
MFA_BACKUP_CODES_COUNT=10

# Email Configuration (for verification)
EMAIL_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@exprsn.io
SMTP_PASSWORD=

# SMS Configuration (for MFA)
SMS_ENABLED=false
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=
```

---

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  avatar_url TEXT,
  email_verified BOOLEAN DEFAULT FALSE,
  status VARCHAR(50) DEFAULT 'active',
  mfa_enabled BOOLEAN DEFAULT FALSE,
  mfa_secret VARCHAR(255),
  backup_codes JSONB,
  last_login_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Organizations Table
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  logo_url TEXT,
  settings JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Roles Table
```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  permissions JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Security Best Practices

### Password Requirements
- Minimum 8 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one number
- At least one special character
- Not in common password lists

### Session Security
- Secure cookies in production
- HTTP-only flag enabled
- SameSite=Strict or Lax
- Session regeneration on login
- Automatic expiration

### OAuth2 Security
- PKCE (Proof Key for Code Exchange) for public clients
- State parameter for CSRF protection
- Redirect URI validation
- Client secret rotation support

### SAML Security
- Signature verification required
- Assertion encryption recommended
- Time-bound assertions (NotBefore/NotOnOrAfter)
- Audience restriction validation

---

## Testing

The auth service has comprehensive test coverage (260+ tests):

```bash
cd src/exprsn-auth
npm test
```

### Test Categories
- **Unit Tests**: Password hashing, token generation, validation
- **Integration Tests**: Full authentication flows
- **API Tests**: All endpoints with various scenarios
- **Security Tests**: Injection attempts, brute force protection
- **MFA Tests**: All MFA methods and flows
- **OAuth2 Tests**: Full OAuth2/OIDC flows
- **SAML Tests**: SSO integration tests

---

## Integration Examples

### Using with CA Tokens

```javascript
const { serviceRequest } = require('@exprsn/shared');

// Authenticate and get user
const response = await serviceRequest({
  method: 'POST',
  url: 'http://localhost:3001/api/auth/verify',
  data: { token: userToken },
  serviceName: 'exprsn-timeline',
  resource: 'http://localhost:3001/api/auth/*',
  permissions: { read: true }
});
```

### Frontend Integration

```javascript
// Login
const response = await fetch('http://localhost:3001/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username, password }),
  credentials: 'include'
});

// Use session cookie for subsequent requests
const userData = await fetch('http://localhost:3001/api/users/me', {
  credentials: 'include'
});
```

---

## Troubleshooting

### Issue: Session Not Persisting
**Cause**: Cookie settings incorrect
**Solution**: Check SESSION_SECURE matches protocol (HTTPS)

### Issue: MFA Code Invalid
**Cause**: Time synchronization
**Solution**: Ensure server NTP is configured

### Issue: OAuth2 Redirect Mismatch
**Cause**: Incorrect redirect_uri
**Solution**: Verify client configuration matches request

---

## Related Documentation

- [Security Architecture](../architecture/Security-Architecture)
- [exprsn-ca](exprsn-ca)
- [User Management Guide](../guides/User-Management)
- [SSO Configuration](../guides/SSO-Configuration)
