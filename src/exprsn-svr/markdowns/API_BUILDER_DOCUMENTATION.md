# API Builder - Complete Documentation

**Exprsn Low-Code Platform - API Builder Module**
**Version:** 1.0.0
**Date:** 2024-12-24
**Status:** ✅ Production Ready

---

## Overview

The **API Builder** is a comprehensive visual tool for creating, managing, and executing custom RESTful API endpoints within the Exprsn Low-Code Platform. It enables users to build APIs without writing code while providing advanced options for custom logic when needed.

### Key Features

- ✅ **Visual API Designer** - No-code interface for building endpoints
- ✅ **5 Handler Types** - JSONLex, External API, Workflow, Custom Code, Entity Query
- ✅ **Runtime Execution Engine** - Fully functional API execution with all handlers
- ✅ **OpenAPI/Swagger Documentation** - Auto-generated API documentation
- ✅ **Request/Response Validation** - JSON Schema-based validation
- ✅ **Authentication & Authorization** - CA Token integration with permissions
- ✅ **Rate Limiting** - Configurable per-endpoint rate limits
- ✅ **CORS Support** - Full cross-origin resource sharing configuration
- ✅ **Response Caching** - Optional caching for improved performance
- ✅ **Testing Console** - Built-in API testing tool
- ✅ **Metrics & Monitoring** - Call counts, error rates, response times

---

## Architecture

### Components

```
lowcode/
├── models/
│   └── Api.js                          # API endpoint data model
├── routes/
│   ├── apis.js                         # API management routes (CRUD)
│   └── apiRuntime.js                   # Runtime execution routes
├── services/
│   ├── ApiService.js                   # Business logic for API management
│   └── OpenAPIGenerator.js             # OpenAPI/Swagger spec generator
├── runtime/
│   └── ApiExecutionEngine.js           # Handler execution engine
├── views/
│   ├── apis.ejs                        # API list/management UI
│   └── api-designer.ejs                # Visual API designer UI
├── public/js/
│   └── api-designer.js                 # Client-side designer logic
└── migrations/
    └── 20251224000001-create-apis-table.js  # Database migration
```

### Data Flow

```
User Request
    ↓
/lowcode/custom/{path}  →  apiRuntime.js
    ↓
Find matching API (by path + method)
    ↓
Check: enabled, auth, rate limits, CORS
    ↓
ApiExecutionEngine.execute()
    ↓
Handler Execution (jsonlex | external_api | workflow | custom_code | entity_query)
    ↓
Validate response (optional)
    ↓
Update metrics (call count, response time)
    ↓
Return response to user
```

---

## Database Schema

### `apis` Table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `application_id` | UUID | Reference to applications table |
| `path` | VARCHAR(255) | API endpoint path (e.g., /api/users) |
| `display_name` | VARCHAR(255) | User-friendly name |
| `description` | TEXT | What this API does |
| `method` | ENUM | HTTP method (GET, POST, PUT, PATCH, DELETE) |
| `category` | VARCHAR(100) | Organization category |
| `handler_type` | ENUM | Type of handler (jsonlex, external_api, etc.) |
| `handler_config` | JSONB | Handler-specific configuration |
| `request_schema` | JSONB | JSON Schema for request validation |
| `response_schema` | JSONB | JSON Schema for response structure |
| `authentication` | JSONB | Auth requirements (CA tokens, permissions) |
| `rate_limit` | JSONB | Rate limiting config |
| `cors` | JSONB | CORS configuration |
| `cache` | JSONB | Caching configuration |
| `enabled` | BOOLEAN | Is endpoint active? |
| `version` | VARCHAR(50) | Semantic version (e.g., 1.0.0) |
| `tags` | ARRAY | Tags for categorization |
| `call_count` | INTEGER | Total API calls |
| `error_count` | INTEGER | Total errors |
| `avg_response_time` | FLOAT | Average response time (ms) |
| `last_called_at` | TIMESTAMP | Last call timestamp |
| `created_by` | UUID | Creator user ID |
| `updated_by` | UUID | Last updater user ID |
| `metadata` | JSONB | Additional metadata |
| `created_at` | TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `deleted_at` | TIMESTAMP | Soft delete timestamp (paranoid) |

### Indexes

