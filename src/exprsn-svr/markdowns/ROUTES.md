# Exprsn Low-Code Platform - Routes Reference

**Version:** 1.0.0
**Last Updated:** 2024-12-24
**Base Path:** `/lowcode`

This document provides a comprehensive reference for all routes in the Exprsn Low-Code Platform, including API endpoints and view routes.

---

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [API Routes](#api-routes)
  - [Applications](#applications)
  - [Entities](#entities)
  - [Forms](#forms)
  - [Grids](#grids)
  - [Processes](#processes)
  - [Charts](#charts)
  - [Dashboards](#dashboards)
  - [Automation](#automation)
  - [Settings](#settings)
  - [Runtime](#runtime)
  - [Other Resources](#other-resources)
- [View Routes](#view-routes)
  - [Designers](#designers)
  - [Monitors & Viewers](#monitors--viewers)
  - [Application Runner](#application-runner)
- [Response Format](#response-format)
- [Error Codes](#error-codes)

---

## Overview

The Low-Code Platform provides two types of routes:

1. **API Routes** (`/lowcode/api/*`) - RESTful endpoints for CRUD operations
2. **View Routes** (`/lowcode/*`) - Web pages for designers and viewers

All routes follow consistent patterns for authentication, request/response formats, and error handling.

---

## Authentication

### CA Token Authentication

**All API routes** (except `/health` and `/`) require CA Token authentication.

**Headers:**
```
Authorization: Bearer <CA_TOKEN>
```

**Development Bypass:**
Set environment variable `LOW_CODE_DEV_AUTH=true` to bypass authentication in development mode.

**Token Requirements:**
- Valid CA token from exprsn-ca service
- Appropriate permissions for the requested operation
- Non-expired and non-revoked

---

## API Routes

### Base URL
```
/lowcode/api
```

---

### Applications

#### List Applications

**Endpoint:** `GET /lowcode/api/applications`

**Description:** Get all applications with optional filtering

**Authentication:** Required (CA Token)

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| status | string | No | - | Filter by status: `draft`, `published`, `archived` |
| page | number | No | 1 | Page number for pagination |
| limit | number | No | 50 | Items per page (max 100) |
| sortBy | string | No | `createdAt` | Sort field: `name`, `createdAt`, `updatedAt` |
| sortOrder | string | No | `DESC` | Sort order: `ASC` or `DESC` |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "My Application",
      "displayName": "My Application",
      "description": "App description",
      "status": "published",
      "createdAt": "2024-12-24T00:00:00.000Z",
      "updatedAt": "2024-12-24T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "pages": 2
  }
}
```

**Related Service:** `ApplicationService.getApplications()`

---

#### Get Application

**Endpoint:** `GET /lowcode/api/applications/:id`

**Description:** Get application by ID

**Authentication:** Required

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Application ID |

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "my-app",
    "displayName": "My Application",
    "description": "App description",
    "status": "published",
    "config": {},
    "createdAt": "2024-12-24T00:00:00.000Z"
  }
}
```

**Related Service:** `ApplicationService.getApplicationById()`

---

#### Create Application

**Endpoint:** `POST /lowcode/api/applications`

**Description:** Create new application

**Authentication:** Required

**Request Body:**
```json
{
  "name": "my-app",
  "displayName": "My Application",
  "description": "Application description",
  "status": "draft"
}
```

**Required Fields:**
- `name` (string, 1-100 chars, alphanumeric + hyphens)
- `displayName` (string, 1-255 chars)

**Optional Fields:**
- `description` (string)
- `status` (enum: `draft`, `published`, `archived`, default: `draft`)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "my-app",
    "displayName": "My Application",
    "status": "draft"
  },
  "message": "Application created successfully"
}
```

**Related Service:** `ApplicationService.createApplication()`

---

#### Update Application

**Endpoint:** `PUT /lowcode/api/applications/:id`

**Description:** Update existing application

**Authentication:** Required

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Application ID |

**Request Body:**
```json
{
  "displayName": "Updated Name",
  "description": "Updated description",
  "status": "published"
}
```

**Updatable Fields:**
- `displayName` (string)
- `description` (string)
- `status` (enum)
- `config` (object)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "displayName": "Updated Name",
    "version": 2
  },
  "message": "Application updated successfully"
}
```

**Related Service:** `ApplicationService.updateApplication()`

---

#### Delete Application

**Endpoint:** `DELETE /lowcode/api/applications/:id`

**Description:** Delete application and all related resources

**Authentication:** Required

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | UUID | Yes | Application ID |

**Response:**
```json
{
  "success": true,
  "message": "Application deleted successfully"
}
```

**Cascading Deletes:**
- Entities
- Forms
- Grids
- Processes
- Charts
- Dashboards

**Related Service:** `ApplicationService.deleteApplication()`

---

### Entities

#### List Entities

**Endpoint:** `GET /lowcode/api/entities`

**Description:** Get all entities for an application

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| applicationId | UUID | Yes | Application ID |
| status | string | No | Filter by status |
| page | number | No | 1 |
| limit | number | No | 50 |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "customer",
      "displayName": "Customer",
      "description": "Customer entity",
      "tableName": "customer",
      "applicationId": "uuid",
      "status": "published"
    }
  ],
  "pagination": {...}
}
```

**Related Service:** `EntityService.getEntities()`

---

#### Get Entity

**Endpoint:** `GET /lowcode/api/entities/:id`

**Description:** Get entity by ID with fields

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "customer",
    "displayName": "Customer",
    "fields": [
      {
        "id": "uuid",
        "name": "firstName",
        "displayName": "First Name",
        "dataType": "string",
        "required": true,
        "maxLength": 100
      }
    ]
  }
}
```

**Related Service:** `EntityService.getEntityById()`

---

#### Get Entity Fields

**Endpoint:** `GET /lowcode/api/entities/:id/fields`

**Description:** Get all fields for an entity

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "firstName",
      "displayName": "First Name",
      "dataType": "string",
      "required": true,
      "isPrimaryKey": false,
      "isUnique": false
    }
  ]
}
```

**Related Service:** `EntityService.getEntityFields()`

---

#### Get Entity Data

**Endpoint:** `GET /lowcode/api/entities/:id/data`

**Description:** Get data records for an entity (runtime query)

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| page | number | No | 1 | Page number |
| limit | number | No | 50 | Records per page |
| sortBy | string | No | `id` | Field to sort by |
| sortOrder | string | No | `ASC` | Sort direction |
| filters | JSON | No | - | Filter conditions |

**Example Request:**
```
GET /lowcode/api/entities/123/data?page=1&limit=20&sortBy=createdAt&sortOrder=DESC
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "createdAt": "2024-12-24T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "pages": 5
  }
}
```

**Related Service:** `EntityService.getEntityData()`

---

#### Create Entity

**Endpoint:** `POST /lowcode/api/entities`

**Description:** Create new entity with fields

**Authentication:** Required

**Request Body:**
```json
{
  "name": "customer",
  "displayName": "Customer",
  "description": "Customer entity",
  "applicationId": "uuid",
  "tableName": "customer",
  "status": "draft",
  "fields": [
    {
      "name": "firstName",
      "displayName": "First Name",
      "dataType": "string",
      "required": true,
      "maxLength": 100
    }
  ]
}
```

**Required Fields:**
- `name` (string, unique within app)
- `displayName` (string)
- `applicationId` (UUID)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "customer",
    "tableName": "customer"
  },
  "message": "Entity created successfully"
}
```

**Side Effects:**
- Creates database table if status is `published`
- Creates primary key field `id` (UUID)
- Creates timestamp fields `createdAt`, `updatedAt`

**Related Service:** `EntityService.createEntity()`

---

#### Update Entity

**Endpoint:** `PUT /lowcode/api/entities/:id`

**Description:** Update entity definition

**Authentication:** Required

**Request Body:**
```json
{
  "displayName": "Updated Customer",
  "description": "Updated description",
  "status": "published"
}
```

**Response:**
```json
{
  "success": true,
  "data": {...},
  "message": "Entity updated successfully"
}
```

**Related Service:** `EntityService.updateEntity()`

---

#### Delete Entity

**Endpoint:** `DELETE /lowcode/api/entities/:id`

**Description:** Delete entity and its table

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "message": "Entity deleted successfully"
}
```

**Side Effects:**
- Drops database table
- Cascades to forms, grids, charts using this entity

**Related Service:** `EntityService.deleteEntity()`

---

### Forms

#### List Forms

**Endpoint:** `GET /lowcode/api/forms`

**Description:** Get all forms for an application

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| applicationId | UUID | Yes | Application ID |
| status | string | No | Filter by status |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "customer-form",
      "displayName": "Customer Form",
      "applicationId": "uuid",
      "status": "published",
      "componentCount": 12
    }
  ]
}
```

**Related Service:** `FormService.getForms()`

---

#### Get Form

**Endpoint:** `GET /lowcode/api/forms/:id`

**Description:** Get form definition with components

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "displayName": "Customer Form",
    "config": {
      "components": [...],
      "layout": {...},
      "dataBinding": {...},
      "eventHandlers": {...},
      "permissions": {...}
    }
  }
}
```

**Related Service:** `FormService.getFormById()`

---

#### Create Form

**Endpoint:** `POST /lowcode/api/forms`

**Description:** Create new form

**Authentication:** Required

**Request Body:**
```json
{
  "name": "customer-form",
  "displayName": "Customer Form",
  "description": "Form description",
  "applicationId": "uuid",
  "status": "draft",
  "config": {
    "components": [],
    "layout": {},
    "dataBinding": null,
    "eventHandlers": [],
    "permissions": {}
  }
}
```

**Required Fields:**
- `name` (string, unique within app)
- `displayName` (string)
- `applicationId` (UUID)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "customer-form"
  },
  "message": "Form created successfully"
}
```

**Related Service:** `FormService.createForm()`

---

#### Update Form

**Endpoint:** `PUT /lowcode/api/forms/:id`

**Description:** Update form definition

**Authentication:** Required

**Request Body:**
```json
{
  "displayName": "Updated Form",
  "status": "published",
  "config": {...}
}
```

**Response:**
```json
{
  "success": true,
  "data": {...},
  "message": "Form updated successfully"
}
```

**Related Service:** `FormService.updateForm()`

---

#### Delete Form

**Endpoint:** `DELETE /lowcode/api/forms/:id`

**Description:** Delete form

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "message": "Form deleted successfully"
}
```

**Related Service:** `FormService.deleteForm()`

---

#### Duplicate Form

**Endpoint:** `POST /lowcode/api/forms/:id/duplicate`

**Description:** Create copy of existing form

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "new-uuid",
    "displayName": "Customer Form (Copy)"
  },
  "message": "Form duplicated successfully"
}
```

**Related Service:** `FormService.duplicateForm()`

---

### Grids

#### List Grids

**Endpoint:** `GET /lowcode/api/grids`

**Description:** Get all grids for an application

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| applicationId | UUID | Yes | Application ID |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "displayName": "Customer Grid",
      "entityId": "uuid",
      "status": "published"
    }
  ]
}
```

**Related Service:** `GridService.getGrids()`

---

#### Get Grid

**Endpoint:** `GET /lowcode/api/grids/:id`

**Description:** Get grid definition

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "displayName": "Customer Grid",
    "config": {
      "columns": [...],
      "filters": [...],
      "sorting": {...},
      "pagination": {...}
    }
  }
}
```

