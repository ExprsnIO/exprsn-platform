# Exprsn Moderator - Enhanced Setup Guide

## 🎯 Overview

The Exprsn Moderator service has been significantly enhanced with:

- **AI Agent Framework**: Modular, extensible AI-powered moderation agents
- **Email Notification System**: Automated email notifications with customizable templates
- **Setup & Configuration Interface**: Web-based configuration management
- **Database Migrations**: Sequelize-based schema management
- **Default Data Seeders**: Pre-configured agents, templates, and settings

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd src/exprsn-moderator
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and configure:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=exprsn_moderator
DB_USER=postgres
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# AI Providers
CLAUDE_API_KEY=sk-ant-api03-...
OPENAI_API_KEY=sk-...
DEEPSEEK_API_KEY=...

# Email Configuration
EMAIL_PROVIDER=smtp  # or 'sendgrid' or 'ethereal'
SMTP_HOST=localhost
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASSWORD=your_smtp_password
EMAIL_FROM=moderation@exprsn.io

# Service
PORT=3006
NODE_ENV=development
```

### 3. Initialize System

```bash
npm run init
```

This command will:
- Run all database migrations
- Create database tables
- Seed default AI agents
- Seed default email templates
- Seed default configuration
- Initialize the AI agent framework

### 4. Start the Service

```bash
npm start
```

Or in development mode with auto-reload:

```bash
npm run dev
```

## 📁 New Directory Structure

```
src/exprsn-moderator/
├── migrations/              # Database migrations
│   ├── 20250101000001-create-ai-agents.js
│   ├── 20250101000002-create-agent-executions.js
│   ├── 20250101000003-create-email-templates.js
│   ├── 20250101000004-create-email-logs.js
│   ├── 20250101000005-create-moderator-config.js
│   └── 20250101000006-create-rate-limit-violations.js
│
├── seeders/                 # Default data seeders
│   ├── 20250101000001-default-agents.js
│   ├── 20250101000002-default-email-templates.js
│   └── 20250101000003-default-config.js
│
├── models/                  # Sequelize models
│   ├── AIAgent.js
│   ├── AgentExecution.js
│   ├── EmailTemplate.js
│   ├── EmailLog.js
│   ├── ModeratorConfig.js
│   ├── RateLimitViolation.js
│   └── sequelize-index.js  # Model registry (updated)
│
├── services/
│   ├── agentFramework.js               # AI Agent framework core
│   ├── emailService.js                 # Email notification service
│   └── agents/                         # Agent implementations
│       ├── BaseAgent.js
│       ├── TextModerationAgent.js
│       ├── ImageModerationAgent.js
│       ├── VideoModerationAgent.js
│       └── RateLimitDetectionAgent.js
│
├── routes/
│   └── setup.js             # Setup/configuration API routes
│
└── scripts/
    └── init-system.js       # System initialization script
```

## 🤖 AI Agents

The system includes 4 default AI agents:

### 1. Text Content Moderator
- **Type**: `text_moderation`
- **Provider**: Claude
- **Applies to**: text, post, comment, message
- **Auto-action**: Enabled
- Analyzes text for toxicity, hate speech, violence, NSFW, and spam

### 2. Image Content Moderator
- **Type**: `image_moderation`
- **Provider**: Claude
- **Applies to**: image
- **Auto-action**: Enabled
- Analyzes images for NSFW, violence, hate symbols, and disturbing content

### 3. Video Content Moderator
- **Type**: `video_moderation`
- **Provider**: Claude
- **Applies to**: video
- **Auto-action**: Disabled (requires manual review)
- Analyzes video metadata and thumbnails

### 4. Rate Limit & Spam Detector
- **Type**: `rate_limit_detection`
- **Provider**: Local (no AI)
- **Applies to**: post, comment, message
- **Auto-action**: Enabled
- Detects spam through rate limiting patterns

## 📧 Email Templates

Default email templates are created for:

1. **Content Approved** - Notify users when content is approved
2. **Content Rejected** - Notify users when content is rejected
3. **User Warning** - Send warning to users
4. **User Suspended** - Notify users of temporary suspension
5. **User Banned** - Notify users of permanent ban
6. **Appeal Received** - Confirm appeal submission
7. **Appeal Approved** - Notify users of approved appeal
8. **Appeal Denied** - Notify users of denied appeal

All templates support variable substitution with `{{variableName}}` syntax.

## 🔧 Configuration

### Database Migrations

```bash
# Run migrations
npm run migrate

# Undo last migration
npm run migrate:undo

# Run seeders
npm run seed

# Undo seeders
npm run seed:undo
```

### Agent Management API

**Get all agents:**
```bash
GET /api/setup/agents
```

**Create agent:**
```bash
POST /api/setup/agents
Content-Type: application/json