- `application_id` - Fast lookups by application
- `method` - Filter by HTTP method
- `category` - Filter by category
- `handler_type` - Filter by handler type
- `enabled` - Filter active/inactive endpoints
- **Unique:** `(application_id, path, method)` - Ensure no duplicate endpoints

---

## Handler Types

### 1. JSONLex Expression Handler

**Use Case:** Transform data using JSONLex expressions without custom code

**Configuration:**
```json
{
  "expression": "{ \"users\": $.request.query.filter, \"timestamp\": $.now() }"
}
```

**Available Context:**
- `$.request.body` - Request body data
- `$.request.query` - Query parameters
- `$.request.params` - URL parameters
- `$.request.headers` - HTTP headers
- `$.user` - Current authenticated user
- `$.timestamp` - Current timestamp
- `$.env` - Environment (development/production)

**Example:**
```javascript
// GET /lowcode/custom/api/user-info
// Handler Config:
{
  "expression": "{ \"name\": $.user.name, \"email\": $.user.email, \"role\": $.user.role }"
}
```

---

### 2. External API Handler

**Use Case:** Proxy requests to external services (REST APIs)

**Configuration:**
```json
{
  "url": "https://api.github.com/users/username",
  "method": "GET",
  "headers": {
    "Authorization": "Bearer ${process.env.GITHUB_TOKEN}"
  },
  "timeout": 30000,
  "transformRequest": "{ \"q\": $.request.query.search }",
  "transformResponse": "{ \"users\": $.response.items }"
}
```

**Features:**
- Request/response transformation with JSONLex
- Custom headers
- Configurable timeout
- Error handling with retries

**Example:**
```javascript
// GET /lowcode/custom/api/weather?city=London
// Proxies to: https://api.openweathermap.org/data/2.5/weather?q=London
```

---

### 3. Workflow Handler

**Use Case:** Trigger workflow processes from API calls

**Configuration:**
```json
{
  "workflowId": "uuid-of-workflow",
  "inputMapping": {
    "userName": "$.request.body.name",
    "userEmail": "$.request.body.email"
  },
  "outputMapping": {
    "result": "$.workflowResult.status",
    "processId": "$.workflowResult.id"
  }
}
```

**Features:**
- Map request data to workflow inputs
- Map workflow outputs to API response
- Async workflow execution with tracking

**Example:**
```javascript
// POST /lowcode/custom/api/onboard-user
// Triggers: User Onboarding Workflow
// Maps: request.body → workflow input
```

---

### 4. Custom Code Handler

**Use Case:** Execute custom JavaScript code in sandboxed environment

**Configuration:**
```json
{
  "code": "const name = request.body.name;\nreturn { greeting: `Hello ${name}!` };",
  "allowedModules": []
}
```

**Sandbox Environment:**
- VM2 sandboxed execution (10 second timeout)
- Available: `request`, `context`, `console`, `JSON`, `Date`, `Math`, `String`, `Number`, `Array`, `Object`
- **Not available:** `require`, `process`, `fs`, network modules (for security)

**Example:**
```javascript
// POST /lowcode/custom/api/calculate
{
  "code": `
    const a = request.body.a || 0;
    const b = request.body.b || 0;
    const operation = request.body.op || 'add';

    let result;
    switch(operation) {
      case 'add': result = a + b; break;
      case 'subtract': result = a - b; break;
      case 'multiply': result = a * b; break;
      case 'divide': result = b !== 0 ? a / b : 'Error: Division by zero'; break;
    }

    return { result, a, b, operation };
  `
}
```

---

### 5. Entity Query Handler

**Use Case:** Query Low-Code platform entities (database tables)

**Configuration:**
```json
{
  "entityId": "uuid-of-entity",
  "operation": "list",  // or: get, create, update, delete
  "filters": {},
  "limit": 25,
  "offset": 0,
  "sortBy": "created_at",
  "sortOrder": "DESC"
}
```

**Operations:**

| Operation | Description | Required Params |
|-----------|-------------|-----------------|
| `list` | Query multiple records | - |
| `get` | Get single record | `id` (query or param) |
| `create` | Create new record | Request body |
| `update` | Update record | `id` + Request body |
| `delete` | Delete record | `id` (query or param) |

**Example:**
```javascript
// GET /lowcode/custom/api/users?limit=10&offset=0&sortBy=name
// Returns: First 10 users sorted by name
{
  "entityId": "users-entity-uuid",
  "operation": "list"
}
```