**Related Service:** `GridService.getGridById()`

---

#### Create Grid

**Endpoint:** `POST /lowcode/api/grids`

**Description:** Create new grid

**Authentication:** Required

**Request Body:**
```json
{
  "displayName": "Customer Grid",
  "description": "Grid description",
  "applicationId": "uuid",
  "entityId": "uuid",
  "status": "draft",
  "config": {
    "columns": [],
    "defaultPageSize": 50
  }
}
```

**Required Fields:**
- `displayName` (string)
- `applicationId` (UUID)
- `entityId` (UUID)

**Response:**
```json
{
  "success": true,
  "data": {...},
  "message": "Grid created successfully"
}
```

**Related Service:** `GridService.createGrid()`

---

#### Update Grid

**Endpoint:** `PUT /lowcode/api/grids/:id`

**Description:** Update grid definition

**Authentication:** Required

**Related Service:** `GridService.updateGrid()`

---

#### Delete Grid

**Endpoint:** `DELETE /lowcode/api/grids/:id`

**Description:** Delete grid

**Authentication:** Required

**Related Service:** `GridService.deleteGrid()`

---

### Processes

#### List Processes

**Endpoint:** `GET /lowcode/api/processes`

**Description:** Get all processes for an application

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| applicationId | UUID | Yes | Application ID |
| status | string | No | Filter by status |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "displayName": "Customer Onboarding",
      "status": "published",
      "instanceCount": 45,
      "version": 3
    }
  ]
}
```

**Related Service:** `ProcessService.getProcesses()`

---

#### Get Process

**Endpoint:** `GET /lowcode/api/processes/:id`

**Description:** Get process definition (BPMN 2.0)

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "displayName": "Customer Onboarding",
    "config": {
      "elements": [...],
      "connections": [...],
      "variables": {...}
    }
  }
}
```

