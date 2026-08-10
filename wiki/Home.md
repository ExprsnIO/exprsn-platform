# Welcome to the Exprsn Platform Wiki

**Exprsn** is a comprehensive, enterprise-grade microservices ecosystem combining social networking capabilities with business management tools. This wiki provides detailed documentation for developers, system administrators, and contributors.

---

## 📚 Quick Navigation

### Getting Started
- [Installation Guide](guides/Installation-Guide)
- [Quick Start](guides/Quick-Start)
- [Configuration](guides/Configuration)
- [First Steps](guides/First-Steps)

### Architecture
- [System Architecture](architecture/System-Architecture)
- [Microservices Overview](architecture/Microservices-Overview)
- [Database Architecture](architecture/Database-Architecture)
- [Security Architecture](architecture/Security-Architecture)
- [CA Token System](architecture/CA-Token-System)

### Services Documentation

#### Core Infrastructure
- [exprsn-ca](services/exprsn-ca) - Certificate Authority & OCSP/CRL
- [exprsn-auth](services/exprsn-auth) - Authentication & SSO
- [exprsn-setup](services/exprsn-setup) - Service Discovery & Management
- [exprsn-vault](services/exprsn-vault) - Secrets Management

#### Communication & Social
- [exprsn-spark](services/exprsn-spark) - Real-time Messaging
- [exprsn-timeline](services/exprsn-timeline) - Social Feed
- [exprsn-nexus](services/exprsn-nexus) - Groups & Events
- [exprsn-herald](services/exprsn-herald) - Notifications

#### Media & Content
- [exprsn-filevault](services/exprsn-filevault) - File Storage
- [exprsn-gallery](services/exprsn-gallery) - Media Galleries
- [exprsn-live](services/exprsn-live) - Live Streaming
- [exprsn-moderator](services/exprsn-moderator) - Content Moderation

#### Business Applications
- [exprsn-svr](services/exprsn-svr) - Business Hub (Low-Code + CRM/ERP)
- [exprsn-workflow](services/exprsn-workflow) - Workflow Automation

#### Infrastructure Services
- [exprsn-bridge](services/exprsn-bridge) - API Gateway
- [exprsn-pulse](services/exprsn-pulse) - Analytics & Metrics
- [exprsn-prefetch](services/exprsn-prefetch) - Timeline Prefetching

#### Development Services
- [exprsn-payments](services/exprsn-payments) - Payment Processing
- [exprsn-atlas](services/exprsn-atlas) - Geospatial Services
- [exprsn-dbadmin](services/exprsn-dbadmin) - Database Administration
- [exprsn-bluesky](services/exprsn-bluesky) - AT Protocol Integration

### Development Guides
- [Development Workflow](guides/Development-Workflow)
- [Creating a New Service](guides/Creating-New-Service)
- [Coding Standards](guides/Coding-Standards)
- [Testing Guide](guides/Testing-Guide)
- [Debugging Tips](guides/Debugging-Tips)

### Deployment & Operations
- [Production Deployment](guides/Production-Deployment)
- [Docker Deployment](guides/Docker-Deployment)
- [Monitoring & Logging](guides/Monitoring-Logging)
- [Backup & Recovery](guides/Backup-Recovery)
- [Scaling Guide](guides/Scaling-Guide)

### API Reference
- [REST API Overview](api/REST-API-Overview)
- [Authentication API](api/Authentication-API)
- [CA Token API](api/CA-Token-API)
- [Timeline API](api/Timeline-API)
- [Workflow API](api/Workflow-API)

### Contributing
- [Contributing Guidelines](guides/Contributing)
- [Code Review Process](guides/Code-Review)
- [Release Process](guides/Release-Process)

---

## 🎯 Platform Overview

### What is Exprsn?

Exprsn is a **complete microservices platform** that provides:

