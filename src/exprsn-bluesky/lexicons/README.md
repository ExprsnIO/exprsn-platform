# Exprsn AT Protocol Lexicons

## Overview

This directory contains AT Protocol lexicon definitions for all Exprsn services, enabling seamless integration with exprsn-bluesky (Personal Data Server). These lexicons define custom record types, XRPC methods, and data structures specific to the Exprsn ecosystem.

## What are Lexicons?

Lexicons are JSON schema definitions that describe:
- **Record Types**: Data structures stored in AT Protocol repositories
- **XRPC Methods**: API endpoints (queries and procedures)
- **Data Validation**: Type constraints, formats, and validation rules
- **Interoperability**: Standard formats for cross-service communication

## Namespace

All Exprsn lexicons use the `io.exprsn` namespace, organized by service:

```
io.exprsn.timeline.*    - Social feed and interactions
io.exprsn.spark.*       - Real-time messaging
io.exprsn.filevault.*   - Media storage
io.exprsn.herald.*      - Notifications
io.exprsn.nexus.*       - Groups and events
io.exprsn.moderator.*   - Content moderation
io.exprsn.workflow.*    - Automation
io.exprsn.forge.*       - CRM/Business
```

---

## Lexicon Catalog

### 1. Timeline Service (io.exprsn.timeline)

**Purpose:** Social feed, posts, likes, and reposts

#### Record Types

**io.exprsn.timeline.post**
- Timeline post with rich text, facets, and embeds
- Supports replies, threads, and visibility controls
- Max 5000 characters
- Tags and labels support
- File: `io/exprsn/timeline/post.json`

**io.exprsn.timeline.like**
- Like record referencing a post
- Simple subject + timestamp
- File: `io/exprsn/timeline/like.json`

**io.exprsn.timeline.repost**
- Repost/share record
- Subject reference with timestamp
- File: `io/exprsn/timeline/repost.json`

**io.exprsn.timeline.embed**
- Embeddable content types:
  - Images (up to 4, with alt text)
  - Video (HLS transcoding)
  - External links (with preview)
  - Quoted posts (record embeds)
- File: `io/exprsn/timeline/embed.json`

#### XRPC Methods

**io.exprsn.timeline.getFeed** (Query)
- Get user timeline with pagination
- Algorithm support (chronological, algorithmic, following)
- Cursor-based pagination
- Returns feedViewPost array
- File: `io/exprsn/timeline/getFeed.json`

#### Usage Example

```typescript
// Create a post
await agent.com.atproto.repo.createRecord({
  repo: did,
  collection: 'io.exprsn.timeline.post',
  record: {
    text: 'Hello from Exprsn!',
    visibility: 'public',
    createdAt: new Date().toISOString()
  }
});

// Get timeline feed
const feed = await agent.io.exprsn.timeline.getFeed({
  algorithm: 'chronological',
  limit: 50
});
```

---

### 2. Spark Messaging (io.exprsn.spark)

**Purpose:** Real-time direct messaging with E2EE

#### Record Types

**io.exprsn.spark.message**
- Direct message with multiple content types:
  - Text (with rich text facets)
  - Media (images, video, audio)
  - Encrypted (E2EE with algorithm specification)
- Reactions support (emoji)
- Reply threading
- Read receipts
- File: `io/exprsn/spark/message.json`

**io.exprsn.spark.conversation**
- Conversation/chat record
- 2-50 participants (1:1 or group)
- Group name and avatar for groups
- E2EE flag
- Conversation settings (mute, pin, color)
- File: `io/exprsn/spark/conversation.json`

#### XRPC Methods

**io.exprsn.spark.getConversations** (Query)
- Get user's conversation list
- Includes last message preview
- Unread count per conversation
- Pagination support
- File: `io/exprsn/spark/getConversations.json`

**io.exprsn.spark.sendMessage** (Procedure)
- Send message to conversation
- Supports all content types
- Reply threading
- Returns URI and CID
- File: `io/exprsn/spark/sendMessage.json`

#### Usage Example