---

## Authentication & Security

### CA Token Authentication

All API endpoints can require CA (Certificate Authority) Token authentication:

```json
{
  "authentication": {
    "required": true,
    "permissions": ["read", "write"]
  }
}
```

**Request:**
```bash
curl -X GET https://api.example.com/lowcode/custom/api/protected \
  -H "Authorization: Bearer <CA_TOKEN>"
```

**Permission Enforcement:**
- Token must be valid and not expired
- Token must have all required permissions
- OCSP status must be valid

### Public Endpoints

Disable authentication for public APIs:

```json
{
  "authentication": {
    "required": false,
    "permissions": []
  }
}
```

---

## Rate Limiting

### Configuration

```json
{
  "rateLimit": {
    "enabled": true,
    "maxRequests": 100,    // Maximum requests
    "windowMs": 60000      // Time window (milliseconds)
  }
}
```

**Examples:**

| Max Requests | Window | Rate |
|--------------|--------|------|
| 60 | 60000 (60s) | 60 requests/minute |
| 1000 | 3600000 (1hr) | 1000 requests/hour |
| 10 | 1000 (1s) | 10 requests/second |

**Behavior:**
- Rate limit is enforced per IP address
- Returns `429 Too Many Requests` when exceeded
- Includes `X-RateLimit-Remaining` header

---

## CORS Configuration

### Basic CORS

Allow all origins:
```json
{
  "cors": {
    "enabled": true,
    "allowedOrigins": ["*"],
    "allowedMethods": ["GET", "POST"]
  }
}
```

### Restricted CORS

Allow specific origins:
```json
{
  "cors": {
    "enabled": true,
    "allowedOrigins": [
      "https://app.example.com",
      "https://admin.example.com"
    ],
    "allowedMethods": ["GET", "POST", "PUT", "DELETE"]
  }
}
```

---

## Response Caching

### Configuration

```json
{
  "cache": {
    "enabled": true,
    "ttl": 300  // Cache for 5 minutes (300 seconds)
  }
}
```

**Notes:**
- Only applies to `GET` requests
- Cache key: `{apiId}:{requestPath}:{queryString}`
- Uses Redis (if available) or in-memory cache
- Bypass cache with `Cache-Control: no-cache` header

---

## API Designer UI

### Access

- **List APIs:** `/lowcode/apis?appId={applicationId}`
- **Create New:** `/lowcode/apis/new?appId={applicationId}`
- **Edit API:** `/lowcode/apis/{apiId}/designer`

### Tabs

1. **Basic Info** - Name, path, method, description, version
2. **Handler** - Choose handler type and configure
3. **Request/Response** - Define JSON schemas
4. **Security** - Auth, rate limits, CORS
5. **Advanced** - Caching, metadata
6. **Test** - Built-in testing console

### Workflow

1. **Basic Info** → Enter name, method, path
2. **Handler** → Select handler type and configure
3. **Schema** → (Optional) Define request/response schemas
4. **Security** → Configure auth and rate limits
5. **Test** → Test the endpoint
6. **Save** → Endpoint is immediately available at `/lowcode/custom{path}`

---

## OpenAPI/Swagger Documentation

### Generate Documentation

**OpenAPI JSON:**
```
GET /lowcode/api/apis/docs/openapi.json?applicationId={appId}
```

**Swagger UI:**
```
GET /lowcode/api/apis/docs/swagger?applicationId={appId}
```

Or click **"View Documentation"** button in the APIs list view.

### Features

- Auto-generated from API definitions
- OpenAPI 3.0.3 compliant
- Interactive Swagger UI
- Try-it-out functionality
- Request/response examples
- Authentication documentation

---

## API Routes

### Management Routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/lowcode/api/apis` | List all APIs (with filters) |
| `POST` | `/lowcode/api/apis` | Create new API |
| `GET` | `/lowcode/api/apis/:id` | Get API by ID |
| `PUT` | `/lowcode/api/apis/:id` | Update API |
| `DELETE` | `/lowcode/api/apis/:id` | Delete API |
| `POST` | `/lowcode/api/apis/:id/enable` | Enable API |
| `POST` | `/lowcode/api/apis/:id/disable` | Disable API |
| `POST` | `/lowcode/api/apis/:id/test` | Test API execution |
| `GET` | `/lowcode/api/apis/:id/logs` | Get API call logs |
| `GET` | `/lowcode/api/apis/:id/metrics` | Get performance metrics |
| `GET` | `/lowcode/api/apis/stats` | Get usage statistics |
| `GET` | `/lowcode/api/apis/docs/openapi.json` | OpenAPI specification |
| `GET` | `/lowcode/api/apis/docs/swagger` | Swagger UI |