- **🔐 Enterprise Security**: CA-based token authentication with RSA-PSS signatures
- **💼 Business Tools**: Complete CRM/ERP suite with 92+ endpoints
- **🌐 Social Features**: Real-time messaging, feeds, groups, and events
- **⚡ High Performance**: Redis caching, Bull queues, Elasticsearch
- **🔧 Low-Code Platform**: Visual designers for rapid application development
- **📊 Analytics**: Comprehensive metrics and reporting

### Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway (Bridge)                     │
│                         Port 3010                            │
└────────────────────────┬────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐    ┌────▼────┐    ┌────▼────┐
    │   CA    │    │  Auth   │    │ Services│
    │ :3000   │    │ :3001   │    │  (15+)  │
    └────┬────┘    └────┬────┘    └────┬────┘
         │               │               │
         └───────────────┼───────────────┘
                         │
                    ┌────▼────┐
                    │  Redis  │
                    │ + Queue │
                    └────┬────┘
                         │
                    ┌────▼────┐
                    │PostgreSQL│
                    │ (per-svc)│
                    └─────────┘
```

### Key Technologies

- **Node.js 18+** - Runtime environment
- **PostgreSQL 13+** - Primary database
- **Redis 7+** - Caching and queues
- **Sequelize** - ORM
- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **React/Vite** - Frontend (Business Hub)
- **Jest** - Testing framework

---

## 🚀 Quick Start

### Prerequisites

```bash
# Required
- Node.js 18+
- PostgreSQL 13+
- Redis 7+
- Git

# Optional (for full features)
- Elasticsearch 8+
- Docker & Docker Compose
```

### Installation

```bash
# Clone repository
git clone https://github.com/ExprsnIO/Exprsn.git
cd Exprsn

# Install dependencies
npm install

# Initialize system
npm run init

# Start all services
npm start

# Check health
npm run health
```

### First Access Points

- **Admin Dashboard**: http://localhost:3000/admin
- **Auth Dashboard**: http://localhost:3001/admin
- **Business Hub**: https://localhost:5001
- **Service Health**: http://localhost:3015/health

---

## 📊 Service Status

| Status | Count | Services |
|--------|-------|----------|
| ✅ Production | 15 | CA, Auth, Spark, Timeline, Prefetch, Moderator, FileVault, Gallery, Live, Bridge, Nexus, Pulse, Vault, Herald, Setup |
| ✅ Business Apps | 2 | SVR (Business Hub), Workflow |
| 🚧 Development | 4 | Payments, Atlas, DBAdmin, Bluesky |

---

## 🔑 Key Concepts

### CA Token Authentication

All inter-service communication uses **CA Tokens** - cryptographically signed tokens with:
- Fine-grained permissions (read, write, update, delete, append)
- Resource-specific access controls
- RSA-SHA256-PSS signatures
- OCSP validation support
- Configurable expiry (time or usage-based)

### Database-Per-Service

Each microservice maintains its own PostgreSQL database:
- Independent schema evolution
- Service isolation
- Easier scaling
- Clear ownership boundaries

### Event-Driven Architecture

Services communicate via:
- **Synchronous**: REST API calls with CA tokens
- **Asynchronous**: Bull queues (Redis-backed)
- **Real-time**: Socket.IO for WebSocket connections

---

## 📖 Documentation Sections

### For Developers
- Setting up development environment
- Creating new features
- Writing tests
- Debugging services
- API integration

### For System Administrators
- Installation and configuration
- Monitoring and logging
- Backup and recovery
- Performance tuning
- Security hardening

### For Contributors
- Contribution guidelines
- Code review process
- Release workflow
- Issue reporting

---

## 🆘 Getting Help

- **Issues**: [GitHub Issues](https://github.com/ExprsnIO/Exprsn/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ExprsnIO/Exprsn/discussions)
- **Documentation**: This wiki and [CLAUDE.md](../CLAUDE.md)
- **Email**: support@exprsn.io

---

## 📝 Recent Updates

Check the [Changelog](guides/Changelog) for recent updates and changes to the platform.

---

**Ready to dive in?** Start with the [Quick Start Guide](guides/Quick-Start) or explore the [System Architecture](architecture/System-Architecture) to understand how everything works together.
