# Integration Testing Guide

**Last Updated:** December 24, 2024
**Version:** 1.0.0
**Status:** All Features Implemented and Ready for Testing

---

## Overview

This guide provides comprehensive testing procedures for all newly implemented features in exprsn-svr. Each section includes curl commands, expected responses, and validation steps.

---

## Prerequisites

Before testing, ensure:

1. ✅ Database migrations completed (`npm run migrate`)
2. ✅ Server is running (`npm start`)
3. ✅ Redis is running (optional, for caching and Socket.IO scaling)
4. ✅ PostgreSQL is running
5. ✅ CA token available (for authenticated requests)

### Environment Setup

```bash
# Start PostgreSQL (if not running)
brew services start postgresql@15  # macOS
sudo systemctl start postgresql    # Linux

# Start Redis (optional, for enhanced features)
brew services start redis           # macOS
sudo systemctl start redis          # Linux

# Start exprsn-svr
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr
npm start
```

Server should be accessible at: `http://localhost:5000`

---

## 1. Plugin Management System

### 1.1 List All Plugins

```bash
curl -X GET http://localhost:5000/api/plugins \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "data": []
}
```

### 1.2 Install a Plugin

```bash
curl -X POST http://localhost:5000/api/plugins \
  -H "Content-Type: application/json" \
  -d '{
    "name": "analytics-tracker",
    "displayName": "Analytics Tracker",
    "description": "Track user analytics and page views",
    "version": "1.0.0",
    "type": "service",
    "author": "Test User",
    "mainFile": "index.js",
    "defaultConfig": {
      "trackingId": "UA-12345-1"
    },
    "hooks": {
      "page:viewed": true
    },
    "files": {
      "index.js": "const BasePlugin = require(\"../../BasePlugin\");\n\nclass AnalyticsPlugin extends BasePlugin {\n  async init() {\n    await super.init();\n    console.log(\"Analytics plugin initialized\");\n  }\n\n  registerHooks(manager) {\n    manager.registerHook(\"page:viewed\", async (page) => {\n      console.log(\"Page viewed:\", page.id);\n      return page;\n    });\n  }\n}\n\nmodule.exports = AnalyticsPlugin;"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "analytics-tracker",
    "displayName": "Analytics Tracker",
    "status": "inactive",
    "enabled": false
  },
  "message": "Plugin installed successfully"
}
```

### 1.3 Enable a Plugin

```bash
# Replace {pluginId} with actual plugin ID from installation response
curl -X POST http://localhost:5000/api/plugins/{pluginId}/enable \
  -H "Content-Type: application/json"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "analytics-tracker",
    "status": "active",
    "enabled": true
  },
  "message": "Plugin enabled successfully"
}
```

### 1.4 Get Plugin Details

```bash
curl -X GET http://localhost:5000/api/plugins/{pluginId}
```

### 1.5 Update Plugin Configuration

```bash
curl -X PUT http://localhost:5000/api/plugins/{pluginId}/config \
  -H "Content-Type: application/json" \
  -d '{
    "trackingId": "UA-67890-2"
  }'
```

### 1.6 Disable Plugin

```bash
curl -X POST http://localhost:5000/api/plugins/{pluginId}/disable
```

### 1.7 Uninstall Plugin

```bash
curl -X DELETE http://localhost:5000/api/plugins/{pluginId}
```

**Validation:**
- ✅ Plugin files created in `plugins/registry/{plugin-name}/`
- ✅ Plugin appears in database (`SELECT * FROM plugins;`)
- ✅ Plugin hooks registered when enabled
- ✅ Plugin unloaded when disabled
- ✅ Plugin files removed when uninstalled

---

## 2. Decision Table Feature

### 2.1 Create Decision Table

```bash
curl -X POST http://localhost:5000/api/decision-tables \
  -H "Content-Type: application/json" \
  -d '{
    "applicationId": "00000000-0000-0000-0000-000000000001",
    "name": "shipping-cost-calculator",
    "displayName": "Shipping Cost Calculator",
    "description": "Calculate shipping costs based on weight and distance",
    "inputs": [
      {
        "name": "weight",
        "type": "number",
        "label": "Package Weight (kg)"
      },
      {
        "name": "distance",
        "type": "number",
        "label": "Distance (km)"
      }
    ],
    "outputs": [
      {
        "name": "cost",
        "type": "number",
        "label": "Shipping Cost"
      },
      {
        "name": "method",
        "type": "string",
        "label": "Shipping Method"
      }
    ],
    "hitPolicy": "first",
    "rules": [
      {
        "id": 1,
        "priority": 1,
        "conditions": [
          {
            "input": "weight",
            "operator": "<=",
            "value": 1
          },
          {
            "input": "distance",
            "operator": "<=",
            "value": 100
          }
        ],
        "outputs": {
          "cost": 5.00,
          "method": "Standard"
        }
      },
      {
        "id": 2,
        "priority": 2,
        "conditions": [
          {
            "input": "weight",
            "operator": ">",
            "value": 1
          },
          {
            "input": "distance",
            "operator": "<=",
            "value": 100
          }
        ],
        "outputs": {
          "cost": 10.00,
          "method": "Standard"
        }
      }
    ],
    "defaultOutput": {
      "cost": 15.00,
      "method": "Express"
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "name": "shipping-cost-calculator",
    "status": "draft"
  }
}
```

