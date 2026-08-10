# Quick Start Guide

Get the Exprsn platform up and running in under 30 minutes.

---

## Prerequisites

Before you begin, ensure you have:

- ✅ **Node.js 18+** ([Download](https://nodejs.org))
- ✅ **PostgreSQL 13+** ([Download](https://www.postgresql.org/download/))
- ✅ **Redis 7+** ([Download](https://redis.io/download))
- ✅ **Git** ([Download](https://git-scm.com/downloads))

### System Requirements

- **RAM**: 8GB minimum (16GB recommended)
- **Disk Space**: 20GB minimum
- **CPU**: 4+ cores recommended
- **OS**: macOS, Linux, or Windows (WSL2)

---

## Installation Steps

### Step 1: Clone the Repository

```bash
git clone https://github.com/ExprsnIO/Exprsn.git
cd Exprsn
```

### Step 2: Install Dependencies

```bash
# This installs dependencies for all services (npm workspaces)
npm install
```

**Expected time**: 5-10 minutes

### Step 3: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit configuration
nano .env  # or your preferred editor
```

**Minimum required settings**:
```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Service Control
AUTO_START_SERVICES=ca,setup,auth,timeline,bridge,svr
```

### Step 4: Initialize the System

```bash
# Creates databases, runs migrations, seeds data
npm run init
```

This command will:
1. Create PostgreSQL databases for each service
2. Run database migrations
3. Seed initial data (admin user, default roles, etc.)
4. Generate cryptographic keys
5. Initialize the CA service

**Expected time**: 3-5 minutes

### Step 5: Start the Platform

```bash
# Start all configured services
npm start
```

**Expected time**: 1-2 minutes for all services to start

---

## Verify Installation

### Check Service Health

```bash
# In a new terminal
npm run health
```

Expected output:
```
✓ exprsn-ca (3000) - OK
✓ exprsn-setup (3015) - OK
✓ exprsn-auth (3001) - OK
✓ exprsn-timeline (3004) - OK
✓ exprsn-bridge (3010) - OK
✓ exprsn-svr (5001) - OK
```

### Access the Dashboards

#### CA Admin Dashboard
```
URL: http://localhost:3000/admin
Default Login:
  Username: admin
  Password: admin123
```

#### Auth Dashboard
```
URL: http://localhost:3001/admin
Default Login:
  Username: admin
  Password: admin123
```

#### Business Hub (Low-Code + CRM/ERP)
```
URL: https://localhost:5001
Default Login:
  Username: admin@exprsn.io
  Password: admin123
```

⚠️ **Security Note**: Change default passwords immediately in production!

---

## First Steps

### 1. Create Your First User

```bash
# Via CLI
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "you@example.com",
    "username": "yourusername",
    "password": "YourSecurePassword123!",
    "firstName": "Your",
    "lastName": "Name"
  }'
```

Or use the web interface at http://localhost:3001/register

### 2. Explore the Business Hub

1. Navigate to https://localhost:5001
2. Log in with admin credentials
3. Click "Low-Code Platform" → "Applications"
4. Create your first application:
   - Name: "My First App"
   - Description: "Testing the platform"
   - Click "Create"

### 3. Create an Entity

1. In your application, click "Entity Designer"
2. Create a new entity:
   - Name: "Contacts"
   - Add fields:
     - `name` (Text)
     - `email` (Email)
     - `phone` (Text)
   - Click "Save"
3. View auto-generated API endpoints

### 4. Test the Timeline

1. Navigate to http://localhost:3004/api/posts
2. Create a test post:
```bash
curl -X POST http://localhost:3004/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer {YOUR_TOKEN}" \
  -d '{
    "content": "Hello, Exprsn!",
    "visibility": "public"
  }'
```

---

## Common Commands

### Service Management

```bash
# Start all services
npm start

# Start specific service
npm run start:ca
npm run start:auth
npm run start:timeline

# Development mode (hot reload)
npm run dev:timeline
npm run dev:auth
```

### Database Operations

```bash
# Run migrations
npm run migrate:all

# Run migrations for specific service
cd src/exprsn-auth
npx sequelize-cli db:migrate

# Rollback migration
npx sequelize-cli db:migrate:undo

# Seed database
npm run seed:all
```

### Health & Monitoring

```bash
# Check service health
npm run health

# Continuous monitoring
npm run health:watch

# View logs
tail -f src/exprsn-ca/logs/combined.log
```

### System Reset

```bash
# Interactive reset menu
npm run reset

# Reset everything (nuclear option)
npm run reset:full

# Reset data only (keeps schema)
npm run reset:data

# Clear Redis cache
npm run reset:cache
```

---

## Troubleshooting

### PostgreSQL Connection Failed

**Symptom**: `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution**:
```bash
# Check if PostgreSQL is running
pg_isready

# Start PostgreSQL (macOS)
brew services start postgresql@15

# Start PostgreSQL (Linux)
sudo systemctl start postgresql
```

### Redis Connection Failed

**Symptom**: `Error: Redis connection failed`

**Solution**:
```bash
# Check if Redis is running
redis-cli ping

# Start Redis (macOS)
brew services start redis

# Start Redis (Linux)
sudo systemctl start redis
```

### Port Already in Use

**Symptom**: `Error: listen EADDRINUSE :::3000`

**Solution**:
```bash
# Find process using port
lsof -i :3000

# Kill the process
kill -9 <PID>

# Or use a different port
PORT=3100 npm run start:ca
```

### CA Service Won't Start

**Symptom**: Other services fail with "CA not available"

**Solution**:
1. CA must start first
2. Check CA logs: `tail -f src/exprsn-ca/logs/combined.log`
3. Verify database created: `psql -l | grep exprsn_ca`
4. Restart: `npm run start:ca`

### Migration Errors

**Symptom**: `SequelizeDatabaseError: relation does not exist`

**Solution**:
```bash
# Drop and recreate database
npm run db:reset

# Re-run initialization
npm run init
```

---

## Next Steps

Now that you have Exprsn running:

1. **Explore Services**: Check out individual [service documentation](../services/)
2. **Build an App**: Follow the [Low-Code Platform Guide](Low-Code-Platform)
3. **Configure SSO**: Set up [SAML or OAuth2](SSO-Configuration)
4. **Set Up Workflows**: Create [automated workflows](../services/exprsn-workflow)
5. **Deploy to Production**: Review [Production Deployment](Production-Deployment)

---

## Development Workflow

### Creating a New Feature

```bash
# Create feature branch
git checkout -b feature/my-new-feature

# Make changes
# ... edit files ...

# Run tests
npm run test:all

# Commit changes
git add .
git commit -m "Add new feature"

# Push to GitHub
git push origin feature/my-new-feature
```

### Running Tests

```bash
# All services
npm run test:all

# Specific service
cd src/exprsn-timeline
npm test

# With coverage
npm run test:coverage
```

---

## Getting Help

- **Documentation**: Check the [wiki](../Home) for detailed guides
- **Issues**: [GitHub Issues](https://github.com/ExprsnIO/Exprsn/issues)
- **Discussions**: [GitHub Discussions](https://github.com/ExprsnIO/Exprsn/discussions)
- **Email**: support@exprsn.io

---

## What's Next?

- [System Architecture](../architecture/System-Architecture) - Understand how it all works
- [Development Workflow](Development-Workflow) - Contributing guidelines
- [API Reference](../api/REST-API-Overview) - API documentation
- [Production Deployment](Production-Deployment) - Deploy to production

---

**Congratulations!** 🎉 You now have a fully functional Exprsn platform running locally.
