# Visual Query Builder - Complete Guide

## Overview

The Visual Query Builder is a powerful, user-friendly interface for creating complex data queries without writing code. It supports multiple datasource types, advanced filtering, aggregations, and comprehensive query configuration.

**Access:** Low-Code Platform → Applications → [Your App] → Visual Queries tile

---

## Features

### ✅ **Fully Implemented Features**

1. **Datasource Selection**
   - Entity (Low-Code entities)
   - REST API (external APIs)
   - JSON (JSON data or files)
   - Database (direct SQL queries)

2. **Advanced Filter Builder**
   - Nested AND/OR logic groups
   - 16 operator types (=, !=, >, <, LIKE, IN, etc.)
   - Field, literal, and variable value types
   - Visual group nesting with drag-drop support

3. **Comprehensive Aggregation System**
   - 11 aggregation functions (COUNT, SUM, AVG, MIN, MAX, etc.)
   - GROUP BY with multiple fields
   - HAVING clause support
   - Field aliasing for aggregations

4. **Advanced Sorting & Pagination**
   - Multi-field ORDER BY with ASC/DESC
   - LIMIT and OFFSET controls
   - DISTINCT results option
   - Query result caching with configurable duration

5. **Field Selection**
   - Add/remove individual fields
   - Field aliasing
   - SELECT * support when no fields specified

6. **Preview & Testing**
   - Configuration summary dashboard
   - Query validation with warnings/errors
   - JSON export with copy-to-clipboard
   - SQL generation (approximate)
   - Query explanation
   - Test execution with live results

---

## User Interface

### Tab Structure

```
┌─────────────────────────────────────────────────┐
│  [Datasource] [Fields] [Filters] [Aggregation]  │
│  [Order & Limit] [Preview]                      │
└─────────────────────────────────────────────────┘
```

---

## Tab Reference

### 1. Datasource Tab

**Purpose:** Select and configure the data source for your query.

**Available Datasource Types:**

| Type       | Description                          | Configuration Required      |
|------------|--------------------------------------|-----------------------------|
| Entity     | Low-Code platform entities          | None                        |
| REST API   | External HTTP/HTTPS endpoints       | URL, Method (GET/POST)      |
| JSON       | Static JSON data or file URL        | JSON data or file path      |
| Database   | Direct database queries             | Connection details (future) |

**Example - REST API Configuration:**
```javascript
{
  "type": "rest",
  "config": {
    "url": "https://api.example.com/users",
    "method": "GET"
  }
}
```

---

### 2. Fields Tab

**Purpose:** Select specific fields to return in query results.

**Features:**
- ✅ Add unlimited fields
- ✅ Rename fields with aliases
- ✅ Omit all fields to return everything (SELECT *)

**Example:**
```javascript
{
  "fields": [
    { "name": "id", "alias": "" },
    { "name": "firstName", "alias": "first_name" },
    { "name": "lastName", "alias": "last_name" },
    { "name": "email", "alias": "" }
  ]
}
```

**UI Actions:**
- **Add Field** - Adds new field selector
- **Field Name** - Enter exact field name from datasource
- **Alias** - Optional rename for result set
- **Remove** - Delete field from selection

---

### 3. Filters Tab

**Purpose:** Create complex filtering conditions with AND/OR logic.

