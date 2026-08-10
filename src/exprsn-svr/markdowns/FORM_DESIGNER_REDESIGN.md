# Form Designer UI/UX Redesign Plan
## Professional IDE-Style Form Builder

---

## 🎯 Design Requirements

### Layout Structure
```
┌─────────────────────────────────────────────────────────────────┐
│ Header: Form Name | Actions (Save, Publish, Preview, Close)    │
├──────────┬─────────────────────────────────────┬────────────────┤
│          │ Top Tabs Navigation Bar             │                │
│          ├─────────────────────────────────────┤                │
│          │ Code&Functions | Event Handlers |   │                │
│ Toolbox  │ Variables | Permissions | Workflows │   Properties   │
│ (Left)   │ Forge CRM | Form JSON               │   (Right)      │
│          ├─────────────────────────────────────┤                │
│ 280px    │                                     │    380px       │
│          │     Form Canvas (Center)            │                │
│          │     - Drag & Drop Interface         │                │
│          │     - Live Preview                  │                │
│          │     - Component Selection           │                │
│          │                                     │                │
└──────────┴─────────────────────────────────────┴────────────────┘
```

### Tab Specifications

#### 1. Code & Functions Tab
**Purpose:** Custom JavaScript functions for form logic

**Features:**
- Function table with columns: Name, Parameters, Return Type, Description
- Add/Edit/Delete functions
- Monaco editor for function code
- Syntax validation
- Auto-complete for form fields and variables

**UI:**
```
┌──────────────────────────────────────────────────────────┐
│ [+ Add Function]                          [Test] [Save]  │
├──────────────────────────────────────────────────────────┤
│ Function Name   | Params      | Return | Description     │
│ calculateTotal  | (items)     | number | Sum item prices │
│ validateEmail   | (email)     | bool   | Email validator │
│ formatDate      | (date, fmt) | string | Date formatter  │
├──────────────────────────────────────────────────────────┤
│ Function Editor:                                         │
│ ┌────────────────────────────────────────────────────┐  │
│ │ function calculateTotal(items) {                   │  │
│ │   return items.reduce((sum, item) =>              │  │
│ │     sum + (item.price * item.quantity), 0);       │  │
│ │ }                                                  │  │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

#### 2. Event Handlers Tab
**Purpose:** Define event-driven behaviors

**Features:**
- Object lookup by name/ID
- Event trigger selection (onClick, onChange, onFocus, onBlur, onSubmit)
- Action types: Custom Function, Navigation, Data Operation, Workflow, API Call
- Conditional execution
- Event chaining

**UI:**
```
┌──────────────────────────────────────────────────────────┐
│ [+ Add Event Handler]                                    │
├──────────────────────────────────────────────────────────┤
│ Object: [field_email        ▼] Event: [onChange    ▼]   │
│ Action: [Validate           ▼] Function: [validateEmail]│
│                                                          │
│ ☐ Stop propagation  ☐ Prevent default                   │
│ ☐ Run conditionally: [                                ] │
│                                                          │
│ Event Handlers List:                                     │
│ ┌────────────────────────────────────────────────────┐  │
│ │ field_email.onChange → validateEmail()             │  │
│ │ btn_submit.onClick → submitForm()                  │  │
│ │ field_amount.onBlur → calculateTotal()             │  │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

#### 3. Variables Tab
**Purpose:** Application and form-level variables

**Features:**
- Key/value table
- Variable types: String, Number, Boolean, Object, Array
- Scope: Form, Session, Global
- Default values
- Binding to data sources