**Related Service:** `ProcessService.getProcess()`

---

#### Create Process

**Endpoint:** `POST /lowcode/api/processes`

**Description:** Create new process

**Authentication:** Required

**Request Body:**
```json
{
  "displayName": "Customer Onboarding",
  "description": "Process description",
  "applicationId": "uuid",
  "status": "draft",
  "config": {
    "elements": [],
    "connections": [],
    "variables": {}
  }
}
```

**Required Fields:**
- `displayName` (string)
- `applicationId` (UUID)

**Response:**
```json
{
  "success": true,
  "data": {...},
  "message": "Process created successfully"
}
```

**Related Service:** `ProcessService.createProcess()`

---

#### Update Process

**Endpoint:** `PUT /lowcode/api/processes/:id`

**Description:** Update process definition

**Authentication:** Required

**Related Service:** `ProcessService.updateProcess()`

---

#### Delete Process

**Endpoint:** `DELETE /lowcode/api/processes/:id`

**Description:** Delete process

**Authentication:** Required

**Related Service:** `ProcessService.deleteProcess()`

---

#### Start Process Instance

**Endpoint:** `POST /lowcode/api/processes/:id/start`

**Description:** Start new process instance

**Authentication:** Required

**Request Body:**
```json
{
  "variables": {
    "customerId": "uuid",
    "amount": 1000
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "instanceId": "uuid",
    "status": "running",
    "currentElement": "start-event-1"
  },
  "message": "Process started successfully"
}
```