**Filter Structure:**
```
┌─────────────────────────────────────────────────┐
│  [AND] [OR]                                     │
│  ┌──────────────────────────────────────────┐   │
│  │ Field: "age"  Operator: ">" Value: "18"  │   │
│  └──────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────┐   │
│  │ Field: "status" Operator: "=" Value: "..." │ │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

**Operators Supported:**

| Category      | Operators                                    |
|---------------|----------------------------------------------|
| Comparison    | =, !=, >, >=, <, <=                         |
| Pattern       | LIKE, NOT LIKE, CONTAINS, STARTS_WITH, ENDS_WITH |
| Set           | IN, NOT IN                                   |
| Range         | BETWEEN                                      |
| Null Check    | IS NULL, IS NOT NULL                         |

**Value Types:**
- **Literal** - Static value (e.g., `"John"`, `25`)
- **Field** - Reference to another field (e.g., `created_date`)
- **Variable** - Reference to workflow variable (e.g., `$userId`)

**Nested Groups:**
Filter groups can contain other groups for complex logic:

```javascript
{
  "condition": "AND",
  "rules": [
    {
      "type": "rule",
      "field": "status",
      "operator": "=",
      "value": "active",
      "valueType": "literal"
    },
    {
      "type": "group",
      "condition": "OR",
      "rules": [
        {
          "type": "rule",
          "field": "age",
          "operator": ">",
          "value": "18",
          "valueType": "literal"
        },
        {
          "type": "rule",
          "field": "verified",
          "operator": "=",
          "value": "true",
          "valueType": "literal"
        }
      ]
    }
  ]
}
```

**SQL Equivalent:**
```sql
WHERE status = 'active' AND (age > 18 OR verified = true)
```

**UI Actions:**
- **Add Rule** - Add new filter condition
- **Add Group** - Create nested AND/OR group
- **AND/OR Toggle** - Switch group logic
- **Remove** - Delete rule or group

---

### 4. Aggregation Tab

**Purpose:** Group data and apply aggregate functions.

#### Group By Section

Group results by one or more fields to enable aggregations.

**Example:**
```javascript
{
  "groupBy": [
    { "field": "department" },
    { "field": "location" }
  ]
}
```

**SQL Equivalent:**
```sql
GROUP BY department, location
```

#### Aggregations Section

Apply mathematical or statistical functions to grouped data.

**Available Functions:**

| Function        | Description                          | Example                    |
|-----------------|--------------------------------------|----------------------------|
| COUNT           | Count rows                           | COUNT(*)                   |
| SUM             | Sum numeric values                   | SUM(salary)                |
| AVG             | Average value                        | AVG(age)                   |
| MIN             | Minimum value                        | MIN(join_date)             |
| MAX             | Maximum value                        | MAX(salary)                |
| COUNT_DISTINCT  | Count unique values                  | COUNT(DISTINCT department) |
| STDDEV          | Standard deviation                   | STDDEV(salary)             |
| VARIANCE        | Variance                             | VARIANCE(age)              |
| MEDIAN          | Median value                         | MEDIAN(score)              |
| FIRST           | First value in group                 | FIRST(created_at)          |
| LAST            | Last value in group                  | LAST(updated_at)           |

**Example Configuration:**
```javascript
{
  "aggregations": [
    {
      "function": "COUNT",
      "field": "*",
      "alias": "total_employees"
    },
    {
      "function": "AVG",
      "field": "salary",
      "alias": "average_salary"
    },
    {
      "function": "MAX",
      "field": "salary",
      "alias": "highest_salary"
    }
  ]
}
```

**SQL Equivalent:**
```sql
SELECT department,
       COUNT(*) as total_employees,
       AVG(salary) as average_salary,
       MAX(salary) as highest_salary
