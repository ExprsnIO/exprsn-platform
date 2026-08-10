# Entity Designer - Redesign Specification

## Overview
Complete redesign of the Entity Designer for the Low-Code Platform with modern UX, Forge integration, and advanced features.

## Key Features

### 1. Modern Tab-Based Interface
- **Schema** - Define fields, types, validation
- **Relationships** - Visual relationship builder
- **Forge Integration** - Wizard for Forge entities
- **Workflows** - Configure lifecycle triggers
- **Advanced** - Audit, versioning, permissions
- **Preview** - See entity in action

### 2. Visual Field Builder
**Drag-and-Drop Interface:**
- Field palette on left
- Schema canvas in center
- Properties panel on right

**Field Types:**
- Text, Number, Date, Boolean, UUID
- Enum, Array, JSON, JSONB
- Foreign Key (auto-relationship)
- Computed (JSONLex expression)

**Validation:**
- Required, Unique, Min/Max length
- Custom regex patterns
- JSONLex validation expressions

### 3. Forge Integration Wizard

**Step 1: Source Selection**
```
○ Custom Entity (new table)
○ Forge CRM Entity (virtual)
○ Forge ERP Entity (virtual)
```

**Step 2: Forge Configuration** (if Forge selected)
```
Module: [CRM ▼]
Table:  [contacts ▼]
API:    /forge/crm/contacts
```

**Step 3: Schema Detection**
- Auto-detect Forge table schema
- Select fields to expose
- Configure permissions (read/write/delete)

**Step 4: Relationship Mapping**
- Map Forge FKs to Low-Code entities
- Define inverse relationships

### 4. Relationship Visualizer

**Visual Graph:**
```
┌─────────────┐         ┌──────────────┐
│  Project    │────────→│  Customer    │
│  (Custom)   │ n:1     │  (Forge ERP) │
└─────────────┘         └──────────────┘
      │ 1:n
      ↓
┌─────────────┐         ┌──────────────┐
│  Task       │────────→│  Contact     │
│  (Custom)   │ n:1     │  (Forge CRM) │
└─────────────┘         └──────────────┘
```

**Interactive:**
- Click entity to navigate
- Hover for field list
- Right-click to add relationship

### 5. Live Preview

**Form Preview:**
Shows how entity fields will render in forms:
```
┌─────────────────────────────────┐
│ Create New Project              │
├─────────────────────────────────┤
│ Project Name: [____________]    │
│ Customer:     [Select... ▼]     │
│ Start Date:   [📅 mm/dd/yyyy]  │
│ Budget:       [$____________]   │
│                                 │
│ [Cancel] [Save]                 │
└─────────────────────────────────┘
```

**Grid Preview:**
Shows entity data in grid format

**API Preview:**
Shows generated API endpoints and sample requests

### 6. Field Library

**Common Patterns:**
- ID field (UUID, auto)
- Name field (string, required)
- Description (text, optional)
- Status (enum with common values)
- Timestamps (created_at, updated_at, auto)
- Soft Delete (deleted_at)
- Audit Fields (created_by, updated_by)

**Click to add entire pattern**

### 7. Validation & Error Handling

**Real-Time Validation:**
- ✓ Unique entity name
- ✓ Valid field names (no SQL keywords)
- ✓ No circular relationships
- ✓ Forge table exists
- ⚠ Warnings for non-indexed FKs

**Error Messages:**
```
⚠ Field "order" is a SQL reserved keyword
  → Suggestion: Use "order_number" instead

⚠ No primary key defined
  → Suggestion: Add "id" UUID field

✓ Entity schema is valid
```

### 8. Smart Defaults

**When creating new entity:**
- Auto-add ID field (UUID)
- Auto-add timestamps
- Suggest pluralization (Project → Projects)
- Suggest table name (project → hub_projects)

**When adding FK field:**
- Auto-detect relationship type
- Suggest relationship name
- Offer to create inverse relationship

## UI Components

### Header
```
┌────────────────────────────────────────────────────────┐
│ ← Entity Designer                                       │
│                                                         │
│ [Entity Name_______] Custom Entity ▼   [Draft ▼]      │
│                                                         │
│ [Save Draft] [Publish] [Preview] [Export SQL]          │
└────────────────────────────────────────────────────────┘
```

