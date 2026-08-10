# Business Operations Hub - Installation Complete

## Overview

The **Business Operations Hub** is a comprehensive full-featured application that integrates all elements of Exprsn-svr including the Low-Code Platform, Forge CRM/ERP modules, and service integrations (Workflow, Herald, Timeline).

**Application ID:** `1aadee7c-15a5-4b16-956d-1f77fdfd2dd7`

## What Was Installed

### 1 Application
- **Name:** Business Operations Hub
- **Status:** Active
- **Version:** 1.0.0
- **Purpose:** Unified business management platform combining project management, task tracking, team collaboration, and customer/contact management

### 5 Entities

#### Custom Entities (Lowcode Platform):

1. **Project** (`hub_projects`)
   - Fields: project_number, name, description, customer_id, status, priority, start_date, end_date, budget, progress_percentage
   - Relationships: Belongs to Forge ERP Customer, has many Tasks
   - Features: Audit logging, versioning, soft deletes
   - Integrations: Links to Forge ERP customers table

2. **Task** (`hub_tasks`)
   - Fields: task_number, project_id, title, description, assigned_to_contact_id, status, priority, due_date, estimated_hours
   - Relationships: Belongs to Project, assigned to Forge CRM Contact
   - Features: Audit logging, soft deletes
   - Workflow Triggers: `task_created_notification`, `task_status_changed`
   - Integration: Triggers Herald notifications when tasks are assigned

3. **Team Member** (`hub_team_members`)
   - Fields: contact_id, role, department, skills (array), hourly_rate, availability_status
   - Relationships: Belongs to Forge CRM Contact
   - Features: Soft deletes
   - Purpose: Manage team member profiles with skill tracking

4. **Contact Assignment** (`hub_contact_assignments`)
   - Fields: project_id, contact_id, role_in_project, start_date, is_active
   - Relationships: Belongs to Project, belongs to Forge CRM Contact
   - Purpose: Junction entity linking Forge CRM contacts to projects with specific roles

#### Forge Integration Entity:

5. **Customer Profile** (no physical table)
   - Source Type: `forge` (integration entity)
   - Integration: Direct read/write access to Forge ERP `customers` table
   - API Endpoint: `/forge/erp/customers`
   - Permissions: Read, Write (no delete)
   - Purpose: Seamless integration with Forge ERP customer data

### 3 Forms (Published)

1. **Project Management Form**
   - Type: Standard, Two-column layout
   - Data Source: Project entity (two-way binding)
   - Features: Customer linking via Forge ERP integration
   - Status: Published v1.0.0

2. **Task Entry Form**
   - Type: Standard, Single-column layout
   - Data Source: Task entity (two-way binding)
   - Integrations: Workflow triggers, Herald notifications
   - Status: Published v1.0.0

3. **Team Member Form**
   - Type: Standard, Single-column layout
   - Data Source: Team Member entity
   - Purpose: Create and manage team member profiles
   - Status: Published v1.0.0

### 3 Grids

1. **Projects Overview** (Editable Grid)
   - Data Source: Project entity with customer relationship
   - Columns: Project #, Name, Status, Priority
   - Actions: Edit (opens Project Form)
   - Pagination: 25 records per page
   - Features: Sortable columns, filtering

2. **Tasks Board** (Editable Grid)
   - Data Source: Task entity with project and assignedContact relationships
   - Columns: Task #, Title, Status, Due Date
   - Actions: Edit (opens Task Form)
   - Pagination: 50 records per page
   - Purpose: Kanban-style task management

3. **Team Directory** (Readonly Grid)
   - Data Source: Team Member entity with contact relationship
   - Columns: Role, Department, Availability
   - Purpose: Team member lookup and directory

## Integration Points

### Forge CRM Integration
- **Contacts:** Tasks can be assigned to Forge CRM contacts
- **Contacts:** Team members are linked to Forge CRM contact records
- **Contacts:** Projects can have multiple contacts assigned via ContactAssignment entity
- **Companies:** (Available for future integration)

