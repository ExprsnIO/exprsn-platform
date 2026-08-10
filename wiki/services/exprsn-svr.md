# exprsn-svr - Business Hub

**Port**: 5001 (HTTPS: 5443) | **Status**: ✅ Production Ready | **Type**: Business Applications

## Overview

The **exprsn-svr** service is the comprehensive **Business Hub** that combines the Low-Code Platform and Forge CRM/ERP/Groupware into a unified business application platform. This is the result of merging the standalone exprsn-forge service in December 2024.

---

## Components

### 1. Low-Code Platform (`/lowcode`)

Visual application development platform with:

#### Entity Designer
- Visual database schema designer
- Relationship management
- Field type configuration
- Validation rules
- Auto-generate CRUD operations

#### Form Designer (27 Components)
- Text Input, TextArea, Number, Email, URL
- Select, Multi-Select, Radio, Checkbox
- Date, DateTime, Time
- File Upload, Image Upload
- Rich Text Editor (WYSIWYG)
- Data Grid, Repeater
- Tabs, Accordion, Card
- Button, Link, Divider
- Conditional Logic
- Formula Fields (JSONLex)

#### Grid Designer
- Column configuration
- Sorting, filtering, pagination
- Bulk actions
- Export (CSV, Excel, PDF)
- Inline editing

#### Visual Query Builder
- Drag-and-drop query builder
- JOIN support
- Aggregations
- Filters and conditions
- Preview results

### 2. Forge CRM (`/forge/crm`)

**92+ Endpoints** for customer relationship management:

#### Modules
- **Contacts**: Full contact management
- **Accounts**: Company/organization tracking
- **Leads**: Lead capture and qualification
- **Opportunities**: Sales pipeline management
- **Cases**: Customer support tickets
- **Tasks**: Activity tracking
- **Campaigns**: Marketing campaigns
- **Activities**: Calls, meetings, emails

### 3. Forge Groupware (`/forge/groupware`)

Collaboration tools:

#### Calendar (CalDAV Compatible)
- Event management
- CalDAV protocol support
- iCal format
- Recurring events
- Invitations/RSVPs

#### Email Integration
- Email tracking
- Templates
- Mail merge

#### Tasks & Projects
- Task management
- Project tracking
- Gantt charts
- Dependencies

#### Documents
- Document library
- Version control
- WebDAV support
- Collaboration

#### Wiki
- Knowledge management
- Markdown support
- Search
- Categories/tags

### 4. Forge ERP (`/forge/erp`)

Enterprise resource planning:

#### Financial Management
- Accounts receivable/payable
- General ledger
- Journal entries
- Chart of accounts
- Bank reconciliation

#### Inventory Management
- Stock tracking
- Warehouses
- Stock movements
- Reorder points

#### Human Resources
- Employee management
- Payroll
- Leave requests
- Performance reviews

#### Asset Management
- Asset tracking
- Depreciation
- Maintenance schedules

#### Project Management
- Projects
- Tasks
- Time tracking
- Resource allocation
- Budget tracking

---

## API Endpoints

### Low-Code Platform

#### Applications
```http
GET    /lowcode/api/applications
POST   /lowcode/api/applications
GET    /lowcode/api/applications/:id
PUT    /lowcode/api/applications/:id
DELETE /lowcode/api/applications/:id
```

#### Entities
```http
GET    /lowcode/api/entities
POST   /lowcode/api/entities
GET    /lowcode/api/entities/:id
PUT    /lowcode/api/entities/:id
DELETE /lowcode/api/entities/:id
```

#### Forms
```http
GET    /lowcode/api/forms
POST   /lowcode/api/forms
GET    /lowcode/api/forms/:id
PUT    /lowcode/api/forms/:id
DELETE /lowcode/api/forms/:id
POST   /lowcode/api/forms/:id/submit
```

### Forge CRM

#### Contacts
```http
GET    /forge/api/crm/contacts
POST   /forge/api/crm/contacts
GET    /forge/api/crm/contacts/:id
PUT    /forge/api/crm/contacts/:id
DELETE /forge/api/crm/contacts/:id
```

#### Opportunities
```http
GET    /forge/api/crm/opportunities
POST   /forge/api/crm/opportunities
GET    /forge/api/crm/opportunities/:id
PUT    /forge/api/crm/opportunities/:id
PATCH  /forge/api/crm/opportunities/:id/stage
```

### Forge ERP

#### Invoices
```http
GET    /forge/api/erp/invoices
POST   /forge/api/erp/invoices
GET    /forge/api/erp/invoices/:id
PUT    /forge/api/erp/invoices/:id
POST   /forge/api/erp/invoices/:id/send
POST   /forge/api/erp/invoices/:id/payment
```

---

## Configuration

```bash
# Service Configuration
PORT=5001
HTTPS_PORT=5443
NODE_ENV=production
SERVICE_NAME=exprsn-svr

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=exprsn_svr
DB_USER=postgres
DB_PASSWORD=secure_password

# Redis
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379

# Low-Code Configuration
LOWCODE_ENABLED=true
LOWCODE_MAX_APPS=100
LOWCODE_MAX_ENTITIES_PER_APP=50

# Forge CRM Configuration
FORGE_CRM_ENABLED=true
FORGE_PIPELINE_STAGES=Lead,Qualified,Proposal,Negotiation,Closed Won,Closed Lost

# Forge ERP Configuration
FORGE_ERP_ENABLED=true
FORGE_FISCAL_YEAR_START=01-01
FORGE_DEFAULT_CURRENCY=USD

# File Storage
STORAGE_TYPE=local  # or 's3'
STORAGE_PATH=./uploads
MAX_FILE_SIZE=10485760  # 10MB

# CalDAV Configuration
CALDAV_ENABLED=true
CALDAV_URL=https://localhost:5443/caldav

# WebDAV Configuration
WEBDAV_ENABLED=true
WEBDAV_URL=https://localhost:5443/webdav
```