**UI:**
```
┌──────────────────────────────────────────────────────────┐
│ [+ Add Variable]                         [Import] [Clear]│
├──────────────────────────────────────────────────────────┤
│ Key            | Type    | Scope   | Default Value       │
│ currentUser    | Object  | Session | {}                  │
│ isLoading      | Boolean | Form    | false               │
│ itemCount      | Number  | Form    | 0                   │
│ apiEndpoint    | String  | Global  | https://api.com     │
├──────────────────────────────────────────────────────────┤
│ Selected Variable: currentUser                           │
│ Value Preview:                                           │
│ ┌────────────────────────────────────────────────────┐  │
│ │ {                                                  │  │
│ │   "id": "uuid",                                    │  │
│ │   "name": "John Doe",                              │  │
│ │   "email": "john@example.com"                      │  │
│ │ }                                                  │  │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

#### 4. Permissions Tab
**Purpose:** Fine-grained access control

**Features:**
- User-based permissions
- Role-based permissions
- Domain restrictions
- Permission types: View, Edit, Submit, Delete
- Token-based access (CA Token integration)
- exprsn-auth integration

**UI:**
```
┌──────────────────────────────────────────────────────────┐
│ Form Permissions            Component Permissions        │
├──────────────────────────────────────────────────────────┤
│ ☑ View: [All users        ▼]                            │
│ ☑ Edit: [Owner + Admins   ▼]                            │
│ ☑ Submit: [Authenticated  ▼]                            │
│ ☐ Delete: [Admins only    ▼]                            │
│                                                          │
│ Token Requirements:                                      │
│ ☑ Require CA Token                                       │
│ ☑ Validate exprsn-auth                                   │
│ Permissions: [read, write ▼]                            │
│                                                          │
│ Component-Level:                                         │
│ ┌────────────────────────────────────────────────────┐  │
│ │ field_salary → Visible: [HR Role]                  │  │
│ │ field_salary → Editable: [HR Manager]              │  │
│ │ btn_approve → Visible: [Manager + Admin]           │  │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

#### 5. Workflows Tab (Exprsn-Kicks Integration)
**Purpose:** Visual workflow automation

**Features:**
- Exprsn-Kicks canvas embedded
- Trigger workflows on form events
- Pass form data to workflow inputs
- Display workflow execution status
- Integration with BPMN processes

**UI:**
```
┌──────────────────────────────────────────────────────────┐
│ [+ New Workflow] [Import] [Export]          Exprsn-Kicks │
├──────────────────────────────────────────────────────────┤
│ Workflow Triggers:                                       │
│ ☑ onSubmit → Approval Workflow                          │
│ ☐ onChange → Validation Pipeline                        │
│ ☐ onLoad → Data Prefetch                                │
│                                                          │
│ ┌────────────────────────────────────────────────────┐  │
│ │                                                    │  │
│ │   [Input] ──→ [Validate] ──→ [Transform]          │  │
│ │                    │                               │  │
│ │                    ├──→ [Notify]                   │  │
│ │                    │                               │  │
│ │                    └──→ [Save] ──→ [Output]        │  │
│ │                                                    │  │
│ │  Exprsn-Kicks Visual Workflow Canvas               │  │
│ └────────────────────────────────────────────────────┘  │
│ Field Mapping:                                           │
│ form.email → workflow.input.email                        │
│ form.amount → workflow.input.totalAmount                 │
└──────────────────────────────────────────────────────────┘
```

#### 6. Forge CRM Tab
**Purpose:** CRM/ERP integration

**Features:**
- Import Forge schemas (Contact, Account, Lead, Opportunity, Case, Task)
- Map form fields to CRM entities
- CRUD operations on CRM data
- Lookup fields
- Related records

**UI:**
```
┌──────────────────────────────────────────────────────────┐
│ [Import Schema ▼] CRM | ERP | Groupware                 │
├──────────────────────────────────────────────────────────┤
│ Connected Entity: [Contact        ▼]                     │
│ Operation: [Create on Submit ▼]                          │
│                                                          │
│ Field Mapping:                                           │
│ ┌────────────────────────────────────────────────────┐  │
│ │ Form Field        → CRM Field                      │  │
│ │ field_firstName   → contact.firstName              │  │
│ │ field_lastName    → contact.lastName               │  │
│ │ field_email       → contact.email                  │  │
│ │ field_phone       → contact.phone                  │  │
│ │ field_company     → contact.accountId (Lookup)     │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ Lookup Configuration:                                    │
│ Company → Account entity                                 │
│ Display: account.name                                    │
│ Search: name, industry                                   │
└──────────────────────────────────────────────────────────┘
```