**Related Service:** `ProcessExecutionService.startProcess()`

---

#### List Process Instances

**Endpoint:** `GET /lowcode/api/processes/:id/instances`

**Description:** Get all instances for a process

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| status | string | No | Filter: `running`, `waiting`, `completed`, `error`, `cancelled` |
| initiatedBy | UUID | No | Filter by user |
| page | number | No | 1 |
| limit | number | No | 50 |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "processId": "uuid",
      "status": "running",
      "currentElement": "user-task-1",
      "variables": {...},
      "createdAt": "2024-12-24T00:00:00.000Z"
    }
  ],
  "pagination": {...}
}
```

**Related Service:** `ProcessExecutionService.listProcessInstances()`

---

#### Get Process Instance

**Endpoint:** `GET /lowcode/api/processes/instances/:instanceId`

**Description:** Get specific process instance

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "processId": "uuid",
    "status": "waiting",
    "currentElement": "user-task-approval",
    "waitingFor": {
      "type": "user-task",
      "elementId": "user-task-approval",
      "assignee": "user@example.com",
      "dueDate": "2024-12-25T00:00:00.000Z"
    },
    "variables": {...},
    "executionLog": [...]
  }
}
```

**Related Service:** `ProcessExecutionService.getProcessInstance()`

---

#### Complete User Task

**Endpoint:** `POST /lowcode/api/processes/instances/:instanceId/complete-task`

**Description:** Complete waiting user task

**Authentication:** Required

**Request Body:**
```json
{
  "taskData": {
    "approved": true,
    "comments": "Looks good"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "instanceId": "uuid",
    "status": "running"
  },
  "message": "Task completed successfully"
}
```

**Related Service:** `ProcessExecutionService.completeUserTask()`

---

#### Cancel Process Instance

**Endpoint:** `POST /lowcode/api/processes/instances/:instanceId/cancel`

**Description:** Cancel running process instance

**Authentication:** Required

**Request Body:**
```json
{
  "reason": "No longer needed"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Process cancelled successfully"
}
```

**Related Service:** `ProcessExecutionService.cancelProcessInstance()`

---

#### Get Process Statistics

**Endpoint:** `GET /lowcode/api/processes/:id/statistics`