FROM employees
GROUP BY department
```

#### HAVING Clause

Filter aggregated results (like WHERE but for aggregated data).

**Example:**
```javascript
{
  "having": {
    "condition": "simple",
    "field": "COUNT(*)",
    "operator": ">",
    "value": "5"
  }
}
```

**SQL Equivalent:**
```sql
HAVING COUNT(*) > 5
```

**Use Case:** Find departments with more than 5 employees, or groups with average salary above $75,000.

---

### 5. Order & Limit Tab

#### Sorting (ORDER BY)

Sort results by one or more fields.

**Example:**
```javascript
{
  "orderBy": [
    { "field": "last_name", "direction": "ASC" },
    { "field": "first_name", "direction": "ASC" },
    { "field": "created_at", "direction": "DESC" }
  ]
}
```

**SQL Equivalent:**
```sql
ORDER BY last_name ASC, first_name ASC, created_at DESC
```

**Sort Priority:** Fields are applied in order - first field is primary sort, second is tie-breaker, etc.

#### Pagination

Control how many rows are returned and which rows to skip.

| Parameter | Description                              | Default | Range      |
|-----------|------------------------------------------|---------|------------|
| Limit     | Maximum rows to return                   | 100     | 1-10,000   |
| Offset    | Number of rows to skip before returning  | 0       | 0-∞        |

**Example - Page 3 with 20 items per page:**
```javascript
{
  "limit": 20,
  "offset": 40  // Skip first 40 rows (page 1 & 2)
}
```

#### Distinct Results

Remove duplicate rows from results.

```javascript
{
  "distinct": true
}
```

**SQL Equivalent:**
```sql
SELECT DISTINCT ...
```

**Use Case:** Get unique list of departments, cities, or categories.

#### Query Result Caching

Improve performance by caching query results.

```javascript
{
  "enableCache": true,
  "cacheDuration": 300  // 5 minutes in seconds (60-3600 range)
}
```

**Benefits:**
- ⚡ Faster response times for repeated queries
- 📉 Reduced database load
- 💰 Lower API costs for external datasources

**Recommendations:**
- **60-300s** - Rapidly changing data (user activity, real-time metrics)
- **300-900s** - Moderately static data (product catalogs, inventory)
- **900-3600s** - Mostly static data (configuration, lookup tables)

---

### 6. Preview Tab

**Purpose:** Review, validate, and test your query before saving.

#### Configuration Summary

Two-column dashboard showing:
- Datasource type
- Fields selected count
- Filter rules count
- GROUP BY fields count
- Aggregations count
- ORDER BY fields count
- Pagination settings
- Enabled options (DISTINCT, CACHED)

#### Validation Status

Automatic validation with three states:

**✅ Valid (Green):**
```
✓ Query configuration is valid and ready to execute
```

**⚠️ Warnings (Yellow):**
- No fields selected (will return all fields)
- Aggregations without GROUP BY
- HAVING clause without aggregations

**❌ Issues (Red):**
- No datasource selected
- Invalid configuration

#### Query JSON

View complete query configuration in JSON format with:
- ✅ Syntax highlighting (dark theme)
- ✅ Pretty formatting (2-space indentation)
- ✅ Copy to clipboard button
- ✅ Scrollable for large queries

#### Test Execution Buttons

| Button           | Action                                           |
|------------------|--------------------------------------------------|
| Test Query       | Execute query and display results                |
| Generate SQL     | Show approximate SQL equivalent                  |
| Explain Query    | Display human-readable query execution plan      |

---

## Complete Query Example

**Scenario:** Find departments with more than 5 employees, show average salary, sorted by average salary descending.

```javascript
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Department Salary Analysis",
  "description": "Find high-headcount departments with salary stats",
  "datasource": {
    "type": "entity",
    "config": {}
  },
  "fields": [
    { "name": "department", "alias": "dept_name" }
  ],
  "filters": {
    "condition": "AND",
    "rules": [
      {
        "type": "rule",
        "field": "status",
        "operator": "=",
        "value": "active",
        "valueType": "literal"
      }
    ]
  },
  "groupBy": [
    { "field": "department" }
  ],
  "aggregations": [
    {
      "function": "COUNT",
      "field": "*",
      "alias": "employee_count"
    },
    {
      "function": "AVG",
      "field": "salary",
      "alias": "avg_salary"
    }
  ],
  "having": {
    "condition": "simple",
    "field": "COUNT(*)",
    "operator": ">",
    "value": "5"
  },
  "orderBy": [
    { "field": "avg_salary", "direction": "DESC" }
  ],
  "limit": 10,
  "offset": 0,
  "distinct": false,
  "enableCache": true,
  "cacheDuration": 300
}
```

**SQL Equivalent:**
```sql
SELECT
  department as dept_name,
  COUNT(*) as employee_count,
  AVG(salary) as avg_salary
FROM employees
WHERE status = 'active'
GROUP BY department
HAVING COUNT(*) > 5
ORDER BY avg_salary DESC
LIMIT 10
```

---

## API Integration

### Save Query

```http
POST /lowcode/api/queries
Content-Type: application/json