### 2.2 Activate Decision Table

```bash
curl -X POST http://localhost:5000/api/decision-tables/{tableId}/activate
```

### 2.3 Evaluate Decision Table

```bash
curl -X POST http://localhost:5000/api/decision-tables/{tableId}/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "weight": 0.5,
    "distance": 50
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "matched": true,
    "outputs": {
      "cost": 5.00,
      "method": "Standard"
    },
    "matchedRules": [
      {
        "id": 1,
        "priority": 1,
        "conditions": [...],
        "outputs": {...}
      }
    ]
  }
}
```

### 2.4 Test Different Scenarios

**Scenario 1: Heavy package, short distance**
```bash
curl -X POST http://localhost:5000/api/decision-tables/{tableId}/evaluate \
  -d '{"weight": 2, "distance": 50}'
```
Expected: cost=10.00, method=Standard

**Scenario 2: Light package, long distance**
```bash
curl -X POST http://localhost:5000/api/decision-tables/{tableId}/evaluate \
  -d '{"weight": 0.5, "distance": 200}'
```
Expected: cost=15.00, method=Express (default output)

### 2.5 List Decision Tables

```bash
curl -X GET http://localhost:5000/api/decision-tables
```

### 2.6 Update Decision Table

```bash
curl -X PUT http://localhost:5000/api/decision-tables/{tableId} \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Updated description"
  }'
```

### 2.7 Delete Decision Table

```bash
curl -X DELETE http://localhost:5000/api/decision-tables/{tableId}
```

**Validation:**
- ✅ Rules evaluated in priority order
- ✅ First matching rule returned (for "first" hit policy)
- ✅ Default output returned when no rules match
- ✅ Execution count incremented in database
- ✅ Only active tables can be evaluated

---

## 3. Real-Time Collaboration

### 3.1 Socket.IO Connection Test

Create an HTML file for testing:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Collaboration Test</title>
  <script src="/socket.io/socket.io.js"></script>
</head>
<body>
  <h1>Collaboration Test</h1>
  <div id="status">Disconnected</div>
  <div id="users"></div>
  <div id="cursors"></div>

  <script>
    const socket = io('http://localhost:5000');

    socket.on('connect', () => {
      document.getElementById('status').textContent = 'Connected: ' + socket.id;

      // Join collaboration session
      socket.emit('collaboration:join', {
        sessionId: 'test-session-1',
        userId: 'user-123',
        userInfo: { name: 'Test User', avatar: '' }
      });
    });

    socket.on('collaboration:joined', (data) => {
      console.log('Joined session:', data);
      document.getElementById('users').innerHTML = '<p>Users: ' + data.users.join(', ') + '</p>';
    });

    socket.on('user:joined', (data) => {
      console.log('User joined:', data);
    });

    socket.on('cursor:update', (data) => {
      console.log('Cursor update:', data);
      const cursorsDiv = document.getElementById('cursors');
      cursorsDiv.innerHTML += '<p>' + data.userId + ' moved cursor to ' + JSON.stringify(data.position) + '</p>';
    });

    // Send cursor position
    setInterval(() => {
      socket.emit('collaboration:cursor', {
        sessionId: 'test-session-1',
        userId: 'user-123',
        position: { x: Math.random() * 100, y: Math.random() * 100 }
      });
    }, 2000);
  </script>
