# Forge + Low-Code Platform - Complete Integration Architecture

**Version:** 1.0.0
**Last Updated:** 2024-12-25
**Application:** Business Operations Hub

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Integration Architecture](#integration-architecture)
3. [Entity Designer Integration](#entity-designer-integration)
4. [Form Designer Integration](#form-designer-integration)
5. [Grid Designer Integration](#grid-designer-integration)
6. [Workflow Integration](#workflow-integration)
7. [Data Flow Diagrams](#data-flow-diagrams)
8. [API Integration Points](#api-integration-points)
9. [Sample Usage Scenarios](#sample-usage-scenarios)
10. [Designer Walkthroughs](#designer-walkthroughs)

---

## Overview

The **Business Operations Hub** demonstrates a complete integration between:

- ✅ **Low-Code Platform** - Visual application builder (entities, forms, grids, workflows)
- ✅ **Forge CRM** - Contact management (CardDAV)
- ✅ **Forge ERP** - Customer, invoice, and product management
- ✅ **exprsn-workflow** - Automated business processes
- ✅ **exprsn-herald** - Multi-channel notifications

### Integration Model

```
┌──────────────────────────────────────────────────────────────┐
│                  Business Operations Hub                      │
│                    (Low-Code Application)                     │
└────────────┬─────────────────────────────────────────────────┘
             │
    ┌────────┼────────────────────────┐
    │        │                        │
    ▼        ▼                        ▼
┌────────┐ ┌─────────┐        ┌──────────────┐
│ Forge  │ │ Forge   │        │   Services   │
│  CRM   │ │   ERP   │        │  Integration │
│────────│ │─────────│        │──────────────│
│Contacts│ │Customers│        │  Workflow    │
│        │ │Invoices │        │  Herald      │
│        │ │Products │        │  Timeline    │
└────────┘ └─────────┘        └──────────────┘
```

---

## Integration Architecture

### Three Integration Patterns

#### 1. **Virtual Entity Integration** (Read/Write Forge Tables Directly)

Virtual entities provide **direct access** to Forge database tables through the Low-Code API without creating duplicate tables.

**Example: Contact Entity**
```javascript
{
  name: 'forge_contact',
  displayName: 'Contact',
  sourceType: 'forge',  // <-- Virtual integration
  sourceConfig: {
    forgeModule: 'carddav',
    forgeTable: 'contacts',
    apiEndpoint: '/api/contacts',
    permissions: { read: true, write: true, delete: true }
  }
}
```

**Benefits:**
- ✅ No data duplication
- ✅ Real-time access to Forge data
- ✅ Single source of truth
- ✅ Automatic schema sync

**API Access:**
```bash
# Read contacts directly from Forge
GET /lowcode/api/entities/forge_contact/data

# Create new contact in Forge
POST /lowcode/api/entities/forge_contact/data
{
  "first_name": "Jane",
  "last_name": "Doe",
  "organization": "Acme Corp",
  "emails": [{"type": "work", "value": "jane@acme.com"}]
}
```

#### 2. **Foreign Key Integration** (Link Low-Code Entities to Forge)

Low-Code entities reference Forge tables via foreign keys, creating relational links.

**Example: Project → Customer Relationship**
```javascript
// Project entity (Low-Code)
{
  name: 'project',
  schema: {
    fields: [
      { name: 'customer_id', type: 'uuid' }  // <-- FK to Forge ERP
    ]
  },
  relationships: [
    {
      name: 'customer',
      type: 'belongsTo',
      targetEntity: 'forge:customers',  // <-- References Forge table
      foreignKey: 'customer_id'
    }
  ]
}
```

**Database Relationship:**
```sql
-- Low-Code table
CREATE TABLE hub_projects (
  id UUID PRIMARY KEY,
  customer_id UUID REFERENCES customers(id),  -- FK to Forge ERP
  ...
);
```

**Benefits:**
- ✅ Maintains data integrity
- ✅ Enables complex queries with JOINs
- ✅ Supports cascade operations
- ✅ Works with grid relationships

#### 3. **Event-Driven Integration** (Workflows + Webhooks)

Trigger Forge actions from Low-Code events and vice versa.

**Example: Task Assignment → Herald Notification**
```javascript
// Task entity metadata
{
  metadata: {
    workflowTriggers: {
      onCreate: 'task_created_notification',  // <-- Workflow trigger
      onStatusChange: 'task_status_changed'
    }
  }
}
```

**Workflow Definition** (exprsn-workflow):
```javascript
// Workflow: task_created_notification
{
  "trigger": "task.created",
  "condition": "task.status === 'todo' && task.assigned_to_contact_id",
  "steps": [
    {
      "type": "herald_notification",
      "config": {
        "channels": ["email", "push"],
        "template": "task_assignment",
        "recipient": "{{task.assigned_to_contact_id}}"
      }
    }
  ]
}
```

---

## Entity Designer Integration

### Creating Virtual Forge Entities

**Step 1: Navigate to Entity Designer**
```
https://localhost:5002/lowcode/entity-designer?appId=<app-id>
```

**Step 2: Configure Entity**

| Field | Value | Description |
|-------|-------|-------------|
| **Source Type** | `forge` | Marks as virtual Forge entity |
| **Forge Module** | `crm` or `erp` | Which Forge module to integrate |
| **Forge Table** | `contacts`, `customers`, etc. | Actual Forge table name |
| **API Endpoint** | `/forge/crm/contacts` | Forge API path |
| **Permissions** | `{read: true, write: true}` | Access level |

**Step 3: Schema is Auto-Detected**

The Entity Designer automatically reads the Forge table schema:
- Column names → Field names
- Data types → Field types
- Constraints → Validation rules
- Relationships → Entity relationships

**Example Output:**
```javascript
// Auto-generated from Forge contacts table
{
  fields: [
    { name: 'id', type: 'uuid', primaryKey: true },
    { name: 'first_name', type: 'string', length: 255 },
    { name: 'last_name', type: 'string', length: 255 },
    { name: 'organization', type: 'string', length: 255 },
    { name: 'emails', type: 'jsonb' },
    { name: 'phones', type: 'jsonb' }
  ]
}
```

### Creating Foreign Key Relationships

**In Entity Designer:**

1. Create your Low-Code entity (e.g., `project`)
2. Add a field: `customer_id` (type: UUID)
3. In **Relationships** tab:
   - Relationship Name: `customer`
   - Type: `belongsTo`
   - Target Entity: `forge:customers`
   - Foreign Key: `customer_id`

**Result:**
```javascript
{
  name: 'project',
  relationships: [
    {
      name: 'customer',
      type: 'belongsTo',
      targetEntity: 'forge:customers',
      foreignKey: 'customer_id'
    }
  ]
}
```

**Querying with Relationships:**
```javascript
// API automatically includes related Forge data
GET /lowcode/api/entities/project/data?include=customer

// Response includes Forge customer details
{
  "id": "proj-123",
  "name": "Website Redesign",
  "customer_id": "cust-456",
  "customer": {  // <-- Forge ERP customer data
    "customer_number": "CUST-001",
    "name": "TechCorp Solutions",
    "email": "billing@techcorp.com",
    "payment_terms": "Net 30"
  }
}
```

---

## Form Designer Integration

### Form Components for Forge Data

The Form Designer provides specialized components for Forge integration:

#### 1. **Entity Picker Component**

Displays a dropdown/autocomplete of Forge entities.

**Configuration:**
```javascript
{
  id: 'ctrl_customer',
  type: 'entityPicker',
  name: 'customer_id',
  label: 'Customer',
  entityType: 'forge:customers',  // <-- Forge entity
  displayField: 'name',
  valueField: 'id',
  searchFields: ['name', 'customer_number', 'email'],
  required: true
}
```

**Rendered HTML:**
```html
<select name="customer_id" class="entity-picker" data-entity="forge:customers">
  <option value="cu111...">TechCorp Solutions (CUST-001)</option>
  <option value="cu222...">InnovateLabs Inc (CUST-002)</option>
  <option value="cu333...">Global Enterprises (CUST-003)</option>
</select>
```

**With Search:**
```javascript
// API endpoint for autocomplete
GET /forge/erp/customers?search=tech

// Returns filtered Forge customers
{
  "results": [
    { "id": "cu111...", "name": "TechCorp Solutions", "customer_number": "CUST-001" }
  ]
}
```

#### 2. **CRUD Interface Component**

Embedded full CRUD for related Forge entities.

**Configuration:**
```javascript
{
  id: 'ctrl_contact_crud',
  type: 'crudInterface',
  entityType: 'forge:contacts',
  operations: ['create', 'read', 'update', 'delete'],
  displayFields: ['full_name', 'organization', 'job_title'],
  editMode: 'modal'
}
```

**Rendered:**
- Table of contacts from Forge CardDAV
- Add/Edit/Delete buttons
- Inline editing or modal dialogs
- Real-time updates to Forge

#### 3. **Subgrid Component**

Display related Forge records in a grid.

**Example: Show all invoices for selected customer**
```javascript
{
  id: 'ctrl_invoices',
  type: 'subgrid',
  dataSource: {
    type: 'forge',
    entity: 'forge:invoices',
    filter: '{{customer_id === parent.customer_id}}'  // JSONLex
  },
  columns: [
    { field: 'invoice_number', label: 'Invoice #' },
    { field: 'issue_date', label: 'Date', type: 'date' },
    { field: 'total', label: 'Amount', type: 'currency' },
    { field: 'status', label: 'Status', template: '{{statusBadge}}' }
  ],
  actions: ['view', 'download_pdf']
}
```

### Data Binding to Forge

**Two-Way Data Binding:**
```javascript
{
  name: 'invoice_form',
  dataSources: [
    {
      name: 'invoiceData',
      type: 'entity',
      entityId: '<forge_invoice_entity_id>',  // Virtual Forge entity
      mode: 'twoWay'  // Changes auto-save to Forge
    }
  ]
}
```

**On Form Submit:**
```javascript
// Form Designer automatically generates
function handleSubmit(formData) {
  // Calls Forge ERP API directly
  await fetch('/forge/erp/invoices', {
    method: 'POST',
    body: JSON.stringify(formData)
  });
}
```

---

## Grid Designer Integration

### Grids with Forge Data

#### 1. **Simple Forge Grid**

Display Forge data in a grid with sorting, filtering, pagination.

**Configuration:**
```javascript
{
  name: 'contacts_grid',
  entityId: '<forge_contact_entity_id>',
  gridType: 'editable',
  columns: [
    { name: 'Name', field: 'full_name', width: 200, sortable: true },
    { name: 'Organization', field: 'organization', width: 180, sortable: true },
    { name: 'Email', field: 'email', width: 200 },
    { name: 'Phone', field: 'phone', width: 130 }
  ],
  dataSource: {
    type: 'entity',
    entityId: '<forge_contact_entity_id>'
  }
}
```

**Rendered Grid:**
- Fetches data from `/lowcode/api/entities/forge_contact/data`
- Which internally calls `/forge/crm/contacts`
- Supports pagination: `?limit=50&offset=0`
- Supports sorting: `?sort=full_name&order=asc`
- Supports filtering: `?filter[organization]=TechCorp`

#### 2. **Grid with Relationships**

Show Low-Code entity data WITH related Forge data.

**Example: Projects grid with customer info**
```javascript
{
  name: 'projects_grid',
  entityId: '<project_entity_id>',
  columns: [
    { name: 'Project', field: 'name', width: 250 },
    { name: 'Customer', field: 'customer.name', width: 200 },  // <-- Forge relation
    { name: 'Payment Terms', field: 'customer.payment_terms', width: 120 },  // <-- Forge
    { name: 'Status', field: 'status', width: 100 }
  ],
  dataSource: {
    type: 'entity',
    entityId: '<project_entity_id>',
    include: ['customer']  // <-- JOIN with Forge customers table
  }
}
```

**SQL Query Generated:**
```sql
SELECT
  p.*,
  c.name as customer_name,
  c.payment_terms
FROM hub_projects p
LEFT JOIN customers c ON p.customer_id = c.id  -- Forge ERP table
ORDER BY p.created_at DESC
LIMIT 25;
```

#### 3. **Custom Cell Templates**

Use Handlebars templates to render Forge data.

**Configuration:**
```javascript
{
  columns: [
    {
      name: 'Status',
      field: 'status',
      width: 120,
      template: '{{statusBadge}}'  // Custom Handlebars helper
    },
    {
      name: 'Customer',
      field: 'customer',
      width: 250,
      template: '<a href="/forge/erp/customers/{{customer.id}}">{{customer.name}}</a> <span class="badge">{{customer.customer_number}}</span>'
    }
  ]
}
```

**Grid Actions to Forge:**
```javascript
{
  actions: [
    {
      name: 'viewForgeCustomer',
      label: 'View in Forge',
      icon: 'external-link',
      action: 'navigate',
      url: '/forge/erp/customers/{{row.customer_id}}'  // Navigate to Forge UI
    },
    {
      name: 'generateInvoice',
      label: 'Generate Invoice',
      icon: 'file-invoice',
      action: 'workflow',
      workflowId: 'generate_invoice_from_project'  // Trigger Forge ERP workflow
    }
  ]
}
```

---

## Workflow Integration

### Triggering Workflows from Entity Events

**Configure in Entity Designer:**
```javascript
{
  name: 'task',
  metadata: {
    workflowTriggers: {
      onCreate: 'task_created_notification',
      onUpdate: 'task_updated',
      onStatusChange: 'task_status_changed',
      onDelete: 'task_cleanup'
    }
  }
}
```

**Workflow Execution:**
```
Task Created (Low-Code)
    ↓
Entity API detects onCreate event
    ↓
POST /workflow/api/workflows/task_created_notification/execute
    ↓
Workflow fetches Forge contact data
    ↓
POST /herald/api/notifications (send email/push)
    ↓
POST /timeline/api/activities (log activity)
```

### Sample Workflow: Task Assignment

**File:** `workflows/task_created_notification.json`
```json
{
  "id": "task_created_notification",
  "name": "Task Created Notification",
  "description": "Notify assigned contact when task is created",
  "trigger": {
    "type": "entity_event",
    "entity": "task",
    "event": "onCreate"
  },
  "condition": {
    "type": "jsonlex",
    "expression": "$.assigned_to_contact_id != null && $.status === 'todo'"
  },
  "steps": [
    {
      "id": "step1",
      "name": "Fetch Contact Details",
      "type": "api_request",
      "config": {
        "method": "GET",
        "url": "https://localhost:5002/forge/crm/contacts/{{task.assigned_to_contact_id}}",
        "headers": {
          "Authorization": "Bearer {{ca_token}}"
        },
        "outputVariable": "contact"
      }
    },
    {
      "id": "step2",
      "name": "Send Email Notification",
      "type": "herald_notification",
      "config": {
        "channels": ["email", "push"],
        "template": "task_assignment",
        "recipient": {
          "email": "{{contact.emails[0].value}}",
          "name": "{{contact.full_name}}"
        },
        "data": {
          "task_title": "{{task.title}}",
          "task_description": "{{task.description}}",
          "due_date": "{{task.due_date}}",
          "project_name": "{{task.project.name}}"
        }
      }
    },
    {
      "id": "step3",
      "name": "Log to Timeline",
      "type": "timeline_activity",
      "config": {
        "activityType": "task_assigned",
        "entityType": "task",
        "entityId": "{{task.id}}",
        "userId": "{{contact.id}}",
        "message": "Task '{{task.title}}' assigned to {{contact.full_name}}"
      }
    }
  ]
}
```

---

## Data Flow Diagrams

### Flow 1: Creating a Project with Forge Customer

```
User fills Project Form
    ↓
Form Designer validates input
    ↓
POST /lowcode/api/entities/project/data
{
  "name": "Website Redesign",
  "customer_id": "cu111111...",  ← Selected from Forge ERP
  "start_date": "2024-01-01"
}
    ↓
Low-Code API validates customer_id exists
    ↓
SELECT * FROM customers WHERE id = 'cu111111...'  ← Query Forge ERP table
    ↓
INSERT INTO hub_projects (customer_id, ...)  ← FK constraint validated
    ↓
Response with project + customer data
{
  "id": "proj-789",
  "name": "Website Redesign",
  "customer": {  ← Auto-included via relationship
    "name": "TechCorp Solutions",
    "payment_terms": "Net 30"
  }
}
```

### Flow 2: Assigning Task → Notification

```
User assigns task to contact
    ↓
Form submits with assigned_to_contact_id
    ↓
POST /lowcode/api/entities/task/data
{
  "title": "Design mockups",
  "assigned_to_contact_id": "c1111111..."  ← Forge CRM contact
}
    ↓
Entity API fires onCreate event
    ↓
POST /workflow/api/workflows/task_created_notification/execute
{
  "task": { ... },
  "context": { "event": "onCreate" }
}
    ↓
Workflow Step 1: Fetch contact from Forge
GET /forge/crm/contacts/c1111111...
Response: { "full_name": "Sarah Chen", "emails": [...] }
    ↓
Workflow Step 2: Send Herald notification
POST /herald/api/notifications
{
  "recipient": "sarah.chen@techcorp.com",
  "template": "task_assignment",
  "data": { "task_title": "Design mockups", ... }
}
    ↓
Herald sends email + push notification
```

---

## API Integration Points

### Low-Code → Forge APIs

| Low-Code API | Forge API | Description |
|--------------|-----------|-------------|
| `GET /lowcode/api/entities/forge_contact/data` | `GET /forge/crm/contacts` | List all contacts |
| `POST /lowcode/api/entities/forge_contact/data` | `POST /forge/crm/contacts` | Create contact |
| `GET /lowcode/api/entities/forge_invoice/data` | `GET /forge/erp/invoices` | List invoices |
| `POST /lowcode/api/entities/forge_invoice/data` | `POST /forge/erp/invoices` | Create invoice |
| `GET /lowcode/api/entities/forge_product/data` | `GET /forge/erp/products` | List products |

### Authentication Flow

All API requests use **CA Token** authentication:

```javascript
// 1. Generate service token (Low-Code → Forge)
const token = await generateServiceToken({
  serviceName: 'exprsn-lowcode',
  resource: 'https://localhost:5002/forge/erp/customers/*',
  permissions: { read: true, write: true }
});

// 2. Make authenticated request
const response = await fetch('/forge/erp/customers', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
```

---

## Sample Usage Scenarios

### Scenario 1: Create Project Linked to Forge Customer

**Steps:**
1. Open Low-Code App Designer
2. Navigate to "Projects" form
3. Fill in project details
4. Select customer from dropdown (populated from Forge ERP)
5. Click Save

**Behind the Scenes:**
```javascript
// Form submission
POST /lowcode/api/entities/project/data
{
  "name": "Mobile App Development",
  "customer_id": "cu222222-2222-2222-2222-222222222222",  // Forge customer
  "start_date": "2024-12-26",
  "budget": 50000.00
}

// Low-Code validates customer exists in Forge
// Creates project with FK constraint
// Returns project with customer details included
```

### Scenario 2: View All Projects with Customer Info

**Steps:**
1. Open "Projects Overview" grid
2. Grid displays projects with customer names, payment terms
3. Click "View Customer" → Opens Forge ERP customer page

**Behind the Scenes:**
```sql
-- Grid query with JOIN
SELECT
  p.id, p.name, p.status, p.budget,
  c.name as customer_name,
  c.payment_terms,
  c.credit_limit
FROM hub_projects p
LEFT JOIN customers c ON p.customer_id = c.id
ORDER BY p.created_at DESC;
```

### Scenario 3: Workflow Automation

**Steps:**
1. Create new task
2. Assign to contact (Sarah Chen from Forge CRM)
3. Set status to "todo"
4. Click Save

**Behind the Scenes:**
```
1. Task entity onCreate event fires
2. Workflow "task_created_notification" triggered
3. Fetches Sarah's contact details from Forge CRM
4. Sends email via Herald to sarah.chen@techcorp.com
5. Creates timeline activity
6. User sees success message
```

---

## Designer Walkthroughs

### Entity Designer: Create Forge Integration Entity

**URL:** `https://localhost:5002/lowcode/entity-designer?appId=<app-id>`

**Step-by-Step:**

1. **Click "New Entity"**
2. **Basic Info:**
   - Name: `forge_invoice`
   - Display Name: `Invoice`
   - Description: `Direct access to Forge ERP invoices`

3. **Source Configuration:**
   - Source Type: Select **"Forge Integration"**
   - Forge Module: `erp`
   - Forge Table: `invoices`
   - API Endpoint: `/forge/erp/invoices`

4. **Permissions:**
   - Read: ✅
   - Write: ✅
   - Delete: ❌ (invoices shouldn't be deleted)

5. **Click "Auto-Detect Schema"**
   - System reads Forge `invoices` table schema
   - Generates field definitions automatically

6. **Review Fields:**
   ```
   - invoice_number (string)
   - customer_id (uuid) → Relationship
   - issue_date (date)
   - due_date (date)
   - subtotal (decimal)
   - total (decimal)
   - status (enum: draft, sent, paid, overdue)
   ```

7. **Define Relationship:**
   - Name: `customer`
   - Type: `belongsTo`
   - Target: `forge:customers`
   - Foreign Key: `customer_id`

8. **Click "Save Entity"**

**Result:**
- Entity appears in application entities list
- Can be used in forms, grids, workflows
- API endpoint auto-generated: `/lowcode/api/entities/forge_invoice/data`

### Form Designer: Build Forge Data Entry Form

**URL:** `https://localhost:5002/lowcode/forms/new?appId=<app-id>`

**Step-by-Step:**

1. **Form Configuration:**
   - Name: `invoice_entry_form`
   - Display Name: `Invoice Entry`
   - Layout: Two-column

2. **Add Data Source:**
   - Click "Data Sources" tab
   - Add Source:
     - Name: `invoiceData`
     - Type: `Entity`
     - Entity: `forge_invoice` (select from dropdown)
     - Mode: `Two-Way Binding`

3. **Drag Components:**

   **Column 1:**
   - Text Input: `invoice_number` (label: "Invoice Number")
   - Entity Picker: `customer_id` (label: "Customer", entity: `forge:customers`)
   - Date: `issue_date` (label: "Issue Date")

   **Column 2:**
   - Date: `due_date` (label: "Due Date")
   - Number: `subtotal` (label: "Subtotal", format: currency)
   - Number: `total` (label: "Total Amount", format: currency)
   - Dropdown: `status` (options: draft, sent, paid, overdue)

4. **Configure Entity Picker:**
   - Select `customer_id` component
   - Properties:
     - Entity Type: `forge:customers`
     - Display Field: `name`
     - Search Fields: `name, customer_number, email`
     - Enable Search: ✅

5. **Add Event Handler:**
   - Event: `onSubmit`
   - Handler Type: `Data Operation`
   - Operation: `Save`
   - Data Source: `invoiceData`

6. **Click "Save Form"**

**Result:**
- Form can create/edit Forge ERP invoices
- Customer dropdown populated from Forge
- Validation applied from entity schema
- Saves directly to Forge `invoices` table

### Grid Designer: Display Forge Data

**URL:** `https://localhost:5002/lowcode/grids/new?appId=<app-id>`

**Step-by-Step:**

1. **Grid Configuration:**
   - Name: `invoices_list`
   - Display Name: `Invoices List`
   - Grid Type: `Editable`

2. **Select Entity:**
   - Entity: `forge_invoice`
   - Include Relationships: `customer` ✅

3. **Define Columns:**

   | Column Name | Field | Width | Sortable | Template |
   |-------------|-------|-------|----------|----------|
   | Invoice # | invoice_number | 120 | ✅ | - |
   | Customer | customer.name | 200 | ✅ | - |
   | Issue Date | issue_date | 120 | ✅ | {{formatDate}} |
   | Due Date | due_date | 120 | ✅ | {{formatDate}} |
   | Total | total | 120 | - | {{currency}} |
   | Status | status | 100 | - | {{statusBadge}} |

4. **Add Actions:**
   - View: Opens invoice form in readonly mode
   - Edit: Opens invoice form in edit mode
   - Download PDF: Calls Forge ERP PDF generator

5. **Configure Pagination:**
   - Enabled: ✅
   - Page Size: 25
   - Show Page Numbers: ✅

6. **Enable Export:**
   - Formats: CSV, Excel, PDF
   - Include Relationships: ✅

7. **Click "Save Grid"**

**Result:**
- Grid displays Forge ERP invoices
- Customer names shown from relationship
- Sorting/filtering/pagination works
- Actions interact with Forge data

---

## Summary

The Business Operations Hub demonstrates **complete integration** between:

✅ **Low-Code Platform** - Visual builders for rapid development
✅ **Forge CRM/ERP** - Production-grade business modules
✅ **Service Layer** - Workflow, notifications, timeline
✅ **Three Integration Patterns** - Virtual entities, foreign keys, events

### Key Benefits:

1. **No Code Duplication** - Virtual entities access Forge tables directly
2. **Referential Integrity** - Foreign key constraints ensure data validity
3. **Automation** - Workflows trigger on entity events
4. **Unified UI** - Low-Code forms/grids work seamlessly with Forge data
5. **Real-Time** - Changes in Low-Code or Forge are immediately reflected

### Production Readiness:

- ✅ All integration patterns tested and documented
- ✅ Authentication/authorization via CA tokens
- ✅ Transaction support for cross-table operations
- ✅ Comprehensive error handling
- ✅ Audit logging for all Forge operations

This integration architecture serves as a **reference implementation** for building complex business applications within the Exprsn ecosystem.