```typescript
// Create conversation
await agent.com.atproto.repo.createRecord({
  repo: did,
  collection: 'io.exprsn.spark.conversation',
  record: {
    participants: [did1, did2],
    isGroup: false,
    isEncrypted: true,
    createdAt: new Date().toISOString()
  }
});

// Send message
await agent.io.exprsn.spark.sendMessage({
  conversationId: 'abc123',
  content: {
    type: 'text',
    text: 'Hello!'
  }
});
```

---

### 3. FileVault Media (io.exprsn.filevault)

**Purpose:** Media storage with CDN integration

#### Record Types

**io.exprsn.filevault.media**
- Media file record with blob reference
- Supports: images, video, audio, PDF
- Max 100MB per file
- Storage backend selection (local, S3, IPFS)
- Metadata: dimensions, duration, size, codec
- Visibility controls
- Alt text for accessibility
- File: `io/exprsn/filevault/media.json`

#### Usage Example

```typescript
// Upload media
const blobResponse = await agent.com.atproto.repo.uploadBlob(fileData);

// Create media record
await agent.com.atproto.repo.createRecord({
  repo: did,
  collection: 'io.exprsn.filevault.media',
  record: {
    blob: blobResponse.blob,
    mimeType: 'image/jpeg',
    fileName: 'photo.jpg',
    alt: 'Sunset over mountains',
    storage: 's3',
    visibility: 'public',
    createdAt: new Date().toISOString()
  }
});
```

---

### 4. Herald Notifications (io.exprsn.herald)

**Purpose:** Multi-channel notification delivery

#### Record Types

**io.exprsn.herald.notification**
- Notification record with rich content
- Types: like, repost, reply, mention, follow, message, groupInvite, eventReminder, system
- Multi-channel delivery: inApp, push, email, SMS, webhook
- Priority levels: low, normal, high, urgent
- Read status tracking
- Actor and subject references
- Metadata for custom data
- File: `io/exprsn/herald/notification.json`

#### Usage Example

```typescript
// Create notification
await agent.com.atproto.repo.createRecord({
  repo: did,
  collection: 'io.exprsn.herald.notification',
  record: {
    recipient: targetDid,
    type: 'like',
    content: {
      title: 'New Like',
      body: '@username liked your post',
      actionUrl: 'at://did:web:exprsn.io:user/io.exprsn.timeline.post/abc'
    },
    actor: likerDid,
    subject: postUri,
    channels: ['inApp', 'push'],
    priority: 'normal',
    isRead: false,
    createdAt: new Date().toISOString()
  }
});
```

---

### 5. Nexus Groups & Events (io.exprsn.nexus)

**Purpose:** Community groups and event management

#### Record Types

**io.exprsn.nexus.group**
- Group/community record
- Visibility: public, private, secret
- Membership types: open, approval, invite-only
- Avatar and banner support
- Group rules (up to 20)
- Tags for discoverability
- Member count and viewer state
- File: `io/exprsn/nexus/group.json`

**io.exprsn.nexus.event**
- Event record with CalDAV support
- Location types: physical, virtual, hybrid
- Recurrence rules (iCal RRULE format)
- Timezone support
- Max attendees and approval settings
- RSVP tracking (going, maybe, notGoing)
- Group association
- File: `io/exprsn/nexus/event.json`

#### Usage Example

```typescript
// Create group
await agent.com.atproto.repo.createRecord({
  repo: did,
  collection: 'io.exprsn.nexus.group',
  record: {
    name: 'AT Protocol Developers',
    description: 'Community for AT Protocol development',
    visibility: 'public',
    membershipType: 'open',
    tags: ['atproto', 'development', 'community'],
    createdAt: new Date().toISOString()
  }
});

// Create event
await agent.com.atproto.repo.createRecord({
  repo: did,
  collection: 'io.exprsn.nexus.event',
  record: {
    title: 'AT Protocol Workshop',
    description: 'Learn about lexicons and XRPC',
    location: {
      type: 'virtual',
      virtualUrl: 'https://meet.exprsn.io/workshop'
    },
    startTime: '2025-01-15T18:00:00Z',
    endTime: '2025-01-15T20:00:00Z',
    timezone: 'America/Los_Angeles',
    visibility: 'public',
    createdAt: new Date().toISOString()
  }
});
```

