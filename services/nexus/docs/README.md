# exprsn-nexus

**Groups, Communities, Events & Governance Platform**

Port: **3011** | Database: **exprsn_nexus** | Status: ✅ **Production Ready**

---

## Overview

exprsn-nexus is the social organization hub of the Exprsn platform, providing comprehensive group management, event coordination, and governance systems. It enables users to create and manage communities with flexible membership models, host events with RSVP tracking, and implement democratic governance through proposals and voting.

### Key Features

- **🏛️ Group Management** - Public/private/unlisted groups with customizable join modes
- **📅 Event System** - In-person, virtual, and hybrid events with RSVP tracking
- **🗳️ Governance & Voting** - Proposals with multiple voting methods (simple majority, supermajority, DAO, weighted)
- **📱 Calendar Integration** - iCal, CalDAV (RFC 4791), and CardDAV (RFC 6352) support
- **🔍 Discovery & Recommendations** - Group search, trending stats, and AI-powered recommendations
- **👮 Content Moderation** - Flag content, moderation cases, member suspension/banning
- **🎯 Sub-Groups** - Nested group hierarchies for better organization

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 12+
- Redis 7+ (optional, for caching)
- exprsn-ca service running (Port 3000)

### Installation

```bash
# Install dependencies
npm install

# Copy environment configuration
cp .env.example .env

# Edit .env and configure:
# - DB_NAME=exprsn_nexus
# - SERVICE_PORT=3011
# - CA_URL, HERALD_URL, etc.

# Create database
createdb exprsn_nexus

# Run migrations
npx sequelize-cli db:migrate

# Start service (development)
npm run dev

# Start service (production)
npm start
```

### Verify Installation

```bash
# Health check
curl http://localhost:3011/health

# Expected response:
# {"status":"healthy","service":"exprsn-nexus","timestamp":"..."}
```

---

## Architecture

### Service Dependencies

```
exprsn-ca (3000)          → Token validation, certificate management
exprsn-auth (3001)        → User authentication, role verification
exprsn-herald (3014)      → Event notifications, reminders
exprsn-moderator (3006)   → Advanced moderation workflows
```

### Database Schema

**18 Tables** with 88+ indexes:

- `groups` - Core group entities
- `group_memberships` - User-group relationships
- `group_roles` - Custom roles with JSONB permissions
- `member_roles` - Role assignments
- `events` - Group events (in-person/virtual/hybrid)
- `event_attendees` - RSVP tracking
- `proposals` - Governance proposals
- `proposal_votes` - Individual votes
- `join_requests` - Membership approval workflow
- `group_invites` - Invite codes with expiration
- `group_categories` - Predefined categories
- `group_trending_stats` - Trending algorithm data
- `group_recommendations` - Related groups
- `group_content_flags` - User-reported content
- `group_moderation_cases` - Moderation workflow
- `sub_groups` - Nested group support
- `sub_group_memberships` - Sub-group members

### Technology Stack

- **Framework**: Express.js 4.19+
- **Database**: PostgreSQL with Sequelize ORM
- **Cache**: Redis (ioredis)
- **Validation**: Joi schemas
- **Calendar**: ical-generator, CalDAV/CardDAV protocol support
- **Real-time**: Socket.IO (future)
- **Authentication**: CA token validation via @exprsn/shared

---

## API Documentation

### Authentication

All endpoints require valid CA tokens unless marked `[Public]`.

**Header Format**:
```
Authorization: Bearer <CA_TOKEN>
```

### Groups API

#### Create Group
```http
POST /api/groups
Content-Type: application/json

{
  "name": "Tech Enthusiasts",
  "description": "A community for technology lovers",
  "visibility": "public",
  "joinMode": "open",
  "governanceModel": "centralized",
  "category": "technology",
  "tags": ["tech", "programming", "innovation"],
  "maxMembers": 10000
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "group": {
    "id": "uuid",
    "name": "Tech Enthusiasts",
    "slug": "tech-enthusiasts",
    "creatorId": "uuid",
    "visibility": "public",
    "memberCount": 1,
    "createdAt": 1703289600000
  }
}
```

#### List Groups
```http
GET /api/groups?visibility=public&category=technology&limit=20&offset=0
```

#### Get Group Details
```http
GET /api/groups/:id
```

#### Update Group
```http
PUT /api/groups/:id
Content-Type: application/json

{
  "description": "Updated description",
  "tags": ["tech", "ai", "web3"]
}
```