{
  "id": "uuid-v4",
  "applicationId": "app-uuid",
  "name": "Query Name",
  "description": "Query description",
  ...query configuration...
}
```

### Update Query

```http
PUT /lowcode/api/queries/{queryId}
Content-Type: application/json

{
  ...updated query configuration...
}
```

### Execute Query

```http
POST /lowcode/api/query/execute
Content-Type: application/json

{
  "query": { ...query configuration... },
  "options": {
    "preview": true,
    "limit": 10
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "rows": [...],
    "rowCount": 42,
    "executionTime": 125,
    "cached": false
  }
}
```

---

## Best Practices

### ✅ Performance Optimization

1. **Use Specific Fields:** Only select fields you need instead of SELECT *
2. **Add Indexes:** Ensure filtered/sorted fields have database indexes
3. **Limit Results:** Always use LIMIT, especially for large datasets
4. **Enable Caching:** Cache stable data to reduce database load
5. **Minimize Joins:** Use aggregations instead of multiple datasources when possible

### ✅ Filter Efficiency

1. **Filter Early:** Apply most restrictive filters first
2. **Use Indexes:** Filter on indexed columns when possible
3. **Avoid LIKE '%term%':** Use STARTS_WITH instead when applicable
4. **Leverage IN:** Better than multiple OR conditions

### ✅ Aggregation Tips

1. **Always Use GROUP BY:** Required for meaningful aggregations
2. **Alias Everything:** Use aliases for calculated fields
3. **HAVING vs WHERE:** Use WHERE for pre-aggregation filtering, HAVING for post-aggregation

### ✅ Common Pitfalls

| Issue                                  | Solution                                    |
|----------------------------------------|---------------------------------------------|
| Aggregation without GROUP BY           | Add GROUP BY fields or remove aggregations  |
| HAVING without aggregations            | Use WHERE instead                           |
| Too many results                       | Add LIMIT or more restrictive filters       |
| Slow query performance                 | Enable caching, add indexes, reduce fields  |

---

## Keyboard Shortcuts

| Shortcut         | Action                          |
|------------------|---------------------------------|
| `Ctrl/Cmd + S`   | Save query                      |
| `Ctrl/Cmd + Enter`| Test query execution           |
| `Tab`            | Navigate between fields         |
| `Escape`         | Close modals/dialogs            |

---

## Troubleshooting

### Query Won't Save

**Check:**
- ✅ Query has a name
- ✅ Datasource is selected
- ✅ No validation errors in Preview tab

### Query Returns No Results

**Check:**
- ✅ Filters are not too restrictive
- ✅ Datasource contains data
- ✅ Field names are correct (case-sensitive)

### Query Returns Wrong Results

**Check:**
- ✅ Filter logic (AND vs OR)
- ✅ GROUP BY fields match aggregations
- ✅ HAVING clause conditions
- ✅ ORDER BY direction (ASC vs DESC)

### Performance Issues

**Check:**
- ✅ LIMIT is set to reasonable value
- ✅ Caching is enabled for stable data
- ✅ Filtered fields have database indexes
- ✅ Not selecting too many fields

---

## Future Enhancements

**Planned Features:**
- 🔄 Visual relationship/join builder
- 🔄 Subquery support
- 🔄 Custom expression builder (JSONLex integration)
- 🔄 Query templates library
- 🔄 Scheduled query execution
- 🔄 Export to CSV/Excel
- 🔄 Query performance analyzer
- 🔄 Visual query plan viewer

---

## Support

For additional help:
- 📖 Review this documentation
- 🎯 Check Preview tab validation messages
- 🧪 Use "Explain Query" button to understand execution
- 💡 Examine "Generate SQL" output for SQL equivalent

---

**Version:** 1.0.0 (December 2024)
**File:** `/Users/rickholland/Downloads/Exprsn/src/exprsn-svr/lowcode/VISUAL_QUERY_BUILDER_GUIDE.md`