### Tabs
```
┌──────┬──────────┬───────────┬──────────┬──────────┬─────────┐
│Schema│Relation- │  Forge    │Workflows │ Advanced │ Preview │
│      │  ships   │Integration│          │          │         │
└──────┴──────────┴───────────┴──────────┴──────────┴─────────┘
```

### Field Builder (Schema Tab)
```
┌─────────────┬─────────────────────────────────┬──────────────┐
│ Field Types │ Schema                          │ Properties   │
├─────────────┼─────────────────────────────────┼──────────────┤
│             │ ┌─ id (UUID)                   │ Field: id    │
│ Text        │ ├─ name (String) *              │ Type: UUID   │
│ Number      │ ├─ customer_id (UUID) → FK      │ Primary: Yes │
│ Date        │ ├─ status (Enum)                │ Auto: Yes    │
│ Boolean     │ ├─ start_date (Date) *          │              │
│ UUID        │ ├─ budget (Decimal)             │ [x] Indexed  │
│ Enum        │ ├─ created_at (Timestamp)       │ [ ] Unique   │
│ JSON        │ └─ updated_at (Timestamp)       │ [ ] Required │
│ Array       │                                 │              │
│ FK          │ [+ Add Field]                   │ Validation:  │
│ Computed    │                                 │ [None ▼]     │
│             │                                 │              │
│ Common      │                                 │ Default:     │
│ Patterns:   │                                 │ [______]     │
│ • ID        │                                 │              │
│ • Name      │                                 │ Description: │
│ • Status    │                                 │ [________]   │
│ • Audit     │                                 │              │
└─────────────┴─────────────────────────────────┴──────────────┘
```

### Forge Integration Tab
```
┌──────────────────────────────────────────────────────────────┐
│ Forge Integration Wizard                                      │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ Step 1 of 4: Source Selection                                │
│                                                               │
│ ○ Custom Entity (Create new table)                           │
│   Creates a new table in the exprsn_svr database            │
│                                                               │
│ ● Forge CRM Entity (Virtual access)                          │
│   Direct access to Forge CardDAV contacts/companies          │
│                                                               │
│ ○ Forge ERP Entity (Virtual access)                          │
│   Direct access to Forge ERP customers/invoices/products     │
│                                                               │
│                            [Cancel] [Next: Configuration →]  │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Step 2 of 4: Forge Configuration                             │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ Forge Module:  [CRM ▼]                                       │
│                                                               │
│ Forge Table:   [contacts ▼]                                  │
│                                                               │
│ API Endpoint:  /forge/crm/contacts                           │
│                                                               │
│ Permissions:                                                  │
│ [x] Read    Allow viewing contact data                       │
│ [x] Write   Allow creating/editing contacts                  │
│ [ ] Delete  Allow deleting contacts                          │
│                                                               │
│                        [← Back] [Next: Schema Detection →]   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Step 3 of 4: Schema Detection                                │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ ✓ Connected to Forge CRM contacts table                      │
│ ✓ Detected 33 fields                                         │
│                                                               │
│ Select fields to expose:                                     │
│                                                               │
│ [x] id               UUID        Primary Key                 │
│ [x] first_name       String      First name                  │
│ [x] last_name        String      Last name                   │
│ [x] full_name        String      Full name                   │
│ [x] organization     String      Company/Organization        │
│ [x] job_title        String      Job title                   │
│ [x] emails           JSONB       Email addresses             │
│ [x] phones           JSONB       Phone numbers               │
│ [ ] birthday         Date        Date of birth               │
│ [ ] photo_url        String      Photo URL                   │
│ [ ] vcard            Text        vCard data                  │
│                                                               │
│ [Select All] [Select None]                                   │
│                                                               │
│                   [← Back] [Next: Relationships →]           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ Step 4 of 4: Relationship Mapping                            │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ Map Forge foreign keys to Low-Code entities:                 │
│                                                               │
│ addressbook_id → contact_addressbooks                        │
│ [Don't map ▼]                                                │
│                                                               │
│ linked_crm_contact_id → None                                 │
│ [Don't map ▼]                                                │
│                                                               │
│                                                               │
│ Create relationships to other entities:                       │
│                                                               │
│ [+ Add Relationship]                                          │
│                                                               │
│ Suggested relationships based on other entities:              │
│ • Task.assigned_to_contact_id → forge_contact.id             │
│   [Add Relationship]                                          │
│                                                               │
│ • TeamMember.contact_id → forge_contact.id                   │
│   [Add Relationship]                                          │
│                                                               │
│                            [← Back] [Finish & Create Entity] │
└──────────────────────────────────────────────────────────────┘
```