#### Delete Group
```http
DELETE /api/groups/:id
```

#### Join Group
```http
POST /api/groups/:id/join
Content-Type: application/json

{
  "message": "I'd love to join this community!",
  "inviteCode": "optional-invite-code"
}
```

#### Leave Group
```http
POST /api/groups/:id/leave
```

#### Create Invite
```http
POST /api/groups/:id/invites
Content-Type: application/json

{
  "userId": "uuid-or-null",
  "message": "You're invited!",
  "maxUses": 10,
  "expiresAt": 1735862400000
}
```

**Response**:
```json
{
  "success": true,
  "invite": {
    "id": "uuid",
    "inviteCode": "abc123def456",
    "groupId": "uuid",
    "expiresAt": 1735862400000
  }
}
```

#### List Members
```http
GET /api/groups/:id/members?role=member&status=active&page=1&limit=50
```

#### Remove Member (Admin Only)
```http
DELETE /api/groups/:id/members/:userId
Content-Type: application/json

{
  "reason": "Violation of community guidelines"
}
```

---

### Events API

#### Create Event
```http
POST /api/events
Content-Type: application/json

{
  "groupId": "uuid",
  "title": "Annual Tech Meetup 2024",
  "description": "Join us for networking and talks",
  "eventType": "hybrid",
  "location": "123 Main St, San Francisco, CA",
  "virtualUrl": "https://zoom.us/j/123456789",
  "startTime": 1735862400000,
  "endTime": 1735948800000,
  "timezone": "America/Los_Angeles",
  "maxAttendees": 100,
  "rsvpDeadline": 1735776000000,
  "visibility": "public",
  "tags": ["networking", "tech", "2024"]
}
```

#### List Events
```http
GET /api/events?groupId=uuid&upcoming=true&limit=20
```

#### Get Event Details
```http
GET /api/events/:id
```

#### Update Event
```http
PUT /api/events/:id
Content-Type: application/json

{
  "description": "Updated event details",
  "maxAttendees": 150
}
```

#### Cancel Event
```http
POST /api/events/:id/cancel
Content-Type: application/json

{
  "reason": "Venue unavailable"
}
```

**Note**: This automatically notifies all attendees via exprsn-herald.

#### RSVP to Event
```http
POST /api/events/:id/rsvp
Content-Type: application/json

{
  "status": "going",
  "guestCount": 2,
  "notes": "Looking forward to it!"
}
```

**RSVP Statuses**: `going`, `maybe`, `not-going`

#### List Attendees
```http
GET /api/events/:id/attendees?status=going
```

#### Check-In Attendee
```http
POST /api/events/:id/check-in/:userId
```

#### Set Event Reminders
```http
POST /api/events/:id/reminders
Content-Type: application/json

{
  "reminders": [
    { "time": 86400000, "type": "1-day" },
    { "time": 3600000, "type": "1-hour" }
  ]
}
```

---

### Governance API

#### Create Proposal
```http
POST /api/governance/proposals
Content-Type: application/json

{
  "groupId": "uuid",
  "title": "Update Community Guidelines",
  "description": "Proposal to add new rules...",
  "proposalType": "rule-change",
  "votingMethod": "simple-majority",
  "quorumRequired": 10,
  "votingPeriod": 604800000
}
```

**Proposal Types**: `rule-change`, `role-change`, `member-action`, `general`

**Voting Methods**: `simple-majority`, `supermajority`, `unanimous`, `weighted`

#### List Proposals
```http
GET /api/governance/proposals?groupId=uuid&status=voting
```

#### Get Proposal Details
```http
GET /api/governance/proposals/:id
```

#### Vote on Proposal
```http
POST /api/governance/proposals/:id/vote
Content-Type: application/json

{
  "vote": "yes",
  "reason": "I agree with this proposal"
}
```

**Vote Options**: `yes`, `no`, `abstain`

#### List Votes
```http
GET /api/governance/proposals/:id/votes
```

#### Close Proposal
```http
POST /api/governance/proposals/:id/close
```

---

### Calendar Integration API

#### Get iCal Feed for Event
```http
GET /api/calendar/ical/event/:eventId
```

**Response**: `text/calendar` with `.ics` file

#### Get iCal Feed for Group
```http
GET /api/calendar/ical/group/:groupId
```

#### Get iCal Feed for User
```http
GET /api/calendar/ical/user/:userId
```