</body>
</html>
```

### 3.2 Test Collaboration Events

**Join Session:**
```javascript
socket.emit('collaboration:join', {
  sessionId: 'form-456',
  userId: 'user-789',
  userInfo: { name: 'Jane Doe' }
});
```

**Update Cursor:**
```javascript
socket.emit('collaboration:cursor', {
  sessionId: 'form-456',
  userId: 'user-789',
  position: { x: 100, y: 200 }
});
```

**Apply Change:**
```javascript
socket.emit('collaboration:change', {
  sessionId: 'form-456',
  userId: 'user-789',
  operation: {
    type: 'insert',
    path: 'field1',
    value: 'New value'
  }
});
```

**Acquire Lock:**
```javascript
socket.emit('collaboration:lock', {
  sessionId: 'form-456',
  userId: 'user-789',
  lockKey: 'field1'
});
```

**Validation:**
- ✅ Multiple users can join same session
- ✅ Cursor updates broadcast to other users
- ✅ Changes synchronized across clients
- ✅ Locks prevent simultaneous editing
- ✅ Locks auto-release after 30 seconds
- ✅ Users auto-leave session on disconnect

---

## 4. Workflow Testing & Analytics

### 4.1 Test Workflow (Dry-Run)

```bash
# Note: Requires an existing workflow. Create one first or use existing ID
curl -X POST http://localhost:5000/workflow/api/workflows/{workflowId}/test \
  -H "Content-Type: application/json" \
  -d '{
    "testData": {
      "input1": "test value",
      "input2": 123
    }
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "execution": {
      "id": "uuid-here",
      "status": "completed",
      "result": {...},
      "duration": 1234
    },
    "logs": [
      {
        "step": "step-1",
        "status": "completed",
        "output": {...},
        "timestamp": "2024-12-24T..."
      }
    ],
    "changes": []
  },
  "message": "Test execution completed (no changes committed)"
}
```

### 4.2 Validate Workflow

```bash
curl -X POST http://localhost:5000/workflow/api/workflows/{workflowId}/validate
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "errors": [],
    "warnings": ["Step 'optional-step' is unreachable"]
  }
}
```

### 4.3 Get Workflow Analytics Overview

```bash
curl -X GET "http://localhost:5000/workflow/api/analytics/overview?startDate=2024-12-01&endDate=2024-12-31"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "analytics": [
      {
        "workflow_id": "uuid",
        "workflow_name": "Test Workflow",
        "total_executions": 45,
        "avg_duration": 2345,
        "successful": 40,
        "failed": 5,
        "success_rate": "88.89"
      }
    ],
    "summary": {
      "total_workflows": 3,
      "total_executions": 120,
      "avg_success_rate": "85.50"
    }
  }
}
```

### 4.4 Get Execution Trends

```bash
curl -X GET "http://localhost:5000/workflow/api/analytics/trends?period=day&startDate=2024-12-01&endDate=2024-12-24"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "period": "2024-12-24",
      "total": 15,
      "successful": 12,
      "failed": 3,
      "success_rate": "80.00"
    }
  ]
}
```

### 4.5 Get Specific Workflow Analytics

```bash
curl -X GET http://localhost:5000/workflow/api/analytics/workflow/{workflowId}
```

**Validation:**
- ✅ Dry-run execution doesn't commit changes to database
- ✅ Validation detects unreachable steps
- ✅ Analytics aggregates execution data correctly
- ✅ Trends show time-series data
- ✅ Success rate calculated accurately

---

## 5. Performance Testing

### 5.1 Redis Caching Test

**First Request (Cache MISS):**
```bash
curl -v http://localhost:5000/api/pages 2>&1 | grep -i "x-cache"
```
Expected: `X-Cache: MISS` or no header

**Second Request (Cache HIT):**
```bash
curl -v http://localhost:5000/api/pages 2>&1 | grep -i "x-cache"
```
Expected: `X-Cache: HIT`

### 5.2 Cursor Pagination Test

```bash
# Get first page
curl "http://localhost:5000/api/pages?limit=10"

# Get next page using cursor from response
curl "http://localhost:5000/api/pages?limit=10&cursor={nextCursor}"
```

**Expected Response:**
```json
{
  "success": true,
  "data": [...],
  "pageInfo": {
    "hasMore": true,
    "nextCursor": "base64-encoded-cursor",
    "count": 10
  }
}
```

---

## 6. Database Verification

### 6.1 Verify Tables Created

```bash
psql -U postgres -d exprsn_svr -c "\dt" | grep -E "plugins|decision_tables"
```

**Expected Output:**
```
 public | decision_tables | table | postgres
 public | plugins         | table | postgres
```

### 6.2 Check Decision Tables Data

```bash
psql -U postgres -d exprsn_svr -c "SELECT id, name, status, execution_count FROM decision_tables;"
```

### 6.3 Check Plugin Data

```bash
psql -U postgres -d exprsn_svr -c "SELECT id, name, status, enabled FROM plugins;"
```

---

## 7. Load Testing (Optional)

### 7.1 Plugin Management Load Test

```bash
# Install Apache Bench (if not installed)
# macOS: brew install httpd
# Ubuntu: sudo apt-get install apache2-utils

# Test GET /api/plugins
ab -n 1000 -c 10 http://localhost:5000/api/plugins
```

### 7.2 Decision Table Evaluation Load Test

```bash
# Create a test file with POST data
echo '{"weight": 2, "distance": 50}' > test-data.json