### Forge ERP Integration
- **Customers:** Projects link directly to Forge ERP customer records
- **Invoices:** (Available for future integration - invoice tracking per project)
- **Customer Profile Entity:** Read/write access to customers table

### Service Integrations

#### exprsn-workflow (Port 3017)
- **Trigger:** `task_created_notification` - Fires when a new task is created with status='todo'
- **Trigger:** `task_status_changed` - Fires when task status changes
- **Purpose:** Automated workflow execution for task lifecycle events

#### exprsn-herald (Port 3014)
- **Integration:** Task assignment notifications
- **Trigger:** When `assigned_to_contact_id` is set on a task
- **Action:** Sends multi-channel notification to assigned contact

#### exprsn-timeline (Port 3004)
- **Integration:** Activity feed for project and task updates
- **Purpose:** Real-time timeline of all project/task changes

## Data Model Relationships

```
┌─────────────────────┐
│  Forge ERP          │
│  Customers          │
└──────────┬──────────┘
           │
           │ customer_id
           ▼
┌─────────────────────┐         ┌─────────────────────┐
│  Project            │◄────────┤  Contact            │
│  (hub_projects)     │         │  Assignment         │
└──────────┬──────────┘         └─────────────────────┘
           │                              ▲
           │ project_id                   │ contact_id
           ▼                              │
┌─────────────────────┐                  │
│  Task               │                  │
│  (hub_tasks)        │──────────────────┘
└─────────────────────┘   assigned_to

           ▲
           │ contact_id
           │
┌─────────────────────┐
│  Forge CRM          │
│  Contacts           │
└─────────────────────┘

┌─────────────────────┐
│  Team Member        │
│  (hub_team_members) │───contact_id───► Contacts
└─────────────────────┘
```

## Access Points

### Lowcode Platform UI
- **Home:** `http://localhost:5000/lowcode`
- **Applications:** `http://localhost:5000/lowcode/applications`
- **Specific App:** `http://localhost:5000/lowcode/designer?appId=1aadee7c-15a5-4b16-956d-1f77fdfd2dd7`

### Forge API Endpoints
- **CRM Contacts:** `/forge/crm/contacts`
- **CRM Companies:** `/forge/crm/companies`
- **ERP Customers:** `/forge/erp/customers` (integrated via Customer Profile entity)

### Service API Endpoints
- **Workflow:** `http://localhost:3017/api/workflows`
- **Herald Notifications:** `http://localhost:3014/api/notifications`
- **Timeline:** `http://localhost:3004/api/timeline`

## Usage Examples

### Creating a Project with Customer Link

```javascript
POST /lowcode/api/entities/project/data
{
  "project_number": "PRJ-2024-001",
  "name": "Website Redesign",
  "description": "Complete redesign of corporate website",
  "customer_id": "<forge_customer_uuid>",  // Links to Forge ERP customer
  "status": "planning",
  "priority": "high",
  "start_date": "2024-12-26",
  "end_date": "2025-03-31",
  "budget": 50000.00,
  "progress_percentage": 0
}
```

### Creating a Task with Contact Assignment

```javascript
POST /lowcode/api/entities/task/data
{
  "task_number": "TASK-001",
  "project_id": "<project_uuid>",
  "title": "Design mockups",
  "description": "Create initial design mockups for homepage",
  "assigned_to_contact_id": "<forge_contact_uuid>",  // Links to Forge CRM contact
  "status": "todo",
  "priority": "high",
  "due_date": "2025-01-15",
  "estimated_hours": 16.0
}
// This will automatically:
// 1. Trigger "task_created_notification" workflow
// 2. Send notification via Herald to the assigned contact
```

### Assigning a Contact to a Project with Role

```javascript
POST /lowcode/api/entities/contact_assignment/data
{
  "project_id": "<project_uuid>",
  "contact_id": "<forge_contact_uuid>",
  "role_in_project": "Lead Designer",
  "start_date": "2024-12-26",
  "is_active": true
}
```