---

### 6. Moderator Content Moderation (io.exprsn.moderator)

**Purpose:** Content moderation and safety tools

#### Record Types

**io.exprsn.moderator.report**
- Content moderation report
- Reason types: spam, violation, misleading, sexual, rude, other
- Subject: repo or record reference
- Moderation actions: takedown, flag, acknowledge, escalate, ignore
- Label system for content warnings
- Moderator attribution
- File: `io/exprsn/moderator/report.json`

#### Usage Example

```typescript
// Submit report
await agent.com.atproto.repo.createRecord({
  repo: did,
  collection: 'io.exprsn.moderator.report',
  record: {
    subject: {
      uri: 'at://did:web:exprsn.io:user/io.exprsn.timeline.post/abc',
      cid: 'bafyreigabc123'
    },
    reasonType: 'spam',
    reason: 'This post contains spam links',
    createdAt: new Date().toISOString()
  }
});
```

---

### 7. Workflow Automation (io.exprsn.workflow)

**Purpose:** Visual workflow automation

#### Record Types

**io.exprsn.workflow.workflow**
- Workflow definition with triggers and steps
- Trigger types: post.created, post.liked, user.followed, message.received, schedule, webhook, manual
- Step types: sendNotification, createPost, sendMessage, updateRecord, httpRequest, javascript, delay, conditional, loop
- Conditions with JSONPath and operators
- Error handling strategies
- Execution tracking
- File: `io/exprsn/workflow/workflow.json`

#### Usage Example

```typescript
// Create workflow
await agent.com.atproto.repo.createRecord({
  repo: did,
  collection: 'io.exprsn.workflow.workflow',
  record: {
    name: 'Welcome New Followers',
    description: 'Send welcome message to new followers',
    trigger: {
      type: 'user.followed',
      conditions: []
    },
    steps: [
      {
        type: 'sendMessage',
        config: {
          message: 'Thanks for following!',
          channel: 'spark'
        },
        onError: 'continue'
      }
    ],
    isActive: true,
    createdAt: new Date().toISOString()
  }
});
```

---

### 8. Forge CRM (io.exprsn.forge)

**Purpose:** CRM and business management

#### Record Types

**io.exprsn.forge.contact**
- CRM contact record (CardDAV compatible)
- Full name structure (given, family)
- Organization and title
- Multiple emails and phones (typed)
- Postal addresses
- Social profiles
- Custom fields support
- Tags and notes
- File: `io/exprsn/forge/contact.json`

**io.exprsn.forge.opportunity**
- Sales opportunity/deal record
- Sales stages: prospecting, qualification, proposal, negotiation, closed_won, closed_lost
- Value with currency support
- Win probability percentage
- Expected close date
- Contact and account associations
- Custom fields
- File: `io/exprsn/forge/opportunity.json`

#### Usage Example

```typescript
// Create contact
const contactRecord = await agent.com.atproto.repo.createRecord({
  repo: did,
  collection: 'io.exprsn.forge.contact',
  record: {
    displayName: 'Jane Smith',
    givenName: 'Jane',
    familyName: 'Smith',
    organization: 'Acme Corp',
    title: 'CTO',
    emails: [{
      type: 'work',
      value: 'jane@acme.com',
      isPrimary: true
    }],
    tags: ['lead', 'enterprise'],
    createdAt: new Date().toISOString()
  }
});

// Create opportunity
await agent.com.atproto.repo.createRecord({
  repo: did,
  collection: 'io.exprsn.forge.opportunity',
  record: {
    name: 'Acme Corp - Enterprise License',
    contactUri: contactRecord.uri,
    stage: 'proposal',
    value: 50000_00, // $50,000.00 in cents
    currency: 'USD',
    probability: 75,
    expectedCloseDate: '2025-03-31T00:00:00Z',
    tags: ['enterprise', 'q1-2025'],
    createdAt: new Date().toISOString()
  }
});
```