# Run load test
ab -n 1000 -c 10 -p test-data.json -T application/json \
  http://localhost:5000/api/decision-tables/{tableId}/evaluate
```

**Expected:**
- ✅ 1000 requests completed successfully
- ✅ Average response time < 50ms
- ✅ No failed requests

---

## 8. Error Handling Tests

### 8.1 Invalid Plugin Installation

```bash
curl -X POST http://localhost:5000/api/plugins \
  -H "Content-Type: application/json" \
  -d '{"name": "invalid-plugin"}'
```

**Expected:** 400 Bad Request with validation errors

### 8.2 Evaluate Inactive Decision Table

```bash
# Create table but don't activate it
curl -X POST http://localhost:5000/api/decision-tables/{tableId}/evaluate \
  -d '{"weight": 1, "distance": 50}'
```

**Expected:** 400 Bad Request - "Decision table is draft, must be active to evaluate"

### 8.3 Collaboration Lock Conflict

```javascript
// User 1 acquires lock
socket1.emit('collaboration:lock', {
  sessionId: 'test-session',
  userId: 'user-1',
  lockKey: 'field1'
});

// User 2 tries to acquire same lock
socket2.emit('collaboration:lock', {
  sessionId: 'test-session',
  userId: 'user-2',
  lockKey: 'field1'
});
```

**Expected:** Error event emitted - "Resource is locked by another user"

---

## 9. Integration Tests Summary

### Test Checklist:

#### Plugin Management:
- [ ] Install plugin successfully
- [ ] Enable plugin
- [ ] Plugin hooks execute
- [ ] Update plugin configuration
- [ ] Disable plugin
- [ ] Uninstall plugin
- [ ] List all plugins
- [ ] Get plugin types

#### Decision Tables:
- [ ] Create decision table
- [ ] Activate decision table
- [ ] Evaluate with matching rule
- [ ] Evaluate with no matching rule (default output)
- [ ] Test all operators (==, >, <, contains, regex, etc.)
- [ ] Test all hit policies
- [ ] Update decision table
- [ ] Delete decision table

#### Collaboration:
- [ ] Join collaboration session
- [ ] Multiple users join same session
- [ ] Cursor updates broadcast
- [ ] Changes synchronized
- [ ] Lock acquired successfully
- [ ] Lock conflict handled
- [ ] Lock auto-released after timeout
- [ ] User auto-leaves on disconnect

#### Workflow Enhancements:
- [ ] Dry-run execution works
- [ ] Validation detects errors
- [ ] Analytics overview generated
- [ ] Execution trends calculated
- [ ] Workflow-specific analytics

#### Performance:
- [ ] Redis caching works (HIT/MISS)
- [ ] Cursor pagination works
- [ ] Socket.IO Redis adapter (multi-instance)

---

## 10. Common Issues & Troubleshooting

### Issue: "Plugin not found" error

**Solution:**
```bash
# Check if plugin exists in database
psql -U postgres -d exprsn_svr -c "SELECT * FROM plugins WHERE name = 'your-plugin-name';"

# Check if plugin files exist
ls -la plugins/registry/your-plugin-name/
```

### Issue: "Decision table is draft" error

**Solution:**
```bash
# Activate the decision table first
curl -X POST http://localhost:5000/api/decision-tables/{tableId}/activate
```

### Issue: Socket.IO connection refused

**Solution:**
```bash
# Check if server is running with Socket.IO enabled
curl http://localhost:5000/health

# Check Socket.IO configuration in config/index.js
# Ensure socketIO.enabled = true
```

### Issue: Redis connection error

**Solution:**
```bash
# Check if Redis is running
redis-cli ping

# Start Redis if not running
brew services start redis  # macOS
sudo systemctl start redis # Linux

# Or disable Redis in config if not needed
# Set redis.enabled = false in config/index.js
```

---

## 11. Performance Benchmarks

### Expected Performance:

| Endpoint | Expected Response Time | Notes |
|----------|----------------------|-------|
| GET /api/plugins | < 20ms | Without cache |
| POST /api/plugins | < 100ms | Plugin installation |
| POST /api/decision-tables/:id/evaluate | < 30ms | Simple rules |
| Socket.IO events | < 10ms | Broadcast |
| Workflow dry-run | < 500ms | Depends on complexity |
| Analytics overview | < 100ms | With aggregation |

---

## Conclusion

All features are ready for integration testing. Follow this guide systematically to validate each feature. Report any issues with:

1. Error message
2. Steps to reproduce
3. Expected vs. actual behavior
4. Server logs from `/logs/` directory

**Testing Status:** ✅ All features implemented and ready for testing