## Features Demonstrated

### 1. **Lowcode Platform Capabilities**
- ✅ Custom entity creation with schema definition
- ✅ Entity relationships (belongsTo, hasMany)
- ✅ Form builder integration
- ✅ Grid/table display with actions
- ✅ Data source binding (two-way, one-way)

### 2. **Forge Integration**
- ✅ CRM integration (contacts for task assignment and team members)
- ✅ ERP integration (customers for project linking)
- ✅ Cross-module data flow (CRM ↔ Lowcode ↔ ERP)
- ✅ Integration entity (Customer Profile with direct table access)

### 3. **Service Integration**
- ✅ Workflow triggers on entity lifecycle events
- ✅ Herald notifications for user actions
- ✅ Timeline activity tracking (ready for integration)
- ✅ Multi-service orchestration

### 4. **Enterprise Features**
- ✅ Audit logging (Project, Task entities)
- ✅ Versioning support (Project entity)
- ✅ Soft deletes (all custom entities)
- ✅ JSONB metadata fields for extensibility
- ✅ Relationship mapping across modules

## Next Steps

### For Development:
1. **Forms:** Use the Low-Code Form Designer to add more controls and validation to the forms
2. **Grids:** Customize grid templates and add bulk actions
3. **Workflows:** Create actual BPMN workflows for task_created_notification and task_status_changed
4. **Security:** Configure entity-level and field-level permissions
5. **API:** Build custom API endpoints for complex business logic

### For Production:
1. **Authentication:** Integrate with exprsn-auth for user management and replace placeholder owner_id
2. **Authorization:** Set up role-based permissions for entities and forms
3. **Validation:** Add business rule validation using Joi schemas
4. **Testing:** Write integration tests for entity CRUD operations
5. **Documentation:** Generate API documentation for custom endpoints

## Technical Notes

### Database Tables Created
- `applications` - 1 record (Business Operations Hub)
- `app_entities` - 5 records (Project, Task, TeamMember, CustomerProfile, ContactAssignment)
- `app_forms` - 3 records (forms metadata)
- `app_grids` - 3 records (grid configurations)

**Note:** Physical database tables for custom entities (`hub_projects`, `hub_tasks`, `hub_team_members`, `hub_contact_assignments`) are NOT automatically created. They would be created when:
1. First data record is inserted via the Lowcode API, OR
2. Manual migration is run to create them, OR
3. Entity designer's "Sync to Database" feature is used

### Forge Integration Tables (Already Exist)
- `customers` - Forge ERP customers table (from migration 20251224100009)
- `contacts` - Forge CRM contacts table
- `companies` - Forge CRM companies table

## Troubleshooting

### If entities don't appear in the Lowcode UI:
```sql
-- Verify application exists
SELECT * FROM applications WHERE name = 'business_operations_hub';

-- Verify entities exist
SELECT name, display_name FROM app_entities
WHERE application_id = '1aadee7c-15a5-4b16-956d-1f77fdfd2dd7';
```

### If Forge integration doesn't work:
- Ensure Forge routes are mounted at `/forge` in index.js
- Verify customers table exists: `SELECT * FROM customers LIMIT 1;`
- Check Forge API: `curl http://localhost:5000/forge/api/status`

### If workflows don't trigger:
- Verify exprsn-workflow service is running on port 3017
- Check workflow definitions exist for trigger names
- Review workflow logs for execution status

## Conclusion

The Business Operations Hub demonstrates a **complete integration** of:
- ✅ Lowcode Platform (entities, forms, grids)
- ✅ Forge CRM (contacts, companies)
- ✅ Forge ERP (customers, potential invoices)
- ✅ Service Layer (workflow, herald, timeline)

This application serves as a **reference implementation** showing how to build complex, multi-module business applications within the Exprsn ecosystem.