**Description:** Get execution statistics for a process

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "statistics": {
    "total": 150,
    "byStatus": {
      "completed": 123,
      "running": 12,
      "waiting": 10,
      "error": 3,
      "cancelled": 2
    },
    "averageExecutionTime": 3600000,
    "successRate": 82
  }
}
```

**Related Service:** `ProcessService.getProcessStatistics()`

---

### Charts

#### List Charts

**Endpoint:** `GET /lowcode/api/charts`

**Description:** Get all charts for an application

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| applicationId | UUID | Yes | Application ID |
| status | string | No | Filter by status |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "displayName": "Sales Chart",
      "status": "published",
      "config": {
        "type": "bar",
        "colorScheme": "default"
      }
    }
  ]
}
```

**Related Service:** `ChartService.getCharts()`

---

#### Get Chart

**Endpoint:** `GET /lowcode/api/charts/:id`

**Description:** Get chart definition

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "displayName": "Sales Chart",
    "config": {
      "type": "bar",
      "xAxisLabel": "Month",
      "yAxisLabel": "Sales",
      "colorScheme": "rainbow",
      "dataSource": {
        "type": "entity",
        "config": {...}
      }
    }
  }
}
```

**Related Service:** `ChartService.getChartById()`

---

#### Create Chart

**Endpoint:** `POST /lowcode/api/charts`

**Description:** Create new chart

**Authentication:** Required

**Request Body:**
```json
{
  "displayName": "Sales Chart",
  "description": "Monthly sales visualization",
  "applicationId": "uuid",
  "status": "draft",
  "config": {
    "type": "bar",
    "xAxisLabel": "Month",
    "yAxisLabel": "Sales",
    "colorScheme": "default",
    "dataSource": {
      "type": "static",
      "config": {
        "data": [
          {"label": "Jan", "value": 100},
          {"label": "Feb", "value": 150}
        ]
      }
    }
  }
}
```

**Required Fields:**
- `displayName` (string)
- `applicationId` (UUID)

**Chart Types:**
- `bar` - Bar chart
- `line` - Line chart
- `pie` - Pie chart
- `area` - Area chart
- `scatter` - Scatter plot
- `doughnut` - Donut chart

**Data Source Types:**
- `static` - JSON data array
- `entity` - Low-Code entity
- `api` - REST API endpoint
- `jsonlex` - JSONLex expression

**Response:**
```json
{
  "success": true,
  "data": {...},
  "message": "Chart created successfully"
}
```

**Related Service:** `ChartService.createChart()`

---

#### Update Chart

**Endpoint:** `PUT /lowcode/api/charts/:id`

**Description:** Update chart definition

**Authentication:** Required

**Related Service:** `ChartService.updateChart()`

---

#### Delete Chart

**Endpoint:** `DELETE /lowcode/api/charts/:id`

**Description:** Delete chart

**Authentication:** Required

**Related Service:** `ChartService.deleteChart()`

---

#### Duplicate Chart

**Endpoint:** `POST /lowcode/api/charts/:id/duplicate`

**Description:** Create copy of existing chart

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "new-uuid",
    "displayName": "Sales Chart (Copy)"
  },
  "message": "Chart duplicated successfully"
}
```

**Related Service:** `ChartService.duplicateChart()`

---

### Dashboards

#### List Dashboards

**Endpoint:** `GET /lowcode/api/dashboards`

**Description:** Get all dashboards for an application

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| applicationId | UUID | Yes | Application ID |
| status | string | No | Filter by status |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "displayName": "Executive Dashboard",
      "status": "published",
      "config": {
        "refreshInterval": 30,
        "widgets": [...]
      }
    }
  ]
}
```

**Related Service:** `DashboardService.getDashboards()`

---

#### Get Dashboard

**Endpoint:** `GET /lowcode/api/dashboards/:id`

**Description:** Get dashboard definition with widgets

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "displayName": "Executive Dashboard",
    "config": {
      "refreshInterval": 30,
      "widgets": [
        {
          "id": "widget-1",
          "type": "chart",
          "title": "Sales Chart",
          "x": 0,
          "y": 0,
          "w": 6,
          "h": 4,
          "config": {...}
        }
      ]
    }
  }
}
```

**Related Service:** `DashboardService.getDashboardById()`

---

#### Create Dashboard

**Endpoint:** `POST /lowcode/api/dashboards`