---

## JSONLex Expressions

The Low-Code platform uses **JSONLex** for dynamic expressions:

### Examples

#### Calculate Total
```json
{
  "expression": "SUM(items.*.price * items.*.quantity)",
  "context": {
    "items": [
      { "price": 10, "quantity": 2 },
      { "price": 15, "quantity": 3 }
    ]
  }
}
```

#### Conditional Logic
```json
{
  "expression": "IF(amount > 1000, 'High Value', 'Standard')",
  "context": {
    "amount": 1500
  }
}
```

#### Date Calculations
```json
{
  "expression": "DATEDIFF(dueDate, TODAY(), 'days')",
  "context": {
    "dueDate": "2026-02-01"
  }
}
```

---

## Frontend (React/Vite)

The Business Hub includes a modern React frontend:

### Technology Stack
- **React 18**: UI framework
- **Vite**: Build tool
- **Zustand**: State management
- **React Router**: Navigation
- **Bootstrap 5.3**: UI components
- **Socket.IO Client**: Real-time updates

### Key Features
- Server-side rendering (SSR) ready
- Hot module replacement (HMR)
- Code splitting
- Responsive design
- Dark mode support

---

## Workflow Integration

The Business Hub integrates with **exprsn-workflow**:

### Trigger Workflows from CRM/ERP
```javascript
// When opportunity stage changes
if (opportunity.stage === 'Closed Won') {
  triggerWorkflow('new-customer-onboarding', {
    customerId: opportunity.accountId,
    dealValue: opportunity.amount
  });
}
```

### Use CRM Data in Workflows
```javascript
// Workflow step: Update contact
{
  "type": "api",
  "config": {
    "url": "http://localhost:5001/forge/api/crm/contacts/:id",
    "method": "PUT",
    "body": {
      "status": "Active",
      "lastContactDate": "{{now}}"
    }
  }
}
```

---

## Database Schema

### Low-Code Tables

#### Applications
```sql
CREATE TABLE lowcode_applications (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(100),
  settings JSONB,
  user_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Entities
```sql
CREATE TABLE lowcode_entities (
  id UUID PRIMARY KEY,
  application_id UUID REFERENCES lowcode_applications(id),
  name VARCHAR(255) NOT NULL,
  table_name VARCHAR(255) NOT NULL,
  fields JSONB NOT NULL,
  relationships JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Forge CRM Tables

#### Contacts
```sql
CREATE TABLE crm_contacts (
  id UUID PRIMARY KEY,
  first_name VARCHAR(255),
  last_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  company_id UUID,
  status VARCHAR(50),
  tags JSONB,
  custom_fields JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Security

### Authentication
- Integrates with **exprsn-auth** for SSO
- CA token validation for API access
- Role-based access control (RBAC)

### Authorization
- Organization-level isolation
- Row-level security (RLS) for multi-tenancy
- Field-level permissions

### Data Protection
- Input sanitization (XSS prevention)
- SQL injection protection (Sequelize ORM)
- CSRF protection (csurf middleware)
- File upload validation

---

## Performance

### Optimization Techniques
- **Redis caching**: Form schemas, entity metadata
- **Database indexing**: Foreign keys, frequently queried fields
- **Query optimization**: Eager loading, select specific fields
- **Asset optimization**: Minification, compression, CDN

### Benchmarks
- **Form load**: <200ms
- **Grid load (100 rows)**: <300ms
- **API response**: <100ms (cached), <500ms (uncached)
- **Concurrent users**: 1000+

---

## Development

### Running Locally
```bash
cd src/exprsn-svr
npm install

# Run migrations
npm run migrate

# Seed data
npm run seed

# Start server
npm start

# Or development mode with hot reload
npm run dev
```

### Building Frontend
```bash
cd src/exprsn-svr/lowcode/frontend
npm install
npm run build
```

---

## Testing

```bash
cd src/exprsn-svr
npm test
```

### Test Coverage
- CRM API endpoints: 75%+
- Low-Code core: 65%+
- Groupware: 60%+
- ERP modules: 70%+

---

## Migration from Standalone Forge

The exprsn-forge service was merged into exprsn-svr in December 2024:

### Changes
- **New base path**: `/forge` (was root)
- **Unified authentication**: Now uses exprsn-auth
- **Shared database**: Combined with Low-Code tables
- **Frontend integration**: Single React app

### Migration Script
```bash
node scripts/migrate-forge-to-svr.js
```

---

## Related Documentation

- [Low-Code Platform Guide](../guides/Low-Code-Platform)
- [CRM User Guide](../guides/CRM-User-Guide)
- [ERP Setup](../guides/ERP-Setup)
- [Workflow Integration](exprsn-workflow)
- [JSONLex Reference](../guides/JSONLex-Reference)

---

## Support

For Business Hub issues:
- **Logs**: `src/exprsn-svr/logs/`
- **Issues**: [GitHub Issues](https://github.com/ExprsnIO/Exprsn/issues)
- **Documentation**: This wiki + `/lowcode/docs`