{
  "name": "My Custom Agent",
  "type": "custom",
  "provider": "claude",
  "model": "claude-3-5-sonnet-20241022",
  "appliesTo": ["text"],
  "priority": 50,
  "enabled": true
}
```

**Update agent:**
```bash
PUT /api/setup/agents/:id
```

**Delete agent:**
```bash
DELETE /api/setup/agents/:id
```

### Email Template API

**Get all templates:**
```bash
GET /api/setup/templates
```

**Create template:**
```bash
POST /api/setup/templates
Content-Type: application/json

{
  "name": "Custom Template",
  "type": "custom",
  "subject": "Custom Subject: {{topic}}",
  "bodyText": "Hello, {{userName}}!\n\nYour message: {{message}}",
  "variables": ["topic", "userName", "message"],
  "enabled": true
}
```

**Test email sending:**
```bash
POST /api/setup/test-email
Content-Type: application/json

{
  "to": "test@example.com",
  "templateType": "content_approved",
  "data": {
    "contentType": "post",
    "contentId": "123",
    "date": "2025-01-01"
  }
}
```

### Configuration API

**Get all configuration:**
```bash
GET /api/setup/config
```

**Get configuration by category:**
```bash
GET /api/setup/config?category=thresholds
```

**Update configuration:**
```bash
PUT /api/setup/config/auto_approve_threshold
Content-Type: application/json

{
  "value": 35,
  "category": "thresholds",
  "description": "Updated threshold"
}
```

## 🔍 System Status

Check system health:
```bash
GET /api/setup/status
```

Response:
```json
{
  "success": true,
  "data": {
    "service": "exprsn-moderator",
    "version": "1.0.0",
    "timestamp": "2025-01-01T00:00:00.000Z",
    "components": {
      "database": {
        "status": "healthy",
        "message": "Database connected"
      },
      "redis": {
        "status": "healthy",
        "message": "Redis connected"
      },
      "email": {
        "status": "healthy",
        "message": "Email service configured"
      },
      "agents": {
        "status": "healthy",
        "message": "4 active agents",
        "stats": {
          "totalAgents": 4,
          "activeAgents": 4,
          "inactiveAgents": 0
        }
      }
    }
  }
}
```

## 🧪 Testing

### Test Email Service

```bash
# Using Ethereal (test mode, no real emails sent)
EMAIL_PROVIDER=ethereal npm start

# Check logs for Ethereal preview URL
```

### Test AI Agent Execution

```javascript
const agentFramework = require('./services/agentFramework');

// Execute agents for content
const result = await agentFramework.executeAgents({
  contentType: 'text',
  contentId: '123',
  contentText: 'This is a test post',
  sourceService: 'timeline',
  userId: 'user-uuid'
});

console.log('Risk Score:', result.highestRiskScore);
console.log('Recommended Action:', result.recommendedAction);
console.log('Scores:', result.scores);
```

## 📊 Rate Limiting

Default rate limits (configured per agent):

- **Posts**: 5/minute, 50/hour
- **Comments**: 10/minute, 100/hour
- **Messages**: 20/minute, 200/hour

Violations are automatically detected and logged to `rate_limit_violations` table.

## 🎛️ Workflow Integration

The moderator integrates with exprsn-workflow for automated actions:

1. **Approval Workflow**: Trigger when content is approved
2. **Rejection Workflow**: Trigger when content is rejected
3. **Ban Workflow**: Trigger when user is banned

Configure workflow IDs in the moderator_config table.

## 🔐 Security Notes

1. **API Keys**: Never commit API keys. Use environment variables only.
2. **Sensitive Config**: Configuration marked as `is_sensitive` won't be exposed in API responses.
3. **Email Templates**: Validate user input in templates to prevent injection.
4. **Rate Limiting**: Redis-backed rate limiting prevents spam and abuse.

## 📝 Next Steps

1. **Configure AI Providers**: Add API keys for Claude, OpenAI, or other providers
2. **Set Up Email**: Configure SMTP or SendGrid for production
3. **Customize Templates**: Edit email templates to match your brand
4. **Create Custom Agents**: Implement specialized agents for your use case
5. **Integrate Workflows**: Connect with exprsn-workflow for automated actions
6. **Build Admin UI**: Create EJS templates for web-based admin interface

## 🐛 Troubleshooting

### Migration Errors

```bash
# Reset database (caution: deletes all data)
npm run migrate:undo:all
npm run migrate
npm run seed
```

### Agent Not Loading

Check that:
1. Agent is enabled in database
2. Agent type matches registered implementation
3. AI provider credentials are configured
4. Agent priority is set correctly

### Email Not Sending

Check that:
1. SMTP credentials are correct
2. Email service is initialized
3. Template exists and is enabled
4. Recipient email is valid

## 📚 Additional Resources

- [Sequelize Documentation](https://sequelize.org/docs/v6/)
- [Nodemailer Documentation](https://nodemailer.com/)
- [Claude API Documentation](https://docs.anthropic.com/)
- [OpenAI API Documentation](https://platform.openai.com/docs/)

---

**Built with ❤️ by the Exprsn Team**