#### CalDAV Support (RFC 4791)
```http
PROPFIND /api/calendar/caldav/:userId
```

**Features**:
- Calendar discovery
- Sync tokens for incremental updates
- Event creation/updates via CalDAV clients

#### CardDAV Support (RFC 6352)
```http
PROPFIND /api/calendar/carddav/:groupId
```

**Features**:
- Group member contacts
- vCard format export
- Address book synchronization

---

### Discovery & Recommendations API

#### Search Groups
```http
GET /api/groups/discovery/search?q=technology&category=tech&location=san-francisco&lat=37.7749&lng=-122.4194&radius=50
```

**Query Parameters**:
- `q` - Search query (name, description)
- `category` - Filter by category
- `location` - Location name
- `lat`, `lng` - Coordinates
- `radius` - Search radius (km)
- `tags` - Comma-separated tags
- `visibility` - public/private/unlisted

#### Get Trending Groups
```http
GET /api/trending/groups?category=technology&limit=20&minScore=10
```

#### Get Group Recommendations
```http
GET /api/recommendations/groups/:groupId
```

#### Get Activity Feed
```http
GET /api/groups/discovery/activity?groupId=uuid&limit=50
```

---

### Moderation API

#### Flag Content
```http
POST /api/moderation/flags
Content-Type: application/json

{
  "groupId": "uuid",
  "contentType": "post",
  "contentId": "uuid",
  "reason": "spam",
  "description": "This is promotional spam"
}
```

**Flag Reasons**: `spam`, `harassment`, `hate-speech`, `violence`, `misinformation`, `inappropriate`, `copyright`, `other`

#### Get Moderation Queue (Moderators Only)
```http
GET /api/moderation/queue/:groupId?status=pending&priority=high
```

#### Take Moderation Action (Moderators Only)
```http
POST /api/moderation/cases/:caseId/actions
Content-Type: application/json

{
  "action": "suspend-user",
  "userId": "uuid",
  "reason": "Repeated violations",
  "duration": "7d"
}
```

**Actions**: `remove-content`, `warn-user`, `suspend-user`, `ban-user`, `dismiss`

**Duration Format**: `7d` (7 days), `24h` (24 hours), `30m` (30 minutes)

---

### Membership Management API

#### Get User's Memberships
```http
GET /api/memberships?status=active&role=owner&page=1&limit=50
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "userId": "uuid",
      "groupId": "uuid",
      "role": "owner",
      "status": "active",
      "joinedAt": 1703289600000,
      "group": {
        "id": "uuid",
        "name": "Tech Enthusiasts",
        "slug": "tech-enthusiasts",
        "avatarUrl": "https://...",
        "memberCount": 150
      }
    }
  ],
  "pagination": {
    "total": 5,
    "page": 1,
    "limit": 50,
    "pages": 1
  }
}
```

---

## Environment Variables

```bash
# Service Configuration
NODE_ENV=development
SERVICE_NAME=exprsn-nexus
SERVICE_PORT=3011
SERVICE_HOST=localhost

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=exprsn_nexus
DB_USER=exprsn_nexus_user
DB_PASSWORD=your_secure_password

# Redis (optional)
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Service URLs
CA_URL=http://localhost:3000
AUTH_SERVICE_URL=http://localhost:3001
HERALD_SERVICE_URL=http://localhost:3014
MODERATOR_SERVICE_URL=http://localhost:3006
TIMELINE_SERVICE_URL=http://localhost:3004

# Service Authentication
NEXUS_SERVICE_TOKEN=<your-service-token>
SERVICE_TOKEN=<fallback-token>

# Features
ENABLE_FEDERATION=false
ENABLE_DAO_GOVERNANCE=true
MAX_GROUP_SIZE=10000
MAX_GROUPS_PER_USER=1000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

---

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch

# Run only unit tests
npm run test:unit

# Run only integration tests
npm run test:integration
```

### Code Style

```bash
# Lint code
npm run lint

# Fix lint issues
npm run lint:fix

# Format code
npm run format
```

### Database Operations

```bash
# Run migrations
npx sequelize-cli db:migrate

# Rollback last migration
npx sequelize-cli db:migrate:undo

# Check migration status
npx sequelize-cli db:migrate:status

# Seed database
npm run seed
```

---

## Security

### Input Sanitization

All user-generated content is automatically sanitized to prevent XSS attacks:

