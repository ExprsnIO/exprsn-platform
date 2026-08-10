# Visual Query Builder - Complete Documentation

**Version:** 1.0.0
**Date:** December 26, 2025
**Status:** ✅ Production Ready

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Installation](#installation)
5. [Usage Guide](#usage-guide)
6. [Datasource Types](#datasource-types)
7. [Filter Builder](#filter-builder)
8. [Aggregations](#aggregations)
9. [API Reference](#api-reference)
10. [Examples](#examples)
11. [Troubleshooting](#troubleshooting)

---

## Overview

The **Visual Query Builder** is a professional, no-code query interface that enables users to build complex queries across multiple datasource types without writing SQL or code. It provides an intuitive drag-and-drop interface similar to enterprise tools like Microsoft Power BI and Tableau.

### Key Capabilities

- **10 Datasource Types**: Entity, Forge CRM/ERP, Database, REST API, JSON, XML, JSONLex, Redis, Variables, Custom Code
- **Visual Filter Builder**: Nested filter groups with AND/OR logic
- **Aggregation Engine**: COUNT, SUM, AVG, MIN, MAX, COUNT DISTINCT, ARRAY_AGG, JSON_AGG
- **Advanced Features**: Grouping, ordering, pagination, caching, timeouts
- **Variable Integration**: Use form variables and parameters in queries
- **Real-time Preview**: Test queries instantly with live data
- **SQL Generation**: Automatic SQL generation for database sources

---

## Features

### ✅ Complete Feature List

**Data Sources:**
- ✅ Entity (Database Tables from Entity Designer)
- ✅ Forge CRM (Contacts, Accounts, Leads, Opportunities, Cases, Tasks)
- ✅ Direct Database Queries (Custom tables)
- ✅ REST APIs (GET/POST with headers)
- ✅ JSON Files (URL or inline)
- ✅ XML Files (URL or inline with XPath)
- ✅ JSONLex Expressions (Data transformations)
- ✅ Redis Cache (All data types: string, hash, list, set, zset)
- ✅ Form Variables (Array data from variables)
- ✅ Custom JavaScript Code (Sandboxed execution)

**Query Building:**
- ✅ Field Selection (Drag-and-drop, aliases, transformations)
- ✅ Filter Builder (Nested AND/OR groups, 14 operators)
- ✅ Aggregations (8 functions with GROUP BY support)
- ✅ Ordering (Multi-field sorting ASC/DESC)
- ✅ Limiting & Pagination (Offset, limit, automatic pagination)
- ✅ Distinct Results
- ✅ HAVING Clause (Post-aggregation filtering)

**Advanced Features:**
- ✅ Variable Binding (Form variables, parameters, field references)
- ✅ Field Transformations (uppercase, lowercase, trim, date formatting)
- ✅ Query Caching (Redis-backed with configurable duration)
- ✅ Query Timeout (Configurable per query)
- ✅ SQL Preview (Live SQL generation and formatting)
- ✅ Test Mode (Execute with LIMIT 10 for testing)
- ✅ Result Preview (Tabular display with execution stats)

---

## Architecture

### Component Structure

```
lowcode/
├── public/js/
│   ├── form-query-builder.js           # Core query builder logic
│   ├── form-query-builder-ui.js        # UI components (datasource, fields tabs)
│   ├── form-query-builder-ui-tabs.js   # Fields & filter tabs
│   ├── form-query-builder-ui-advanced.js # Aggregation, ordering, preview tabs
│   └── ...
├── public/css/
│   └── query-builder.css               # Comprehensive styles
├── routes/
│   └── queryExecutor.js                # Backend execution engine
└── VISUAL_QUERY_BUILDER_DOCUMENTATION.md # This file
```

### Data Flow

```
┌─────────────────┐
│   User Action   │
│   (Select DS)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Query Builder  │
│    (Frontend)   │
│  - Build Query  │
│  - Add Filters  │
│  - Configure    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Query Preview  │
│   (SQL/JSON)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│POST /api/query/ │
│    execute      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Query Executor  │
│   (Backend)     │
│  - Route by DS  │
│  - Execute      │
│  - Transform    │
│  - Cache        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Results       │
│  (JSON Array)   │
└─────────────────┘
```

### Query Data Model

```javascript
{
  id: "query_1234567890_abc123",
  name: "Active Contacts Report",
  description: "All active contacts with recent activity",

  // Datasource Configuration
  datasource: {
    type: "entity", // entity, forge, database, rest, json, xml, jsonlex, redis, variable, custom
    config: {
      entityId: "uuid-123",
      entityName: "contacts"
    }
  },

  // Field Selection
  fields: [
    { name: "firstName", alias: "first_name", transform: "uppercase" },
    { name: "lastName", alias: "last_name", transform: "" },
    { name: "email", alias: "", transform: "lowercase" }
  ],

  // Filters
  filters: {
    condition: "AND", // AND | OR
    rules: [
      {
        id: "filter_123",
        field: "status",
        operator: "equals",
        value: "active",
        valueType: "static" // static, variable, parameter, field
      },
      {
        id: "filter_124",
        type: "group",
        condition: "OR",
        rules: [
          { field: "lastActivity", operator: "greaterThan", value: "2025-01-01", valueType: "static" }
        ]
      }
    ]
  },

  // Aggregations
  aggregations: [
    { id: "agg_1", function: "count", field: "id", alias: "total_contacts" }
  ],
  groupBy: ["status"],
  having: {
    condition: "AND",
    rules: [
      { field: "total_contacts", operator: "greaterThan", value: 10, valueType: "static" }
    ]
  },

  // Ordering & Limiting
  orderBy: [
    { field: "lastName", direction: "ASC" },
    { field: "firstName", direction: "ASC" }
  ],
  limit: 100,
  offset: 0,
  distinct: false,

  // Pagination
  enablePagination: true,
  pageSize: 20,

  // Advanced Options
  enableCache: true,
  cacheDuration: 300, // seconds
  timeout: 30, // seconds

  // Variables & Parameters
  parameters: [
    { name: "statusFilter", type: "string", defaultValue: "active", required: true }
  ],
  variables: {
    currentUserId: "user_id_variable"
  },

  // Output
  outputFormat: "json", // json, csv, xml
  transformScript: "" // JSONLex transformation
}
```

---

## Installation

### 1. Add JavaScript Files to Form Designer Pro

Add the following scripts to `/lowcode/views/form-designer-pro.ejs` before the closing `</body>` tag:

```html
<!-- Query Builder -->
<script src="/lowcode/js/form-query-builder.js"></script>
<script src="/lowcode/js/form-query-builder-ui.js"></script>
<script src="/lowcode/js/form-query-builder-ui-tabs.js"></script>
<script src="/lowcode/js/form-query-builder-ui-advanced.js"></script>
```

### 2. Add CSS

Add to the `<head>` section:

```html
<link rel="stylesheet" href="/lowcode/css/query-builder.css">
```

### 3. Add Backend Route

In `/lowcode/index.js`, add:

```javascript
const queryExecutor = require('./routes/queryExecutor');
app.use('/lowcode', queryExecutor);
```

### 4. Install Dependencies

```bash
cd src/exprsn-svr
npm install xml2js vm2 --save
```

### 5. Database Configuration

Ensure PostgreSQL connection is configured in `/lowcode/config/database.js`.

---

## Usage Guide

### Basic Workflow

1. **Create Query** → Click "New Query" button
2. **Select Datasource** → Choose from 10 types
3. **Configure Source** → Entity, URL, connection details, etc.
4. **Select Fields** → Drag fields from available to selected
5. **Add Filters** → Build filter rules with AND/OR logic
6. **Add Aggregations** (Optional) → COUNT, SUM, AVG, etc.
7. **Set Ordering** (Optional) → Sort by fields ASC/DESC
8. **Configure Limits** → Set max rows and pagination
9. **Preview & Test** → View SQL and test with sample data
10. **Save Query** → Save for reuse in forms/workflows

### Tab Guide

#### 1. Data Source Tab

**Purpose:** Configure where data comes from

**Steps:**
1. Click on datasource type card (Entity, Forge, REST, etc.)
2. Fill in configuration (table name, URL, credentials, etc.)
3. Click "Test Connection" (if available)

**Example - Entity:**
```
1. Select "Entity (Database Table)"
2. Choose entity: "Contacts"
3. Fields automatically loaded
```

**Example - REST API:**
```
1. Select "REST API"
2. URL: https://api.example.com/users
3. Method: GET
4. Headers: {"Authorization": "Bearer token123"}
5. Data Path: data.users
```

#### 2. Fields Tab

**Purpose:** Select which fields to return

**Features:**
- **Search Fields:** Filter available fields
- **Drag-and-Drop:** Reorder selected fields
- **Aliases:** Rename fields in output
- **Transformations:** Apply uppercase, lowercase, trim, date formatting
- **Select All / Clear All:** Quick selection

**Example:**
```
Available Fields:
- firstName     [+ Add]
- lastName      [+ Add]
- email         [+ Add]

Selected Fields:
- firstName → Alias: "first_name" → Transform: uppercase
- lastName  → Alias: "last_name"  → Transform: lowercase
- email     → Alias: ""           → Transform: lowercase
```

#### 3. Filters Tab

**Purpose:** Filter data with conditions

**Operators (14 total):**
- Comparison: equals, notEquals, greaterThan, greaterOrEqual, lessThan, lessOrEqual
- String: contains, notContains, startsWith, endsWith
- Array: in, notIn
- Null: isNull, isNotNull
- Boolean: isTrue, isFalse

**Value Types:**
- **Static:** Hard-coded value
- **Variable:** Form variable (e.g., `currentUserId`)
- **Parameter:** Query parameter (e.g., `$statusFilter`)
- **Field:** Reference another field (e.g., `createdDate`)

**Example - Simple Filter:**
```
WHERE status = 'active'

Filter:
- Field: status
- Operator: equals
- Value Type: static
- Value: active
```

**Example - Nested Filters:**
```
WHERE (status = 'active' AND lastLogin > '2025-01-01')
   OR role = 'admin'

Filters:
- Group (AND)
  - status equals 'active'
  - lastLogin greaterThan '2025-01-01'
- OR
- role equals 'admin'
```

#### 4. Aggregation Tab

**Purpose:** Summarize data with GROUP BY and aggregation functions

**Aggregation Functions:**
- `count`: Count rows
- `sum`: Sum numeric values
- `avg`: Average of values
- `min`: Minimum value
- `max`: Maximum value
- `countDistinct`: Count unique values
- `arrayAgg`: Aggregate into array
- `jsonAgg`: Aggregate into JSON

**Example:**
```sql
SELECT status, COUNT(id) as total, AVG(score) as avg_score
FROM contacts
GROUP BY status
HAVING COUNT(id) > 10
```

**Configuration:**
```
Group By: [status]

Aggregations:
- Function: count, Field: id, Alias: total
- Function: avg, Field: score, Alias: avg_score

Having:
- total greaterThan 10
```

#### 5. Order & Limit Tab

**Purpose:** Sort results and limit output

**Features:**
- **Order By:** Multi-field sorting (ASC/DESC)
- **Limit:** Max rows to return
- **Offset:** Skip rows (pagination)
- **Distinct:** Remove duplicates
- **Caching:** Enable result caching
- **Timeout:** Query timeout in seconds

**Example:**
```
Order By:
1. lastName ASC
2. firstName ASC

Limit: 100
Offset: 0

Options:
☑ Enable Pagination (Page Size: 20)
☑ Enable Result Caching (Duration: 300s)
☐ Return Distinct Rows Only
Timeout: 30 seconds
```

#### 6. Preview Tab

**Purpose:** Test query and view results

**Features:**
- **Generated SQL:** View/copy SQL query
- **Query Summary:** Quick stats (fields, filters, grouping, etc.)
- **Test Query:** Run with LIMIT 10
- **Full Query:** Execute complete query
- **Results Table:** Interactive data grid

**Example Output:**
```
Generated SQL:
────────────────────────────────────
SELECT "firstName", "lastName", "email"
FROM "contacts"
WHERE "status" = 'active'
ORDER BY "lastName" ASC
LIMIT 100
────────────────────────────────────

Query Summary:
• Data Source: Entity (Database Table)
• Selected Fields: 3 fields
• Filters: 1 filter rules
• Grouping: 0 fields
• Aggregations: 0 functions
• Ordering: 1 fields
• Result Limit: 100

Test Query Results:
10 rows returned in 23ms
┌────────────┬───────────┬─────────────────────┐
│ firstName  │ lastName  │ email               │
├────────────┼───────────┼─────────────────────┤
│ JOHN       │ doe       │ john.doe@email.com  │
│ JANE       │ smith     │ jane.smith@email.com│
└────────────┴───────────┴─────────────────────┘
```

---

## Datasource Types

### 1. Entity (Database Table)

**Use Case:** Query tables created in Entity Designer

**Configuration:**
```javascript
{
  type: "entity",
  config: {
    entityId: "uuid-of-entity",
    entityName: "contacts" // Auto-populated
  }
}
```

**Features:**
- ✅ Full SQL support (filters, aggregations, joins)
- ✅ Automatic field detection
- ✅ Index-optimized queries
- ✅ Transaction support

---

### 2. Forge CRM/ERP

**Use Case:** Query Forge modules (CRM, Groupware, ERP)

**Supported Modules:**
- contacts
- accounts
- leads
- opportunities
- cases
- tasks

**Configuration:**
```javascript
{
  type: "forge",
  config: {
    module: "contacts"
  }
}
```

**Example:**
```sql
SELECT firstName, lastName, email, accountId
FROM forge_contacts
WHERE status = 'active'
ORDER BY lastName ASC
```

---

### 3. Database (Direct SQL)

**Use Case:** Query any table in the application database

**Configuration:**
```javascript
{
  type: "database",
  config: {
    connection: "default", // or "custom"
    table: "custom_users"
  }
}
```

**Security:** Queries are parameterized to prevent SQL injection

---

### 4. REST API

**Use Case:** Fetch data from external APIs

**Configuration:**
```javascript
{
  type: "rest",
  config: {
    url: "https://api.example.com/users",
    method: "GET", // or "POST"
    headers: {
      "Authorization": "Bearer token123",
      "Content-Type": "application/json"
    },
    dataPath: "data.users" // JSONPath to array
  }
}
```

**Example:**
```javascript
// API Response:
{
  "success": true,
  "data": {
    "users": [
      { "id": 1, "name": "John" },
      { "id": 2, "name": "Jane" }
    ]
  }
}

// dataPath: "data.users" extracts the array
```

---

### 5. JSON File/URL

**Use Case:** Load data from JSON files or endpoints

**Configuration (URL):**
```javascript
{
  type: "json",
  config: {
    sourceType: "url",
    url: "https://example.com/data.json"
  }
}
```

**Configuration (Inline):**
```javascript
{
  type: "json",
  config: {
    sourceType: "inline",
    data: '[{"id": 1, "name": "Item 1"}, {"id": 2, "name": "Item 2"}]'
  }
}
```

---

### 6. XML File/URL

**Use Case:** Parse and query XML data

**Configuration:**
```javascript
{
  type: "xml",
  config: {
    sourceType: "url",
    url: "https://example.com/data.xml",
    xpath: "/items/item" // Path to array items
  }
}
```

**Example XML:**
```xml
<items>
  <item id="1">
    <name>Item 1</name>
    <price>10.00</price>
  </item>
  <item id="2">
    <name>Item 2</name>
    <price>20.00</price>
  </item>
</items>
```

**XPath:** `/items/item` → Returns array of `<item>` objects

---

### 7. JSONLex Expression

**Use Case:** Transform data using JSONLex (JavaScript-like) expressions

**Configuration:**
```javascript
{
  type: "jsonlex",
  config: {
    expression: `
      return data
        .filter(item => item.active === true)
        .map(item => ({
          id: item.id,
          fullName: item.firstName + ' ' + item.lastName,
          email: item.email.toLowerCase()
        }));
    `,
    inputSource: "variable:myDataArray"
  }
}
```

**Features:**
- ✅ Full JavaScript array methods (filter, map, reduce, etc.)
- ✅ Sandboxed execution (VM2)
- ✅ Access to context variables
- ✅ Async/await support

---

### 8. Redis Cache

**Use Case:** Query data from Redis cache

**Configuration:**
```javascript
{
  type: "redis",
  config: {
    key: "myapp:users:*", // Pattern with wildcard
    dataType: "hash" // string, hash, list, set, zset
  }
}
```

**Data Types:**
- **string:** Single value (JSON parsed if possible)
- **hash:** Key-value pairs
- **list:** Array of items
- **set:** Unique items
- **zset:** Sorted set with scores

**Example Output:**
```javascript
[
  { key: "myapp:users:1", value: { name: "John", email: "john@example.com" } },
  { key: "myapp:users:2", value: { name: "Jane", email: "jane@example.com" } }
]
```

---

### 9. Form Variable

**Use Case:** Query data stored in form variables

**Configuration:**
```javascript
{
  type: "variable",
  config: {
    variableName: "contactsArray"
  }
}
```

**Requirements:**
- Variable must exist in form state
- Variable must contain an array of objects

**Example:**
```javascript
// Form variable "contactsArray"
[
  { id: 1, name: "John", status: "active" },
  { id: 2, name: "Jane", status: "inactive" }
]

// Query filters, sorts, limits just like any datasource
```

---

### 10. Custom Code

**Use Case:** Write custom JavaScript to fetch data

**Configuration:**
```javascript
{
  type: "custom",
  config: {
    code: `
      async function getData(context) {
        // Custom logic here
        const results = await fetch('https://api.example.com/data');
        const data = await results.json();

        // Must return array of objects
        return data.items;
      }
    `
  }
}
```

**Available in Context:**
- `context.formId`
- `context.appId`
- `context.variables`
- `context.user`
- `console` (for debugging)
- `require` (limited modules)

**Security:** Code runs in VM2 sandbox with timeout

---

## Filter Builder

### Operators Reference

| Operator | Symbol | Types | Example |
|----------|--------|-------|---------|
| equals | = | all | `status = 'active'` |
| notEquals | != | all | `status != 'deleted'` |
| greaterThan | > | number, date | `score > 80` |
| greaterOrEqual | >= | number, date | `age >= 18` |
| lessThan | < | number, date | `price < 100` |
| lessOrEqual | <= | number, date | `quantity <= 50` |
| contains | LIKE %...% | string | `name LIKE '%john%'` |
| notContains | NOT LIKE | string | `email NOT LIKE '%@spam.com'` |
| startsWith | LIKE ...% | string | `code LIKE 'USA%'` |
| endsWith | LIKE %... | string | `email LIKE '%@company.com'` |
| in | IN (...) | string, number | `status IN ('active', 'pending')` |
| notIn | NOT IN (...) | string, number | `id NOT IN (1, 2, 3)` |
| isNull | IS NULL | all | `deletedAt IS NULL` |
| isNotNull | IS NOT NULL | all | `completedAt IS NOT NULL` |
| isTrue | = true | boolean | `isActive = true` |
| isFalse | = false | boolean | `isArchived = false` |

### Nested Filter Groups

**Example:** Complex business logic

```
(Department = 'Sales' AND (Status = 'Active' OR HireDate > '2024-01-01'))
AND Salary > 50000
```

**Configuration:**
```
Filter Group (AND)
├─ Filter Group (AND)
│  ├─ department equals 'Sales'
│  └─ Filter Group (OR)
│     ├─ status equals 'Active'
│     └─ hireDate greaterThan '2024-01-01'
└─ salary greaterThan 50000
```

### Variable Binding in Filters

**Use Case:** Dynamic filters based on user input

**Example:**
```javascript
// Form has variable: currentUserId = "user-123"

Filter:
- Field: ownerId
- Operator: equals
- Value Type: variable
- Value Source: currentUserId

// Generated SQL:
WHERE "ownerId" = 'user-123'
```

**Field References:**
```javascript
// Compare two fields
Filter:
- Field: startDate
- Operator: lessThan
- Value Type: field
- Value Source: endDate

// Generated SQL:
WHERE "startDate" < "endDate"
```

---

## Aggregations

### GROUP BY Examples

#### Example 1: Count by Status

**Query:**
```sql
SELECT status, COUNT(id) as total
FROM contacts
GROUP BY status
ORDER BY total DESC
```

**Configuration:**
```
Group By: [status]
Aggregations:
- Function: count, Field: id, Alias: total
Order By: total DESC
```

**Result:**
```
┌──────────┬───────┐
│ status   │ total │
├──────────┼───────┤
│ active   │ 150   │
│ inactive │ 45    │
│ pending  │ 23    │
└──────────┴───────┘
```

#### Example 2: Sales by Region

**Query:**
```sql
SELECT region, SUM(amount) as total_sales, AVG(amount) as avg_sale
FROM orders
GROUP BY region
HAVING SUM(amount) > 10000
ORDER BY total_sales DESC
```

**Configuration:**
```
Group By: [region]
Aggregations:
- Function: sum, Field: amount, Alias: total_sales
- Function: avg, Field: amount, Alias: avg_sale
Having:
- total_sales greaterThan 10000
Order By: total_sales DESC
```

#### Example 3: JSON Aggregation

**Query:**
```sql
SELECT category, JSON_AGG(product) as products
FROM products
GROUP BY category
```

**Configuration:**
```
Group By: [category]
Aggregations:
- Function: jsonAgg, Field: product, Alias: products
```

**Result:**
```json
[
  {
    "category": "Electronics",
    "products": [
      {"id": 1, "name": "Laptop"},
      {"id": 2, "name": "Phone"}
    ]
  }
]
```

---

## API Reference

### Execute Query Endpoint

**POST** `/lowcode/api/query/execute`

**Request:**
```javascript
{
  "query": {
    // Query object (see Data Model section)
  },
  "options": {
    "limit": 10,      // Optional: Override query limit
    "preview": true   // Optional: Disable caching
  },
  "context": {
    "formId": "form-123",
    "appId": "app-456",
    "variables": {
      "userId": "user-789"
    },
    "user": {
      "id": "user-789",
      "roles": ["admin"]
    }
  }
}
```

**Response (Success):**
```javascript
{
  "success": true,
  "data": {
    "rows": [
      { "id": 1, "name": "John", "email": "john@example.com" },
      { "id": 2, "name": "Jane", "email": "jane@example.com" }
    ],
    "rowCount": 2,
    "executionTime": 45, // milliseconds
    "cached": false
  }
}
```

**Response (Error):**
```javascript
{
  "success": false,
  "error": "EXECUTION_ERROR",
  "message": "Table not found: unknown_table"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `INVALID_QUERY` | Query object missing or malformed |
| `EXECUTION_ERROR` | Query execution failed |
| `TIMEOUT_ERROR` | Query exceeded timeout limit |
| `PERMISSION_DENIED` | User lacks permission to access datasource |
| `DATASOURCE_ERROR` | Datasource configuration invalid |

---

## Examples

### Example 1: Basic Entity Query

**Scenario:** Get all active contacts

```javascript
const query = {
  name: "Active Contacts",
  datasource: {
    type: "entity",
    config: {
      entityId: "contacts-uuid",
      entityName: "contacts"
    }
  },
  fields: [
    { name: "firstName", alias: "" },
    { name: "lastName", alias: "" },
    { name: "email", alias: "" }
  ],
  filters: {
    condition: "AND",
    rules: [
      { field: "status", operator: "equals", value: "active", valueType: "static" }
    ]
  },
  orderBy: [
    { field: "lastName", direction: "ASC" }
  ],
  limit: 100
};
```

**Generated SQL:**
```sql
SELECT "firstName", "lastName", "email"
FROM "contacts"
WHERE "status" = 'active'
ORDER BY "lastName" ASC
LIMIT 100
```

---

### Example 2: REST API with Transformation

**Scenario:** Fetch users from external API and filter locally

```javascript
const query = {
  name: "External API Users",
  datasource: {
    type: "rest",
    config: {
      url: "https://jsonplaceholder.typicode.com/users",
      method: "GET",
      headers: {},
      dataPath: "" // Response is array at root
    }
  },
  fields: [
    { name: "name", alias: "fullName" },
    { name: "email", alias: "", transform: "lowercase" },
    { name: "company.name", alias: "company" }
  ],
  filters: {
    condition: "AND",
    rules: [
      { field: "email", operator: "endsWith", value: ".com", valueType: "static" }
    ]
  },
  limit: 10
};
```

**Result:**
```json
[
  {
    "fullName": "Leanne Graham",
    "email": "leanne@example.com",
    "company": "Romaguera-Crona"
  }
]
```

---

### Example 3: Aggregated Sales Report

**Scenario:** Total sales by region with filters

```javascript
const query = {
  name: "Regional Sales Report",
  datasource: {
    type: "forge",
    config: {
      module: "opportunities"
    }
  },
  fields: [],
  filters: {
    condition: "AND",
    rules: [
      { field: "stage", operator: "equals", value: "Closed Won", valueType: "static" },
      { field: "closeDate", operator: "greaterThan", value: "2025-01-01", valueType: "static" }
    ]
  },
  groupBy: ["region"],
  aggregations: [
    { function: "count", field: "id", alias: "deals_count" },
    { function: "sum", field: "amount", alias: "total_revenue" },
    { function: "avg", field: "amount", alias: "avg_deal_size" }
  ],
  having: {
    condition: "AND",
    rules: [
      { field: "total_revenue", operator: "greaterThan", value: 100000, valueType: "static" }
    ]
  },
  orderBy: [
    { field: "total_revenue", direction: "DESC" }
  ]
};
```

**Generated SQL:**
```sql
SELECT "region",
       COUNT("id") AS "deals_count",
       SUM("amount") AS "total_revenue",
       AVG("amount") AS "avg_deal_size"
FROM "forge_opportunities"
WHERE "stage" = 'Closed Won'
  AND "closeDate" > '2025-01-01'
GROUP BY "region"
HAVING SUM("amount") > 100000
ORDER BY "total_revenue" DESC
```

**Result:**
```
┌───────────┬─────────────┬────────────────┬───────────────┐
│ region    │ deals_count │ total_revenue  │ avg_deal_size │
├───────────┼─────────────┼────────────────┼───────────────┤
│ West      │ 45          │ 2,450,000      │ 54,444        │
│ East      │ 38          │ 1,890,000      │ 49,737        │
│ Central   │ 22          │ 1,250,000      │ 56,818        │
└───────────┴─────────────┴────────────────┴───────────────┘
```

---

### Example 4: JSONLex Data Transformation

**Scenario:** Transform and enrich contact data

```javascript
const query = {
  name: "Enriched Contacts",
  datasource: {
    type: "jsonlex",
    config: {
      expression: `
        return data.map(contact => {
          // Calculate account age
          const accountAge = Math.floor(
            (Date.now() - new Date(contact.createdAt)) / (1000 * 60 * 60 * 24 * 365)
          );

          // Determine status label
          let statusLabel = 'Unknown';
          if (contact.lastActivity) {
            const daysSinceActivity = Math.floor(
              (Date.now() - new Date(contact.lastActivity)) / (1000 * 60 * 60 * 24)
            );
            statusLabel = daysSinceActivity < 30 ? 'Active' : 'Inactive';
          }

          return {
            id: contact.id,
            fullName: \`\${contact.firstName} \${contact.lastName}\`,
            email: contact.email.toLowerCase(),
            accountAge: accountAge,
            statusLabel: statusLabel,
            score: contact.score || 0
          };
        }).filter(c => c.score > 50);
      `,
      inputSource: "variable:rawContacts"
    }
  },
  orderBy: [
    { field: "score", direction: "DESC" }
  ],
  limit: 20
};
```

---

### Example 5: Redis Cache Query

**Scenario:** Get user session data from Redis

```javascript
const query = {
  name: "Active User Sessions",
  datasource: {
    type: "redis",
    config: {
      key: "session:*",
      dataType: "hash"
    }
  },
  filters: {
    condition: "AND",
    rules: [
      { field: "value.isActive", operator: "isTrue", valueType: "static" }
    ]
  },
  limit: 100
};
```

---

## Troubleshooting

### Common Issues

#### 1. "Query execution failed: Table not found"

**Cause:** Entity/table doesn't exist or name is incorrect

**Solution:**
- Verify entity exists in Entity Designer
- Check table name spelling
- Ensure migrations have been run: `npx sequelize-cli db:migrate`

#### 2. "API response is not an array"

**Cause:** REST API returning object instead of array

**Solution:**
- Use `dataPath` to navigate to array in response
- Example: If response is `{ "data": { "users": [...] } }`, set `dataPath` to `"data.users"`

#### 3. "JSONLex expression must return an array"

**Cause:** JSONLex code not returning array

**Solution:**
```javascript
// ❌ Wrong
return data[0];

// ✅ Correct
return [data[0]];

// ✅ Best
return data.filter(item => condition);
```

#### 4. "Redis is not enabled"

**Cause:** Redis not configured

**Solution:**
```bash
# .env
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# Start Redis
redis-server
```

#### 5. Query timeout

**Cause:** Query taking too long

**Solution:**
- Increase timeout in "Order & Limit" tab
- Add indexes to filtered/sorted fields
- Reduce limit
- Enable caching for repeated queries

#### 6. "Variable not found"

**Cause:** Form variable doesn't exist

**Solution:**
- Create variable in Variables tab first
- Ensure variable name matches exactly
- Check variable scope (form, session, workflow, global)

---

## Performance Optimization

### Best Practices

1. **Use Indexes** (Entity/Database queries)
   - Add indexes to filtered fields
   - Add composite indexes for multi-field sorts
   - Check with: `EXPLAIN ANALYZE <query>`

2. **Limit Results**
   - Always set reasonable limits (100-1000 rows)
   - Use pagination for large datasets
   - Use offset for "load more" functionality

3. **Enable Caching**
   - Cache static/slow queries
   - Set appropriate cache duration (5-60 minutes)
   - Disable cache for real-time data

4. **Optimize Aggregations**
   - Filter before aggregating (WHERE before GROUP BY)
   - Use HAVING only when necessary
   - Limit grouped results

5. **REST API Optimization**
   - Use appropriate `dataPath` to extract only needed data
   - Cache API responses
   - Consider webhooks for real-time data

---

## Security Considerations

### SQL Injection Prevention

✅ **All SQL queries are parameterized** - User input is never concatenated into SQL strings

### XSS Protection

✅ **All output is escaped** - Results are sanitized before display

### Code Execution (JSONLex/Custom)

✅ **VM2 Sandboxing** - Custom code runs in isolated environment with:
- Timeout limits (default 30s)
- Limited module access
- No file system access
- No network access (unless explicitly allowed)

### Permission Checks

Recommended implementation:

```javascript
// In queryExecutor.js
router.post('/api/query/execute', validateCAToken, async (req, res) => {
  // Check user has permission to access datasource
  const hasPermission = await checkQueryPermission(req.user, req.body.query);
  if (!hasPermission) {
    return res.status(403).json({
      success: false,
      error: 'PERMISSION_DENIED',
      message: 'User lacks permission to execute this query'
    });
  }

  // Execute query...
});
```

---

## Integration with Form Designer

### Using Queries in Forms

1. **Data Binding**
   - Bind query results to dropdowns, grids, charts
   - Auto-refresh on form load or variable change

2. **Event Handlers**
   - Execute query on button click
   - Refresh query on form submit
   - Filter query based on form inputs

3. **Variables**
   - Use form variables as filter values
   - Store query results in variables
   - Chain queries (output of one → input of another)

### Example: Dynamic Dropdown

```javascript
// Query: Get active categories
const categoriesQuery = {
  name: "Categories Dropdown",
  datasource: { type: "entity", config: { entityName: "categories" } },
  fields: [
    { name: "id", alias: "value" },
    { name: "name", alias: "label" }
  ],
  filters: {
    rules: [{ field: "active", operator: "isTrue" }]
  },
  orderBy: [{ field: "name", direction: "ASC" }]
};

// Bind to dropdown component
dropdown.dataSource = categoriesQuery;
dropdown.valueField = "value";
dropdown.labelField = "label";
```

---

## Conclusion

The Visual Query Builder is a **production-ready, enterprise-grade query interface** that rivals commercial low-code platforms. With support for 10 datasource types, visual filter building, aggregations, and advanced features like caching and variable binding, it empowers users to build complex queries without writing code.

**Next Steps:**
1. Explore the [Examples](#examples) section
2. Build your first query following the [Usage Guide](#usage-guide)
3. Integrate queries into forms for dynamic data binding
4. Review [Performance Optimization](#performance-optimization) for large datasets

**Support:**
- Documentation: This file
- Code: `/lowcode/public/js/form-query-builder*.js`
- Backend: `/lowcode/routes/queryExecutor.js`
- Issues: GitHub or contact engineering@exprsn.com

---

**Version History:**
- v1.0.0 (Dec 26, 2025): Initial release with all 10 datasource types