### Relationships Tab
```
┌──────────────────────────────────────────────────────────────┐
│ Entity Relationships                                          │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ Relationships from this entity:                               │
│                                                               │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ customer                                                 │ │
│ │ Type: belongsTo                                          │ │
│ │ Target: forge:customers (Forge ERP)                      │ │
│ │ Foreign Key: customer_id                                 │ │
│ │ On Delete: SET NULL                                      │ │
│ │                                           [Edit] [Delete]│ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                               │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ tasks                                                    │ │
│ │ Type: hasMany                                            │ │
│ │ Target: task (Custom)                                    │ │
│ │ Foreign Key: task.project_id                             │ │
│ │ On Delete: CASCADE                                       │ │
│ │                                           [Edit] [Delete]│ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                               │
│ [+ Add Relationship]                                          │
│                                                               │
│ ─────────────────────────────────────────────────────────── │
│                                                               │
│ Visual Relationship Diagram:                                  │
│                                                               │
│     ┌──────────────┐                                         │
│     │  Customer    │                                         │
│     │ (Forge ERP)  │                                         │
│     └──────┬───────┘                                         │
│            │ 1                                                │
│            │                                                  │
│       n    ↓                                                  │
│     ┌──────────────┐         ┌──────────────┐               │
│     │   Project    │───────→ │   Contact    │               │
│     │  (Custom)    │  owner  │ (Forge CRM)  │               │
│     └──────┬───────┘         └──────────────┘               │
│            │ 1                                                │
│            │                                                  │
│       n    ↓                                                  │
│     ┌──────────────┐                                         │
│     │    Task      │                                         │
│     │  (Custom)    │                                         │
│     └──────────────┘                                         │
│                                                               │
│ [Export Diagram] [Full Screen]                               │
└──────────────────────────────────────────────────────────────┘
```

### Advanced Tab
```
┌──────────────────────────────────────────────────────────────┐
│ Advanced Settings                                             │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│ Audit Logging:                                                │
│ [x] Enable audit logging                                     │
│     Track all create, update, delete operations              │
│                                                               │
│ Versioning:                                                   │
│ [ ] Enable versioning                                         │
│     Keep history of all changes (increases storage)          │
│                                                               │
│ Soft Deletes:                                                 │
│ [x] Enable soft deletes                                      │
│     Records are marked deleted, not removed from DB          │
│                                                               │
│ Timestamps:                                                   │
│ [x] created_at  (Auto-managed)                               │
│ [x] updated_at  (Auto-managed)                               │
│ [x] deleted_at  (For soft deletes)                           │
│                                                               │
│ Permissions:                                                  │
│ Default Access: [Public ▼]                                   │
│ Create:         [Authenticated Users ▼]                      │
│ Read:           [Public ▼]                                   │
│ Update:         [Owner or Admin ▼]                           │
│ Delete:         [Admin Only ▼]                               │
│                                                               │
│ Caching:                                                      │
│ [ ] Enable Redis caching                                     │
│     Cache TTL: [300] seconds                                 │
│                                                               │
│ Indexes:                                                      │
│ Automatically create indexes on:                              │
│ [x] Primary keys                                             │
│ [x] Foreign keys                                             │
│ [x] Unique fields                                            │
│ [ ] All searchable fields (may slow writes)                  │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

## Keyboard Shortcuts

- `Ctrl+S` - Save draft
- `Ctrl+Shift+P` - Publish
- `Ctrl+Shift+E` - Export SQL
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo
- `F5` - Refresh preview
- `Tab` - Next tab
- `Shift+Tab` - Previous tab
- `/` - Focus search

## Mobile Responsive

- Collapse field palette to bottom drawer
- Stack panels vertically
- Touch-friendly controls
- Swipe between tabs

## Accessibility

- ARIA labels on all controls
- Keyboard navigation
- Screen reader support
- High contrast mode
- Focus indicators

## Performance

- Virtual scrolling for large schemas
- Debounced validation
- Lazy load relationship diagram
- Progressive enhancement

## Future Enhancements

- AI-assisted field suggestions
- Import from CSV/Excel
- Generate from existing table
- Schema comparison (diff)
- Migration generator
- Entity templates/presets
- Collaborative editing
- Version control integration