- **Group descriptions**: Rich text with safe HTML tags only
- **Event descriptions**: Rich text sanitization
- **Proposal descriptions**: Rich text sanitization
- **Plain text fields**: All HTML stripped

**Allowed HTML Tags**: `b`, `i`, `em`, `strong`, `a`, `p`, `br`, `ul`, `ol`, `li`, `blockquote`, `code`, `pre`, `h1-h6`

### Authentication

- All endpoints require valid CA tokens
- Service-to-service calls use dedicated service tokens
- Admin endpoints require `admin` role verification
- Moderator endpoints require `moderator` or `admin` role

### Rate Limiting

- **Standard**: 100 requests per minute per IP
- **Per-user**: Implemented in routes that need stricter limits
- **Admin endpoints**: Protected with admin role checks

---

## Performance

### Caching Strategy

**Redis Cache** (when enabled):
- Token validation results: 5 minutes
- Group membership checks: 5 minutes
- Group details: 10 minutes
- Event details: 5 minutes

**Cache Keys**:
```
nexus:group:{groupId}
nexus:group:{groupId}:members
nexus:group:{groupId}:member:{userId}
nexus:event:{eventId}
```

### Database Indexes

**88 indexes** across 18 tables optimize common queries:

- Composite indexes: `(group_id, status)`, `(user_id, group_id)`
- GIN indexes: JSONB columns (metadata, governance_rules, tags)
- Unique indexes: Slugs, invite codes, membership pairs

### Recommended Database Settings

```sql
-- PostgreSQL configuration for optimal performance
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 16MB
maintenance_work_mem = 128MB
random_page_cost = 1.1  -- For SSD storage
```

---

## Troubleshooting

### Service won't start

**Check port availability**:
```bash
lsof -i :3011
# Kill process if needed
kill -9 <PID>
```

**Verify database connection**:
```bash
psql -h localhost -U exprsn_nexus_user -d exprsn_nexus -c "SELECT 1;"
```

### Migrations fail

**Check database exists**:
```bash
psql -l | grep exprsn_nexus
# If not, create it:
createdb exprsn_nexus
```

**Check Sequelize CLI config**:
```bash
# Ensure config/database.js points to correct database
cat src/config/database.js
```

### Calendar integration not working

**Verify CalDAV client configuration**:
- CalDAV URL: `http://localhost:3011/api/calendar/caldav/{userId}`
- CardDAV URL: `http://localhost:3011/api/calendar/carddav/{groupId}`
- Authentication: Use CA token as password

### Notifications not sending

**Check Herald service**:
```bash
curl http://localhost:3014/health
```

**Verify Herald URL in config**:
```bash
# Should be port 3014, not 3011
echo $HERALD_SERVICE_URL
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] Database created and migrations run
- [ ] Environment variables configured
- [ ] Redis configured and running
- [ ] exprsn-ca service accessible
- [ ] exprsn-herald service accessible
- [ ] Service token generated and configured
- [ ] Firewall rules allow port 3011
- [ ] SSL/TLS certificates configured (if using HTTPS)
- [ ] Monitoring and logging configured
- [ ] Backup strategy implemented

### Health Monitoring

```bash
# Health check endpoint
curl http://localhost:3011/health

# Expected response:
{
  "status": "healthy",
  "service": "exprsn-nexus",
  "timestamp": "2024-12-23T12:00:00.000Z",
  "uptime": 3600,
  "database": "connected",
  "redis": "connected"
}
```

### Scaling Recommendations

- **Horizontal**: Run multiple instances behind load balancer
- **Database**: Use connection pooling (default: min=2, max=10)
- **Redis**: Use Redis Cluster for high availability
- **Caching**: Increase Redis memory for better cache hit rates

---

## Contributing

### Code Standards

- ES6+ JavaScript
- 2-space indentation
- Semicolons required
- Use `const` over `let`, never `var`
- Async/await over callbacks
- Comprehensive JSDoc comments

### Commit Message Format

```
type(scope): Brief description

Longer description if needed

Breaking changes noted here
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

---

## License

MIT License - see LICENSE file for details

---

## Support

- **Documentation**: https://docs.exprsn.io/nexus
- **Issues**: https://github.com/exprsn/exprsn-nexus/issues
- **Email**: engineering@exprsn.com

---

**Version**: 1.0.0
**Last Updated**: 2024-12-23
**Maintainer**: Rick Holland (engineering@exprsn.com)