**Description:** Create new dashboard

**Authentication:** Required

**Request Body:**
```json
{
  "displayName": "Executive Dashboard",
  "description": "Dashboard description",
  "applicationId": "uuid",
  "status": "draft",
  "config": {
    "refreshInterval": 30,
    "widgets": []
  }
}
```

**Required Fields:**
- `displayName` (string)
- `applicationId` (UUID)

**Widget Types:**
- `chart` - Chart visualization
- `metric` - Metric card (KPI)
- `table` - Data table
- `grid` - Entity grid
- `text` - Rich text content
- `html` - Custom HTML
- `iframe` - Embedded content
- `process-stats` - Process statistics
- `task-list` - User task list

**Response:**
```json
{
  "success": true,
  "data": {...},
  "message": "Dashboard created successfully"
}
```

**Related Service:** `DashboardService.createDashboard()`

---

#### Update Dashboard

**Endpoint:** `PUT /lowcode/api/dashboards/:id`

**Description:** Update dashboard definition

**Authentication:** Required

**Related Service:** `DashboardService.updateDashboard()`

---

#### Delete Dashboard

**Endpoint:** `DELETE /lowcode/api/dashboards/:id`

**Description:** Delete dashboard

**Authentication:** Required

**Related Service:** `DashboardService.deleteDashboard()`

---

#### Duplicate Dashboard

**Endpoint:** `POST /lowcode/api/dashboards/:id/duplicate`

**Description:** Create copy of existing dashboard

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "new-uuid",
    "displayName": "Executive Dashboard (Copy)"
  },
  "message": "Dashboard duplicated successfully"
}
```

**Related Service:** `DashboardService.duplicateDashboard()`

---

### Automation

#### List Automation Rules

**Endpoint:** `GET /lowcode/api/automation/rules`

**Description:** Get all automation rules for an application

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| applicationId | UUID | Yes | Application ID |
| enabled | boolean | No | Filter by enabled status |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "auto-approve",
      "displayName": "Auto Approve",
      "triggerType": "entity-create",
      "enabled": true
    }
  ]
}
```

**Related Service:** `AutomationService.getRules()`

---

### Settings

#### Get Application Settings

**Endpoint:** `GET /lowcode/api/settings`

**Description:** Get all settings for an application