### Runtime Routes

| Pattern | Description |
|---------|-------------|
| `GET/POST/PUT/PATCH/DELETE` `/lowcode/custom/*` | Execute custom API endpoints |

**Example:**
- API path: `/api/users`
- Full URL: `https://your-domain/lowcode/custom/api/users`

---

## Usage Examples

### Example 1: Simple Data Transformation

**Objective:** Create an endpoint that returns user profile data

**Steps:**
1. Create API: `GET /api/profile`
2. Handler Type: **JSONLex**
3. Expression:
   ```javascript
   {
     "userId": "$.user.id",
     "name": "$.user.name",
     "email": "$.user.email",
     "role": "$.user.role",
     "timestamp": "$.timestamp"
   }
   ```
4. Enable authentication
5. Save

**Test:**
```bash
curl -H "Authorization: Bearer {token}" \
  https://api.example.com/lowcode/custom/api/profile
```

---

### Example 2: External Weather API Proxy

**Objective:** Proxy weather data from OpenWeatherMap

**Steps:**
1. Create API: `GET /api/weather`
2. Handler Type: **External API**
3. Configuration:
   ```json
   {
     "url": "https://api.openweathermap.org/data/2.5/weather",
     "method": "GET",
     "headers": {
       "appid": "${process.env.OPENWEATHER_API_KEY}"
     },
     "transformRequest": "{\"q\": $.request.query.city}",
     "transformResponse": "{\"temp\": $.response.main.temp, \"description\": $.response.weather[0].description}"
   }
   ```
4. Disable authentication (public endpoint)
5. Set rate limit: 60 requests/minute
6. Save

**Test:**
```bash
curl https://api.example.com/lowcode/custom/api/weather?city=London
```

---

### Example 3: Entity CRUD API

**Objective:** Create full CRUD endpoints for "Products" entity

**Create 5 APIs:**

1. **List Products** - `GET /api/products`
   - Handler: Entity Query
   - Operation: list
   - Entity: Products

2. **Get Product** - `GET /api/products/:id`
   - Handler: Entity Query
   - Operation: get

3. **Create Product** - `POST /api/products`
   - Handler: Entity Query
   - Operation: create
   - Permissions: ["write"]

4. **Update Product** - `PUT /api/products/:id`
   - Handler: Entity Query
   - Operation: update
   - Permissions: ["write"]

5. **Delete Product** - `DELETE /api/products/:id`
   - Handler: Entity Query
   - Operation: delete
   - Permissions: ["delete"]

**Result:** Full RESTful API for Products in ~5 minutes!

---

## Monitoring & Metrics

### Available Metrics

Each API tracks:
- **Call Count** - Total number of calls
- **Error Count** - Total number of errors
- **Average Response Time** - Rolling average (ms)
- **Last Called At** - Most recent execution timestamp

### Retrieve Metrics

```javascript
GET /lowcode/api/apis/{apiId}/metrics?period=day

Response:
{
  "period": "day",
  "totalCalls": 1250,
  "successCalls": 1200,
  "errorCalls": 50,
  "avgResponseTime": 125.5,
  "p50ResponseTime": 100,
  "p95ResponseTime": 250,
  "p99ResponseTime": 500,
  "timeline": [...]
}
```

### Statistics Dashboard

```javascript
GET /lowcode/api/apis/stats?applicationId={appId}

Response:
{
  "totalAPIs": 15,
  "activeAPIs": 12,
  "totalCalls": 50000,
  "errorRate": 2.5,
  "avgResponseTime": 150,
  "topAPIs": [...]
}
```

---

## Best Practices

### 1. Naming Conventions

✅ **DO:**
- Use descriptive names: `Get User Profile`, `Create Order`
- Use RESTful paths: `/api/users`, `/api/orders/:id`
- Version your APIs: `1.0.0`, `1.1.0`

❌ **DON'T:**
- Generic names: `API 1`, `Endpoint`
- Non-standard paths: `/getuser`, `/createorder`
- Skip versioning