#### 7. Form JSON Tab
**Purpose:** Raw JSON editor for advanced users

**Features:**
- Monaco JSON editor
- Syntax highlighting
- Validation
- Import/Export
- Version comparison

**UI:**
```
┌──────────────────────────────────────────────────────────┐
│ [Import] [Export] [Validate] [Format]        [Copy JSON] │
├──────────────────────────────────────────────────────────┤
│ {                                                        │
│   "name": "customer-form",                               │
│   "displayName": "Customer Registration",                │
│   "components": [                                        │
│     {                                                    │
│       "id": "field_1",                                   │
│       "type": "text",                                    │
│       "properties": {                                    │
│         "label": "First Name",                           │
│         "required": true                                 │
│       }                                                  │
│     }                                                    │
│   ],                                                     │
│   "dataBinding": {...},                                  │
│   "eventHandlers": [...],                                │
│   "permissions": {...}                                   │
│ }                                                        │
└──────────────────────────────────────────────────────────┘
```

---

## 🔧 Technical Implementation

### File Structure
```
lowcode/
├── views/
│   └── form-designer-pro.ejs         (Main enhanced designer)
├── public/
│   ├── css/
│   │   └── form-designer-pro.css     (Styling)
│   └── js/
│       ├── form-designer-pro.js      (Main controller)
│       ├── form-functions-manager.js (Functions tab)
│       ├── form-events-manager.js    (Event handlers tab)
│       ├── form-variables-manager.js (Variables tab)
│       ├── form-permissions-manager.js (Permissions tab)
│       ├── form-workflows-manager.js (Workflows + Exprsn-Kicks)
│       ├── form-forge-manager.js     (Forge CRM integration)
│       └── form-json-manager.js      (JSON editor)
```

### Key Technologies
- **Monaco Editor** - Code editing (already included)
- **Exprsn-Kicks** - Visual workflows (integrate from ~/Projects/exprsn-kicks)
- **Socket.IO** - Real-time collaboration
- **Drag & Drop API** - Component placement
- **Local Storage** - Auto-save

---

## 🎨 UI Components

### Top Tab Bar
```html
<div class="top-tabs">
  <button class="tab-btn active" data-tab="functions">
    <i class="fas fa-code"></i> Code & Functions
  </button>
  <button class="tab-btn" data-tab="events">
    <i class="fas fa-bolt"></i> Event Handlers
  </button>
  <button class="tab-btn" data-tab="variables">
    <i class="fas fa-database"></i> Variables
  </button>
  <button class="tab-btn" data-tab="permissions">
    <i class="fas fa-lock"></i> Permissions
  </button>
  <button class="tab-btn" data-tab="workflows">
    <i class="fas fa-project-diagram"></i> Workflows
  </button>
  <button class="tab-btn" data-tab="forge">
    <i class="fas fa-building"></i> Forge CRM
  </button>
  <button class="tab-btn" data-tab="json">
    <i class="fas fa-file-code"></i> Form JSON
  </button>
</div>
```

### Live Preview Toggle
```html
<div class="canvas-toolbar">
  <button id="preview-toggle" class="btn btn-secondary">
    <i class="fas fa-eye"></i> Live Preview
  </button>
  <select id="device-preview">
    <option value="desktop">Desktop</option>
    <option value="tablet">Tablet</option>
    <option value="mobile">Mobile</option>
  </select>
</div>
```

---

## 🐛 Dropdown Fixes

### Current Issues
1. **Data Browser** - Not rendering
2. **CRUD Interface** - Modal not opening
3. **Wizard** - Steps not displaying
4. **Dashboard** - Widget configuration broken