**Authentication:** Required

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| applicationId | UUID | Yes | Application ID |

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "key": "api-url",
      "value": "https://api.example.com",
      "dataType": "string",
      "encrypted": false
    }
  ]
}
```

**Related Service:** `SettingsService.getSettings()`

---

#### Set Setting

**Endpoint:** `POST /lowcode/api/settings`

**Description:** Create or update setting

**Authentication:** Required

**Request Body:**
```json
{
  "applicationId": "uuid",
  "key": "api-url",
  "value": "https://api.example.com",
  "dataType": "string",
  "encrypted": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {...},
  "message": "Setting saved successfully"
}
```

**Related Service:** `SettingsService.setSetting()`

---

### Runtime

#### Execute Runtime Query

**Endpoint:** `POST /lowcode/api/runtime/query`

**Description:** Execute dynamic query on entity data

**Authentication:** Required

**Request Body:**
```json
{
  "entityId": "uuid",
  "filters": [
    {
      "field": "status",
      "operator": "equals",
      "value": "active"
    }
  ],
  "sortBy": "createdAt",
  "sortOrder": "DESC",
  "page": 1,
  "limit": 50
}
```

**Supported Operators:**
- `equals`, `not-equals`
- `contains`, `not-contains`
- `starts-with`, `ends-with`
- `greater-than`, `less-than`
- `in`, `not-in`
- `is-null`, `is-not-null`

**Response:**
```json
{
  "success": true,
  "data": [...],
  "pagination": {...}
}
```

**Related Service:** `RuntimeService.executeQuery()`

---

### Other Resources

#### Cards

**Endpoints:**
- `GET /lowcode/api/cards` - List cards
- `GET /lowcode/api/cards/:id` - Get card
- `POST /lowcode/api/cards` - Create card
- `PUT /lowcode/api/cards/:id` - Update card
- `DELETE /lowcode/api/cards/:id` - Delete card

**Related Service:** `CardService`

---

#### Data Sources

**Endpoints:**
- `GET /lowcode/api/datasources` - List data sources
- `GET /lowcode/api/datasources/:id` - Get data source
- `POST /lowcode/api/datasources` - Create data source
- `POST /lowcode/api/datasources/:id/test` - Test connection

**Related Service:** `DataSourceService`

---

#### Polls

**Endpoints:**
- `GET /lowcode/api/polls` - List polls
- `GET /lowcode/api/polls/:id` - Get poll
- `POST /lowcode/api/polls` - Create poll
- `POST /lowcode/api/polls/:id/vote` - Submit vote

**Related Service:** `PollService`

---

#### Formulas

**Endpoints:**
- `POST /lowcode/api/formulas/evaluate` - Evaluate JSONLex expression

**Related Service:** `JSONLexService`

---

## View Routes

### Designers

#### Application Designer

**Route:** `GET /lowcode/designer`

**Description:** Main application designer hub

**Authentication:** Optional (view-only without auth)

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| appId | UUID | Yes | Application ID |

**Access URL:**
```
/lowcode/designer?appId=<uuid>
```

**View:** `app-designer.ejs`

---

#### Entity Designer

**Create New:**
```
GET /lowcode/entity-designer?appId=<uuid>
```

**Edit Existing:**
```
GET /lowcode/entity-designer?entityId=<uuid>&appId=<uuid>
```

**View:** `entity-designer.ejs`

---

#### Form Designer

**Create New:**
```
GET /lowcode/forms/new?appId=<uuid>
```

**Edit Existing:**
```
GET /lowcode/forms/:formId/designer
```

**View:** `form-designer.ejs`

**Features:**
- 27 components (Basic, Data, Layout)
- Data binding system (4 types)
- Event handlers (7 types, 5 triggers)
- Permissions manager
- Workflow integration
- Forge CRM integration

---

#### Grid Designer

**Create New:**
```
GET /lowcode/grids/new?appId=<uuid>
```

**Edit Existing:**
```
GET /lowcode/grids/:gridId/designer
```

**View:** `grid-designer.ejs`

**Features:**
- Visual column configuration
- Custom cell templates (Handlebars)
- Sorting and filtering
- Pagination settings
- CRUD operations

---

#### Process Designer

**Create New:**
```
GET /lowcode/processes/new?appId=<uuid>
```

**Edit Existing:**
```
GET /lowcode/processes/:processId/designer
```

**View:** `process-designer.ejs`

**Features:**
- BPMN 2.0 visual designer
- Drag-and-drop elements
- Connection drawing tool
- Workflow integration
- CRM task integration
- Script task execution

---

#### Chart Designer

**Create New:**
```
GET /lowcode/charts/new?appId=<uuid>
```

**Edit Existing:**
```
GET /lowcode/charts/:chartId/designer
```

**View:** `chart-designer.ejs`

**Features:**
- 6 chart types
- 4 data source types
- 5 color schemes
- Real-time preview
- Export to PNG

---

#### Dashboard Designer

**Create New:**
```
GET /lowcode/dashboards/new?appId=<uuid>
```

**Edit Existing:**
```
GET /lowcode/dashboards/:dashboardId/designer
```

**View:** `dashboard-designer.ejs`

**Features:**
- 9 widget types
- Drag-and-drop grid layout
- Auto-layout
- Widget configuration
- Real-time preview

---

### Monitors & Viewers

#### Process Monitor

**Route:** `GET /lowcode/processes/:processId/monitor`

**Description:** Real-time process execution monitoring

**View:** `process-monitor.ejs`

**Features:**
- Instance list with filtering
- Status tracking
- Execution logs
- Variable inspection
- Instance actions (cancel, complete task)
- Statistics view

---

#### Task Inbox

**Route:** `GET /lowcode/tasks/inbox`

**Description:** User task management interface

**View:** `task-inbox.ejs`

**Features:**
- Task list with priorities
- Filter tabs (All, Mine, Group)
- Task details
- Process variables
- Task completion form
- Auto-refresh (10s)

---

### Application Runner

#### Run Application

**Route:** `GET /lowcode/apps/:appId`

**Description:** Launch low-code application

**View:** `app-runner.ejs`

---

#### Run Form

**Route:** `GET /lowcode/apps/:appId/forms/:formId`

**Description:** Direct link to specific form

**View:** `app-runner.ejs`

---

### Other Views

#### Applications List

**Route:** `GET /lowcode/applications`

**Description:** List all applications

**View:** `applications.ejs`

---

#### Settings Manager

**Route:** `GET /lowcode/settings?appId=<uuid>`

**Description:** Application settings and variables

**View:** `settings-manager.ejs`

---

## Response Format

### Success Response

```json
{
  "success": true,
  "data": {...},
  "message": "Operation completed successfully"
}
```

### Error Response

```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": {...}
}
```

### Paginated Response

```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 237,
    "pages": 5
  }
}
```

---

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `UNAUTHORIZED` | Missing or invalid CA token | 401 |
| `FORBIDDEN` | Insufficient permissions | 403 |
| `NOT_FOUND` | Resource not found | 404 |
| `MISSING_PARAMETER` | Required query parameter missing | 400 |
| `MISSING_FIELDS` | Required body fields missing | 400 |
| `VALIDATION_ERROR` | Input validation failed | 400 |
| `DUPLICATE_NAME` | Name already exists | 409 |
| `FETCH_FAILED` | Database query error | 500 |
| `CREATE_FAILED` | Resource creation error | 500 |
| `UPDATE_FAILED` | Resource update error | 500 |
| `DELETE_FAILED` | Resource deletion error | 500 |
| `INTERNAL_ERROR` | Unexpected server error | 500 |

---

## Common Query Parameters

### Pagination

| Parameter | Type | Default | Max | Description |
|-----------|------|---------|-----|-------------|
| page | number | 1 | - | Page number (1-indexed) |
| limit | number | 50 | 100 | Items per page |

### Sorting

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| sortBy | string | `createdAt` | Field to sort by |
| sortOrder | string | `DESC` | `ASC` or `DESC` |

### Filtering

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| status | string | - | `draft`, `published`, `archived` |
| applicationId | UUID | - | Filter by application |

---

## Notes for Future Enhancements

### Adding New Routes

When adding new routes to the Low-Code Platform:

1. **Create API Route File** (`/lowcode/routes/<resource>.js`)
   - Follow RESTful conventions (GET, POST, PUT, DELETE)
   - Include list, get, create, update, delete endpoints
   - Add duplicate endpoint if applicable
   - Use consistent error handling

2. **Create Service** (`/lowcode/services/<Resource>Service.js`)
   - Implement business logic
   - Return `{ success, data, message }` format
   - Handle errors gracefully

3. **Create Model** (`/lowcode/models/<Resource>.js`)
   - Define Sequelize model
   - Add indexes for foreign keys and frequently queried fields
   - Use JSONB for flexible config storage
   - Include status field (`draft`, `published`, `archived`)

4. **Update Route Index** (`/lowcode/routes/index.js`)
   - Import new router
   - Mount under `/api/<resource>`
   - Add to endpoint list in root route

5. **Add View Routes** (`/lowcode/index.js`)
   - Create designer route: `/lowcode/<resource>s/new`
   - Create edit route: `/lowcode/<resource>s/:id/designer`
   - Load resource data for edit route

6. **Create View Files** (`/lowcode/views/`)
   - Designer UI (EJS template)
   - Client-side engine (JS file in `/lowcode/public/js/`)

7. **Update This Document**
   - Add route section with full details
   - Include request/response examples
   - Document query parameters
   - Add to Table of Contents

### Best Practices

- **Consistency:** Follow existing patterns for route structure, naming, and response format
- **Documentation:** Update this file with every route addition
- **Validation:** Validate all inputs before database operations
- **Authentication:** Apply CA token auth to all API routes except public endpoints
- **Pagination:** Include pagination for list endpoints
- **Versioning:** Increment version number on publish status change
- **Cascading:** Document cascade delete behavior
- **Examples:** Provide request/response examples for complex endpoints

---

## Changelog

### Version 1.0.0 (2024-12-24)

**Initial Release:**
- Complete route documentation for Low-Code Platform
- API routes for 15 resource types
- 20+ view routes for designers and viewers
- Response format standards
- Error code reference

**Resources Documented:**
- Applications
- Entities
- Forms
- Grids
- Processes
- Charts
- Dashboards
- Automation
- Settings
- Runtime
- And more...

---

**End of Routes Reference**

For implementation details and service architecture, see `/lowcode/README.md`