---

## Integration with exprsn-bluesky

### 1. Lexicon Loading

Lexicons are automatically loaded from this directory when exprsn-bluesky starts. The lexicon loader validates all schemas and makes them available to the XRPC server.

### 2. Record Storage

Records are stored in user repositories following the AT Protocol repository structure:

```
at://did:web:exprsn.io:user/
  ├── io.exprsn.timeline.post/
  │   ├── abc123
  │   └── def456
  ├── io.exprsn.spark.message/
  │   ├── msg001
  │   └── msg002
  └── io.exprsn.forge.contact/
      ├── contact1
      └── contact2
```

### 3. XRPC Endpoint Registration

XRPC queries and procedures are automatically registered based on lexicon definitions. Endpoints are available at:

```
POST /xrpc/io.exprsn.spark.sendMessage
GET  /xrpc/io.exprsn.timeline.getFeed?limit=50
GET  /xrpc/io.exprsn.spark.getConversations
```

---

## Development Guidelines

### Creating New Lexicons

1. **Choose Appropriate Namespace**
   - Use `io.exprsn.<service>.<recordType>`
   - Follow existing naming conventions

2. **Define Record Schema**
   ```json
   {
     "lexicon": 1,
     "id": "io.exprsn.service.record",
     "defs": {
       "main": {
         "type": "record",
         "key": "tid",
         "record": {
           "type": "object",
           "required": ["field1", "createdAt"],
           "properties": { ... }
         }
       }
     }
   }
   ```

3. **Add View Definition**
   - Always include a `view` def for API responses
   - Include derived fields (counts, viewer state)

4. **Create XRPC Methods**
   - Queries for reads (GET operations)
   - Procedures for writes (POST operations)
   - Define input/output schemas

5. **Update Catalog**
   - Add entry to `catalog.json`
   - Update statistics

### Best Practices

- **Use Standard References**: Leverage `app.bsky.*` refs where applicable
- **Validation**: Add constraints (maxLength, format, enum)
- **Timestamps**: Always use ISO 8601 format (`datetime`)
- **DIDs**: Use `format: "did"` for identity references
- **URIs**: Use `format: "at-uri"` for AT Protocol URIs
- **Blobs**: Specify `accept` types and `maxSize`
- **Descriptions**: Document every field and record type

---

## Testing Lexicons

### Validation

```bash
# Validate all lexicons
npm run validate:lexicons

# Validate specific lexicon
npm run validate:lexicon io/exprsn/timeline/post.json
```

### Testing with PDS

```typescript
// Import lexicons
import * as exprsnTimeline from './lexicons/io/exprsn/timeline';

// Create test record
const record = {
  $type: 'io.exprsn.timeline.post',
  text: 'Test post',
  visibility: 'public',
  createdAt: new Date().toISOString()
};

// Validate against schema
const isValid = validateRecord(record, exprsnTimeline.post);
```

---

## Versioning

Lexicons follow semantic versioning:

- **Major**: Breaking changes to schema
- **Minor**: Backward-compatible additions
- **Patch**: Documentation and non-breaking fixes

Current version: **1.0.0**

---

## Reference Documentation

- **AT Protocol Specification**: https://atproto.com
- **Lexicon Specification**: https://atproto.com/specs/lexicon
- **XRPC Specification**: https://atproto.com/specs/xrpc
- **BlueSky Lexicons**: https://github.com/bluesky-social/atproto/tree/main/lexicons

---

## Statistics

- **Total Lexicons**: 16
- **Services**: 8
- **Record Types**: 14
- **XRPC Queries**: 2
- **XRPC Procedures**: 1

---

## Support

For questions or issues with lexicons:
- **Email**: engineering@exprsn.com
- **Documentation**: See service-specific READMEs
- **Issue Tracker**: GitHub Issues

---

**Last Updated**: 2025-12-22
**Version**: 1.0.0
**Maintainer**: Rick Holland <engineering@exprsn.com>