### Root Causes
- Component type not registered in toolbox
- Properties panel missing configurations
- Event handlers not bound
- Template rendering errors

### Fixes Required
```javascript
// Register all component types
const COMPONENT_TYPES = {
  'data-browser': {
    icon: 'fa-th-list',
    category: 'data',
    template: renderDataBrowser,
    properties: ['entityId', 'columns', 'filters']
  },
  'crud-interface': {
    icon: 'fa-edit',
    category: 'data',
    template: renderCRUDInterface,
    properties: ['entityId', 'operations', 'layout']
  },
  'wizard': {
    icon: 'fa-shoe-prints',
    category: 'layout',
    template: renderWizard,
    properties: ['steps', 'validation', 'navigation']
  },
  'dashboard': {
    icon: 'fa-th',
    category: 'layout',
    template: renderDashboard,
    properties: ['widgets', 'layout', 'refreshInterval']
  }
};
```

---

## 📋 Implementation Checklist

### Phase 1: Layout Redesign
- [ ] Create 3-column layout (280px | flex | 380px)
- [ ] Implement top tab navigation
- [ ] Add tab content containers
- [ ] Style with Exprsn theme variables
- [ ] Add responsive breakpoints

### Phase 2: Tab Implementation
- [ ] **Functions Tab**
  - [ ] Function table component
  - [ ] Monaco editor integration
  - [ ] Add/Edit/Delete operations
  - [ ] Syntax validation
  - [ ] Test runner

- [ ] **Event Handlers Tab**
  - [ ] Object lookup dropdown
  - [ ] Event trigger selector
  - [ ] Action configuration UI
  - [ ] Conditional execution builder
  - [ ] Event list display

- [ ] **Variables Tab**
  - [ ] Key/value table
  - [ ] Add variable modal
  - [ ] Type selector
  - [ ] Scope configuration
  - [ ] Value editor

- [ ] **Permissions Tab**
  - [ ] User/Role/Domain selectors
  - [ ] Permission matrix
  - [ ] CA Token configuration
  - [ ] exprsn-auth integration
  - [ ] Component-level permissions

- [ ] **Workflows Tab**
  - [ ] Integrate Exprsn-Kicks library
  - [ ] Workflow canvas
  - [ ] Trigger configuration
  - [ ] Field mapping UI
  - [ ] Execution monitoring

- [ ] **Forge CRM Tab**
  - [ ] Schema import from Forge
  - [ ] Entity selector
  - [ ] Field mapping table
  - [ ] Lookup configuration
  - [ ] CRUD operation selector

- [ ] **Form JSON Tab**
  - [ ] Monaco JSON editor
  - [ ] Import/Export buttons
  - [ ] Validation
  - [ ] Format/Minify

### Phase 3: Live Preview
- [ ] Preview mode toggle
- [ ] Device selector (Desktop/Tablet/Mobile)
- [ ] Live form rendering
- [ ] Interactive preview
- [ ] Test data population

### Phase 4: Dropdown Fixes
- [ ] Register Data Browser component
- [ ] Implement CRUD Interface
- [ ] Build Wizard step flow
- [ ] Create Dashboard widget manager
- [ ] Test all dropdown interactions

### Phase 5: Integration
- [ ] Socket.IO collaboration
- [ ] Auto-save functionality
- [ ] Undo/Redo system
- [ ] Keyboard shortcuts
- [ ] Export/Import

---

## 🚀 Next Steps

1. **Create form-designer-pro.ejs** with new layout
2. **Implement tab managers** as separate JS modules
3. **Integrate Exprsn-Kicks** for workflows
4. **Fix component dropdowns**
5. **Add live preview**
6. **Test and refine**

---

**Estimated Development Time:** 20-30 hours
**Lines of Code:** ~2000-2500
**Priority:** High - Critical UX improvement
