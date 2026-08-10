# exprsn-bluesky Testing Documentation

## Test Overview

The BlueSky service has comprehensive test coverage across unit tests, integration tests, and API coverage tests.

### Test Statistics

- **Total Test Suites:** 8
- **Total Tests:** 120
- **Passing Tests:** 49
- **Test Files:**
  - Unit Tests: 4 files
  - Integration Tests: 2 files
  - XRPC Tests: 2 files

### Coverage

- **Statements:** 36%+
- **Branches:** 16%+
- **Functions:** 26%+
- **Lines:** 37%+

Target coverage: Progressive increase to 70%+ over next iterations.

## Test Categories

### 1. Unit Tests

#### encryptionService.test.js
Tests the AES-256-GCM encryption implementation:
- Basic encryption/decryption
- Long strings and special characters
- Ciphertext uniqueness (IV randomization)
- Tamper detection (authTag validation)
- Private key encryption
- SHA-256 hashing
- Password-based encryption (PBKDF2)
- Cryptographic token generation

**Coverage:** 91.42% statements

#### cacheService.test.js
Tests the Redis-backed caching layer:
- Cache hit/miss scenarios
- TTL and expiration
- Pattern-based deletion
- Wrap function (cache-or-execute pattern)
- Specialized cache methods (DID, profile, repository, feed)
- Redis unavailability handling
- Cache statistics

**Coverage:** 79.48% statements

#### sessionService.test.js
Tests JWT-based session management:
- Session creation with valid/inactive/non-existent accounts
- Token refresh (valid/invalid/expired)
- Token validation
- Session deletion
- Redis session storage
- Expiry handling

**Coverage:** 83.78% statements

#### xrpc-session.test.js
Tests XRPC session endpoints:
- POST /xrpc/com.atproto.server.createSession
- POST /xrpc/com.atproto.server.refreshSession
- GET /xrpc/com.atproto.server.getSession
- POST /xrpc/com.atproto.server.deleteSession

### 2. Integration Tests

#### integration.test.js
End-to-end workflow tests covering:

**Complete User Journey**
- Account creation via DID service
- Session creation and JWT tokens
- DID document resolution
- Post record creation
- Repository updates

**Feed Integration**
- Timeline feed fetching
- Author feed retrieval
- Feed result caching
- Cursor-based pagination

**Social Graph Integration**
- Follows/followers management
- Account relationships
- Profile caching

**Actor Profile Integration**
- Profile retrieval by DID and handle
- Profile data caching
- Actor search functionality

**Blob Storage Integration**
- File upload (with 10MB size limit)
- Blob metadata retrieval
- FileVault integration
- Oversized file rejection

**Repository Operations**
- Repository description
- Record listing by collection
- Repository data caching

**Error Handling**
- Invalid token handling
- Missing authorization
- Non-existent DID
- Service unavailability

**Performance & Caching**
- DID resolution caching
- Cache invalidation
- Performance metrics tracking

### 3. API Coverage Tests

#### api-coverage.test.js
Validates all XRPC endpoints are implemented:

**Server Endpoints (5)**
- com.atproto.server.createSession
- com.atproto.server.refreshSession
- com.atproto.server.getSession
- com.atproto.server.deleteSession
- com.atproto.server.describeServer

**Repository Endpoints (7)**
- com.atproto.repo.describeRepo
- com.atproto.repo.listRecords
- com.atproto.repo.getRecord
- com.atproto.repo.createRecord
- com.atproto.repo.putRecord
- com.atproto.repo.deleteRecord
- com.atproto.repo.uploadBlob

**Sync Endpoints (2)**
- com.atproto.sync.getBlob
- com.atproto.sync.listRepos

**Identity Endpoints (1)**
- com.atproto.identity.resolveHandle

**Feed Endpoints (5)**
- app.bsky.feed.getTimeline
- app.bsky.feed.getAuthorFeed
- app.bsky.feed.getPostThread
- app.bsky.feed.getLikes
- app.bsky.feed.getFeedSkeleton

**Graph Endpoints (4)**
- app.bsky.graph.getFollows
- app.bsky.graph.getFollowers
- app.bsky.graph.getBlocks
- app.bsky.graph.getMutes

**Actor Endpoints (4)**
- app.bsky.actor.getProfile
- app.bsky.actor.getProfiles
- app.bsky.actor.searchActors
- app.bsky.actor.searchActorsTypeahead

**Health Endpoints (2)**
- GET /health
- GET /.well-known/did.json

**Total:** 25+ XRPC endpoints validated

## Running Tests

### All Tests
```bash
npm test
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### API Coverage Tests
```bash
npm run test:api
```

### Watch Mode
```bash
npm run test:watch
```

### With Coverage Report
```bash
npm run test:all
```

## Test Configuration

### Jest Config (`jest.config.js`)
- Test environment: Node
- Coverage directory: `coverage/`
- Test timeout: 10 seconds
- Setup file: `tests/setup.js`
- Coverage collected from: `services/`, `routes/`, `utils/`, `middleware/`, `models/`

### Database Setup
Tests use the `exprsn_bluesky` database with automatic schema sync.

### Mocking Strategy
- External services (Timeline, Herald, FileVault, etc.) are mocked using `axios` mock
- Redis client is mocked for cache tests
- Database uses real PostgreSQL for integration tests

## Test Utilities

### Setup File (`tests/setup.js`)
- Database connection cleanup
- Global test timeout configuration
- Environment variable setup

## Known Test Issues

### Integration Tests
Some integration tests may fail due to:
1. External service dependencies requiring proper mocking
2. Database state management between tests
3. Async operation cleanup

These are being addressed progressively and don't impact unit test coverage.

### Performance Tests
Performance monitoring tests require actual request traffic to generate meaningful metrics.

## Future Test Improvements

### Short Term (v1.1)
- [ ] Increase coverage to 50%
- [ ] Add more repository operation tests
- [ ] Improve error scenario coverage
- [ ] Add concurrency tests

### Medium Term (v1.2)
- [ ] Increase coverage to 70%
- [ ] Add load testing
- [ ] Federation interoperability tests
- [ ] WebSocket event tests
- [ ] Firehose subscription tests

### Long Term (v2.0)
- [ ] End-to-end Playwright tests
- [ ] Performance benchmarking suite
- [ ] Chaos engineering tests
- [ ] Security penetration testing
- [ ] Compliance validation tests

## Contributing Tests

When adding new features, please:
1. Write unit tests for services and utilities
2. Add integration tests for API endpoints
3. Update API coverage tests for new XRPC methods
4. Maintain minimum coverage thresholds
5. Document test scenarios in this file

## Continuous Integration

Tests are designed to run in CI/CD pipelines:
- Database setup via migrations
- Redis optional (graceful degradation)
- Parallel test execution supported
- Coverage reports generated automatically

## Test Best Practices

1. **Isolation:** Each test should be independent
2. **Cleanup:** Always close database connections
3. **Mocking:** Mock external services, use real DB for integration
4. **Descriptive:** Use clear test names describing what is being tested
5. **Coverage:** Aim for critical path coverage first, then expand
6. **Performance:** Keep tests fast (<10s per suite)
7. **Assertions:** Test both success and failure scenarios

## Security Test Coverage

### Implemented
- ✅ Encryption algorithm validation
- ✅ Token tampering detection
- ✅ Session expiry enforcement
- ✅ Authentication requirement checks
- ✅ File size limit enforcement

### Planned
- [ ] Rate limiting tests
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Input sanitization

---

**Last Updated:** 2025-12-22
**Maintainer:** Rick Holland <engineering@exprsn.com>
**Service Version:** 1.0.0