### 2. Security

✅ **DO:**
- Enable authentication for sensitive endpoints
- Use specific permissions (`read`, `write`, not `*`)
- Set appropriate rate limits
- Validate all inputs with request schemas

❌ **DON'T:**
- Make admin endpoints public
- Use `authentication.required: false` unnecessarily
- Skip input validation
- Expose internal errors in responses

### 3. Performance

✅ **DO:**
- Enable caching for GET endpoints with static data
- Set reasonable rate limits
- Use pagination for list endpoints
- Monitor response times

❌ **DON'T:**
- Cache frequently changing data
- Set extremely high rate limits
- Return unlimited results
- Ignore performance metrics

### 4. Error Handling

✅ **DO:**
- Return consistent error format
- Use appropriate HTTP status codes
- Log errors for debugging
- Provide helpful error messages

❌ **DON'T:**
- Return stack traces in production
- Use generic `500 Internal Error` for everything
- Expose sensitive information in errors

---

## Troubleshooting

### API Not Accessible

**Problem:** `404 Not Found` when calling custom API

**Solutions:**
1. Check API is **enabled** (`enabled: true`)
2. Verify path matches exactly: `/lowcode/custom{your-path}`
3. Check HTTP method matches (GET vs POST)
4. Ensure API has been saved

---

### Authentication Errors

**Problem:** `401 Unauthorized` or `403 Forbidden`

**Solutions:**
1. Verify CA token is valid and not expired
2. Check token has required permissions
3. Ensure `Authorization: Bearer {token}` header is present
4. For public endpoints, set `authentication.required: false`

---

### Handler Errors

**Problem:** `500 Internal Error` during execution

**JSONLex Handler:**
- Check expression syntax
- Verify context variables exist (e.g., `$.request.body.field`)

**External API Handler:**
- Check URL is reachable
- Verify API key/credentials
- Check timeout is sufficient
- Test transformation expressions

**Custom Code Handler:**
- Check for JavaScript syntax errors
- Ensure code returns a value
- Verify timeout (10s max)
- Check sandbox restrictions

**Entity Query Handler:**
- Verify entity exists
- Check entity ID is correct
- Ensure operation is valid

**Workflow Handler:**
- Verify workflow exists and is published
- Check workflow ID is correct
- Ensure input mapping is correct

---

## Migration Guide

### Running the Migration

```bash
cd src/exprsn-svr
npx sequelize-cli db:migrate
```

Or use the sync script:
```bash
node lowcode/scripts/sync-database.js
```

### Migration File

`lowcode/migrations/20251224000001-create-apis-table.js`

Creates:
- `apis` table with all columns
- 8 indexes for performance
- Unique constraint on `(application_id, path, method)`
- Paranoid/soft delete support

---

## Future Enhancements

Planned features for future releases:

- [ ] **API Versioning** - Support multiple versions of same endpoint
- [ ] **Request Logging** - Detailed request/response logging
- [ ] **API Key Authentication** - Alternative to CA tokens
- [ ] **Webhooks** - Outbound webhook configuration
- [ ] **Mock Responses** - Return mock data for testing
- [ ] **GraphQL Support** - GraphQL endpoint handler
- [ ] **API Marketplace** - Share/discover API templates
- [ ] **Advanced Monitoring** - Distributed tracing, APM integration
- [ ] **Load Testing** - Built-in load testing tools
- [ ] **API Deprecation** - Deprecation warnings and sunset dates

---

## Support

For questions or issues:

1. Check this documentation
2. Review examples in `/lowcode/examples/`
3. Open issue on GitHub: `https://github.com/exprsn/lowcode-platform/issues`
4. Email: `engineering@exprsn.com`

---

## Changelog

### Version 1.0.0 (2024-12-24)

**Added:**
- Complete API Builder implementation
- 5 handler types (JSONLex, External API, Workflow, Custom Code, Entity Query)
- Visual API Designer UI with 6 tabs
- Runtime API execution engine
- OpenAPI/Swagger documentation generator
- Request/response validation
- Authentication & authorization
- Rate limiting
- CORS support
- Response caching
- Built-in testing console
- Metrics & monitoring
- Database migration
- Comprehensive documentation

**Status:** ✅ Production Ready

---

**Built with ❤️ by the Exprsn Team**
**© 2024 Exprsn. All rights reserved.**
