/**
 * ═══════════════════════════════════════════════════════════
 * Forge Integration - Complete Integration Seed
 * Demonstrates Low-Code Platform + Forge CRM/ERP Integration
 * ═══════════════════════════════════════════════════════════
 */

const { sequelize } = require('../config/database');
const models = require('../lowcode/models');

/**
 * Main seeding function
 */
async function seedForgeIntegration() {
  try {
    console.log('Starting Forge Integration seed...\n');

    // Get existing Business Operations Hub application
    const app = await models.Application.findOne({
      where: { name: 'business_operations_hub' }
    });

    if (!app) {
      console.error('Error: Business Operations Hub application not found!');
      console.error('Please run seed-business-hub.js first.');
      process.exit(1);
    }

    console.log(`Found application: ${app.displayName} (${app.id})\n`);

    // ========================================================================
    // STEP 1: Create Sample Forge Data
    // ========================================================================
    console.log('Creating sample Forge data...');

    // Create default addressbook first (required for contacts)
    const [addressbook] = await sequelize.query(`
      INSERT INTO contact_addressbooks (id, owner_id, name, description, color, created_at, updated_at)
      VALUES (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        '00000000-0000-0000-0000-000000000001',
        'Default Addressbook',
        'System default addressbook',
        '#0078D4',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING id;
    `);

    // Sample Contacts (Forge CardDAV contacts)
    const contactIds = [];
    const contacts = [
      {
        id: 'c1111111-1111-1111-1111-111111111111',
        first_name: 'Sarah',
        last_name: 'Chen',
        full_name: 'Sarah Chen',
        organization: 'TechCorp Solutions',
        job_title: 'CTO',
        emails: JSON.stringify([{ type: 'work', value: 'sarah.chen@techcorp.com', primary: true }]),
        phones: JSON.stringify([{ type: 'work', value: '+1-555-0101' }])
      },
      {
        id: 'c2222222-2222-2222-2222-222222222222',
        first_name: 'Michael',
        last_name: 'Rodriguez',
        full_name: 'Michael Rodriguez',
        organization: 'InnovateLabs Inc',
        job_title: 'Product Manager',
        emails: JSON.stringify([{ type: 'work', value: 'michael.r@innovatelabs.com', primary: true }]),
        phones: JSON.stringify([{ type: 'work', value: '+1-555-0102' }])
      },
      {
        id: 'c3333333-3333-3333-3333-333333333333',
        first_name: 'Emma',
        last_name: 'Thompson',
        full_name: 'Emma Thompson',
        organization: 'Global Enterprises',
        job_title: 'Senior Developer',
        emails: JSON.stringify([{ type: 'work', value: 'e.thompson@globalent.com', primary: true }]),
        phones: JSON.stringify([{ type: 'work', value: '+1-555-0103' }])
      },
      {
        id: 'c4444444-4444-4444-4444-444444444444',
        first_name: 'James',
        last_name: 'Wilson',
        full_name: 'James Wilson',
        organization: 'StartupXYZ',
        job_title: 'Lead Designer',
        emails: JSON.stringify([{ type: 'work', value: 'james@startupxyz.com', primary: true }]),
        phones: JSON.stringify([{ type: 'mobile', value: '+1-555-0104' }])
      },
      {
        id: 'c5555555-5555-5555-5555-555555555555',
        first_name: 'Olivia',
        last_name: 'Martinez',
        full_name: 'Olivia Martinez',
        organization: 'DataFlow Systems',
        job_title: 'Data Architect',
        emails: JSON.stringify([{ type: 'work', value: 'olivia.m@dataflow.io', primary: true }]),
        phones: JSON.stringify([{ type: 'work', value: '+1-555-0105' }])
      }
    ];

    for (const contact of contacts) {
      await sequelize.query(`
        INSERT INTO contacts (
          id, addressbook_id, first_name, last_name, full_name,
          organization, job_title, emails, phones, created_at, updated_at
        ) VALUES (
          '${contact.id}',
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          '${contact.first_name}',
          '${contact.last_name}',
          '${contact.full_name}',
          '${contact.organization}',
          '${contact.job_title}',
          '${contact.emails}'::jsonb,
          '${contact.phones}'::jsonb,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
          first_name = EXCLUDED.first_name,
          organization = EXCLUDED.organization,
          updated_at = CURRENT_TIMESTAMP;
      `);
      contactIds.push(contact.id);
    }
    console.log(`✓ Created ${contacts.length} contacts\n`);

    // Sample Customers (Forge ERP customers)
    const customerIds = [];
    const customers = [
      {
        id: 'cu111111-1111-1111-1111-111111111111',
        customer_number: 'CUST-001',
        name: 'TechCorp Solutions',
        email: 'billing@techcorp.com',
        phone: '+1-555-0101',
        contact_id: 'c1111111-1111-1111-1111-111111111111',
        payment_terms: 'Net 30',
        credit_limit: 50000.00,
        status: 'active'
      },
      {
        id: 'cu222222-2222-2222-2222-222222222222',
        customer_number: 'CUST-002',
        name: 'InnovateLabs Inc',
        email: 'accounts@innovatelabs.com',
        phone: '+1-555-0102',
        contact_id: 'c2222222-2222-2222-2222-222222222222',
        payment_terms: 'Net 15',
        credit_limit: 75000.00,
        status: 'active'
      },
      {
        id: 'cu333333-3333-3333-3333-333333333333',
        customer_number: 'CUST-003',
        name: 'Global Enterprises',
        email: 'finance@globalent.com',
        phone: '+1-555-0103',
        contact_id: 'c3333333-3333-3333-3333-333333333333',
        payment_terms: 'Net 30',
        credit_limit: 100000.00,
        status: 'active'
      }
    ];

    for (const customer of customers) {
      await sequelize.query(`
        INSERT INTO customers (
          id, customer_number, name, email, phone, contact_id,
          payment_terms, credit_limit, status, created_at, updated_at
        ) VALUES (
          '${customer.id}',
          '${customer.customer_number}',
          '${customer.name}',
          '${customer.email}',
          '${customer.phone}',
          '${customer.contact_id}',
          '${customer.payment_terms}',
          ${customer.credit_limit},
          '${customer.status}',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          updated_at = CURRENT_TIMESTAMP;
      `);
      customerIds.push(customer.id);
    }
    console.log(`✓ Created ${customers.length} customers\n`);

    // Sample Products
    const productIds = [];
    const products = [
      {
        id: 'pr111111-1111-1111-1111-111111111111',
        sku: 'SVC-WEB-001',
        name: 'Website Design & Development',
        description: 'Complete website design and development package',
        category: 'Services',
        unit_price: 5000.00,
        cost_price: 2500.00
      },
      {
        id: 'pr222222-2222-2222-2222-222222222222',
        sku: 'SVC-APP-001',
        name: 'Mobile App Development',
        description: 'Native mobile application development for iOS and Android',
        category: 'Services',
        unit_price: 15000.00,
        cost_price: 8000.00
      },
      {
        id: 'pr333333-3333-3333-3333-333333333333',
        sku: 'SVC-CONS-001',
        name: 'Technical Consulting (Hourly)',
        description: 'Expert technical consulting services',
        category: 'Services',
        unit_price: 150.00,
        cost_price: 75.00
      },
      {
        id: 'pr444444-4444-4444-4444-444444444444',
        sku: 'LIC-ENT-001',
        name: 'Enterprise Software License (Annual)',
        description: 'Annual enterprise software license',
        category: 'Licenses',
        unit_price: 12000.00,
        cost_price: 1000.00
      }
    ];

    for (const product of products) {
      await sequelize.query(`
        INSERT INTO products (
          id, sku, name, description, category, unit_price, cost_price,
          is_active, track_inventory, created_at, updated_at
        ) VALUES (
          '${product.id}',
          '${product.sku}',
          '${product.name}',
          '${product.description}',
          '${product.category}',
          ${product.unit_price},
          ${product.cost_price},
          true,
          false,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          unit_price = EXCLUDED.unit_price,
          updated_at = CURRENT_TIMESTAMP;
      `);
      productIds.push(product.id);
    }
    console.log(`✓ Created ${products.length} products\n`);

    // Sample Invoices
    const invoices = [
      {
        id: 'in111111-1111-1111-1111-111111111111',
        invoice_number: 'INV-2024-001',
        customer_id: 'cu111111-1111-1111-1111-111111111111',
        issue_date: '2024-01-15',
        due_date: '2024-02-14',
        subtotal: 15000.00,
        tax_total: 1200.00,
        total: 16200.00,
        status: 'paid'
      },
      {
        id: 'in222222-2222-2222-2222-222222222222',
        invoice_number: 'INV-2024-002',
        customer_id: 'cu222222-2222-2222-2222-222222222222',
        issue_date: '2024-02-01',
        due_date: '2024-02-16',
        subtotal: 5000.00,
        tax_total: 400.00,
        total: 5400.00,
        status: 'paid'
      },
      {
        id: 'in333333-3333-3333-3333-333333333333',
        invoice_number: 'INV-2024-003',
        customer_id: 'cu333333-3333-3333-3333-333333333333',
        issue_date: '2024-12-01',
        due_date: '2024-12-31',
        subtotal: 12000.00,
        tax_total: 960.00,
        total: 12960.00,
        status: 'sent'
      }
    ];

    for (const invoice of invoices) {
      await sequelize.query(`
        INSERT INTO invoices (
          id, invoice_number, customer_id, issue_date, due_date,
          subtotal, tax_total, total, status, currency,
          created_at, updated_at
        ) VALUES (
          '${invoice.id}',
          '${invoice.invoice_number}',
          '${invoice.customer_id}',
          '${invoice.issue_date}',
          '${invoice.due_date}',
          ${invoice.subtotal},
          ${invoice.tax_total},
          ${invoice.total},
          '${invoice.status}',
          'USD',
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (id) DO UPDATE SET
          total = EXCLUDED.total,
          status = EXCLUDED.status,
          updated_at = CURRENT_TIMESTAMP;
      `);
    }
    console.log(`✓ Created ${invoices.length} invoices\n`);

    // ========================================================================
    // STEP 2: Create Integration Entities (Virtual Forge Access)
    // ========================================================================
    console.log('Creating integration entities...');

    // Contact Entity (Virtual - direct access to Forge contacts table)
    const contactEntity = await models.Entity.create({
      applicationId: app.id,
      name: 'forge_contact',
      displayName: 'Contact',
      pluralName: 'Contacts',
      description: 'Direct integration with Forge CardDAV contacts',
      sourceType: 'forge',
      sourceConfig: {
        forgeModule: 'carddav',
        forgeTable: 'contacts',
        apiEndpoint: '/api/contacts',
        permissions: { read: true, write: true, delete: true }
      },
      enableAudit: false,
      softDelete: false,
      metadata: {
        displayField: 'full_name',
        icon: 'user',
        color: '#28A745',
        forgeIntegration: true
      }
    });

    // Invoice Entity (Virtual - direct access to Forge ERP invoices)
    const invoiceEntity = await models.Entity.create({
      applicationId: app.id,
      name: 'forge_invoice',
      displayName: 'Invoice',
      pluralName: 'Invoices',
      description: 'Direct integration with Forge ERP invoices',
      sourceType: 'forge',
      sourceConfig: {
        forgeModule: 'erp',
        forgeTable: 'invoices',
        apiEndpoint: '/api/invoices',
        permissions: { read: true, write: true, delete: false }
      },
      enableAudit: false,
      softDelete: false,
      metadata: {
        displayField: 'invoice_number',
        icon: 'file-invoice-dollar',
        color: '#FFC107',
        forgeIntegration: true
      }
    });

    // Product Entity (Virtual - direct access to Forge ERP products)
    const productEntity = await models.Entity.create({
      applicationId: app.id,
      name: 'forge_product',
      displayName: 'Product',
      pluralName: 'Products',
      description: 'Direct integration with Forge ERP products catalog',
      sourceType: 'forge',
      sourceConfig: {
        forgeModule: 'erp',
        forgeTable: 'products',
        apiEndpoint: '/api/products',
        permissions: { read: true, write: true, delete: true }
      },
      enableAudit: false,
      softDelete: false,
      metadata: {
        displayField: 'name',
        icon: 'box',
        color: '#17A2B8',
        forgeIntegration: true
      }
    });

    console.log(`✓ Created 3 integration entities\n`);

    // ========================================================================
    // STEP 3: Create Forms for Forge Data
    // ========================================================================
    console.log('Creating Forge data forms...');

    const contactForm = await models.AppForm.create({
      applicationId: app.id,
      name: 'contact_management_form',
      displayName: 'Contact Management',
      description: 'Create and edit contacts in Forge CardDAV',
      formType: 'standard',
      layout: 'two-column',
      controls: [
        { id: 'ctrl_fname', type: 'textInput', name: 'first_name', label: 'First Name', required: true, column: 1 },
        { id: 'ctrl_lname', type: 'textInput', name: 'last_name', label: 'Last Name', required: true, column: 1 },
        { id: 'ctrl_org', type: 'textInput', name: 'organization', label: 'Organization', column: 1 },
        { id: 'ctrl_title', type: 'textInput', name: 'job_title', label: 'Job Title', column: 2 },
        { id: 'ctrl_email', type: 'email', name: 'email', label: 'Email', column: 2 },
        { id: 'ctrl_phone', type: 'textInput', name: 'phone', label: 'Phone', column: 2 }
      ],
      dataSources: [
        { name: 'contactEntity', type: 'entity', entityId: contactEntity.id, mode: 'twoWay' }
      ],
      status: 'published',
      version: '1.0.0',
      metadata: { icon: 'user-plus', category: 'forge-crm' }
    });

    const invoiceForm = await models.AppForm.create({
      applicationId: app.id,
      name: 'invoice_management_form',
      displayName: 'Invoice Management',
      description: 'Create and edit invoices in Forge ERP',
      formType: 'standard',
      layout: 'two-column',
      controls: [
        { id: 'ctrl_inv_num', type: 'textInput', name: 'invoice_number', label: 'Invoice Number', required: true, column: 1 },
        { id: 'ctrl_customer', type: 'entityPicker', name: 'customer_id', label: 'Customer', entityType: 'customer', required: true, column: 1 },
        { id: 'ctrl_issue_date', type: 'date', name: 'issue_date', label: 'Issue Date', required: true, column: 1 },
        { id: 'ctrl_due_date', type: 'date', name: 'due_date', label: 'Due Date', required: true, column: 2 },
        { id: 'ctrl_subtotal', type: 'number', name: 'subtotal', label: 'Subtotal', column: 2 },
        { id: 'ctrl_total', type: 'number', name: 'total', label: 'Total Amount', column: 2 },
        { id: 'ctrl_status', type: 'dropdown', name: 'status', label: 'Status', options: ['draft', 'sent', 'paid', 'overdue', 'cancelled'], column: 2 }
      ],
      dataSources: [
        { name: 'invoiceEntity', type: 'entity', entityId: invoiceEntity.id, mode: 'twoWay' }
      ],
      status: 'published',
      version: '1.0.0',
      metadata: { icon: 'file-invoice', category: 'forge-erp' }
    });

    const productForm = await models.AppForm.create({
      applicationId: app.id,
      name: 'product_management_form',
      displayName: 'Product Management',
      description: 'Create and edit products in Forge ERP catalog',
      formType: 'standard',
      layout: 'single-column',
      controls: [
        { id: 'ctrl_sku', type: 'textInput', name: 'sku', label: 'SKU', required: true },
        { id: 'ctrl_prod_name', type: 'textInput', name: 'name', label: 'Product Name', required: true },
        { id: 'ctrl_desc', type: 'textArea', name: 'description', label: 'Description', rows: 3 },
        { id: 'ctrl_category', type: 'textInput', name: 'category', label: 'Category' },
        { id: 'ctrl_unit_price', type: 'number', name: 'unit_price', label: 'Unit Price', required: true },
        { id: 'ctrl_cost', type: 'number', name: 'cost_price', label: 'Cost Price' }
      ],
      dataSources: [
        { name: 'productEntity', type: 'entity', entityId: productEntity.id, mode: 'twoWay' }
      ],
      status: 'published',
      version: '1.0.0',
      metadata: { icon: 'box-open', category: 'forge-erp' }
    });

    console.log(`✓ Created 3 Forge data forms\n`);

    // ========================================================================
    // STEP 4: Create Grids for Forge Data
    // ========================================================================
    console.log('Creating Forge data grids...');

    const contactsGrid = await models.Grid.create({
      applicationId: app.id,
      entityId: contactEntity.id,
      name: 'contacts_directory',
      displayName: 'Contacts Directory',
      description: 'All contacts from Forge CardDAV',
      gridType: 'editable',
      columns: [
        { name: 'Name', field: 'full_name', width: 200, sortable: true },
        { name: 'Organization', field: 'organization', width: 180, sortable: true },
        { name: 'Title', field: 'job_title', width: 150 },
        { name: 'Email', field: 'email', width: 200 },
        { name: 'Phone', field: 'phone', width: 130 }
      ],
      dataSource: { type: 'entity', entityId: contactEntity.id },
      actions: [
        { name: 'edit', label: 'Edit', icon: 'edit', action: 'openForm', formId: contactForm.id },
        { name: 'delete', label: 'Delete', icon: 'trash', action: 'delete' }
      ],
      pagination: { enabled: true, pageSize: 50 },
      metadata: { allowExport: true, exportFormats: ['csv', 'excel'] }
    });

    const invoicesGrid = await models.Grid.create({
      applicationId: app.id,
      entityId: invoiceEntity.id,
      name: 'invoices_list',
      displayName: 'Invoices List',
      description: 'All invoices from Forge ERP',
      gridType: 'editable',
      columns: [
        { name: 'Invoice #', field: 'invoice_number', width: 120, sortable: true },
        { name: 'Customer', field: 'customer_name', width: 200, sortable: true },
        { name: 'Issue Date', field: 'issue_date', width: 120, sortable: true, dataType: 'date' },
        { name: 'Due Date', field: 'due_date', width: 120, sortable: true, dataType: 'date' },
        { name: 'Total', field: 'total', width: 120, dataType: 'currency', align: 'right' },
        { name: 'Status', field: 'status', width: 100, template: '{{statusBadge}}' }
      ],
      dataSource: { type: 'entity', entityId: invoiceEntity.id, include: ['customer'] },
      actions: [
        { name: 'view', label: 'View', icon: 'eye', action: 'openForm', formId: invoiceForm.id, mode: 'readonly' },
        { name: 'edit', label: 'Edit', icon: 'edit', action: 'openForm', formId: invoiceForm.id }
      ],
      pagination: { enabled: true, pageSize: 25 },
      metadata: { allowExport: true, exportFormats: ['csv', 'excel', 'pdf'] }
    });

    const productsGrid = await models.Grid.create({
      applicationId: app.id,
      entityId: productEntity.id,
      name: 'products_catalog',
      displayName: 'Products Catalog',
      description: 'Product catalog from Forge ERP',
      gridType: 'editable',
      columns: [
        { name: 'SKU', field: 'sku', width: 130, sortable: true },
        { name: 'Product Name', field: 'name', width: 250, sortable: true },
        { name: 'Category', field: 'category', width: 130, sortable: true },
        { name: 'Unit Price', field: 'unit_price', width: 120, dataType: 'currency', align: 'right' },
        { name: 'Active', field: 'is_active', width: 80, dataType: 'boolean', template: '{{activeIcon}}' }
      ],
      dataSource: { type: 'entity', entityId: productEntity.id },
      actions: [
        { name: 'edit', label: 'Edit', icon: 'edit', action: 'openForm', formId: productForm.id },
        { name: 'delete', label: 'Delete', icon: 'trash', action: 'delete' }
      ],
      pagination: { enabled: true, pageSize: 50 },
      metadata: { allowExport: true, exportFormats: ['csv', 'excel'] }
    });

    console.log(`✓ Created 3 Forge data grids\n`);

    // ========================================================================
    // SUCCESS SUMMARY
    // ========================================================================
    console.log('================================================');
    console.log('Forge Integration - Installation Complete!');
    console.log('================================================');
    console.log(`Application: ${app.displayName}`);
    console.log(`Application ID: ${app.id}\n`);

    console.log('Forge Data Created:');
    console.log(`  - ${contacts.length} Contacts (CardDAV)`);
    console.log(`  - ${customers.length} Customers (ERP)`);
    console.log(`  - ${products.length} Products (ERP)`);
    console.log(`  - ${invoices.length} Invoices (ERP)\n`);

    console.log('Integration Entities Created:');
    console.log(`  - forge_contact (Virtual access to contacts table)`);
    console.log(`  - forge_invoice (Virtual access to invoices table)`);
    console.log(`  - forge_product (Virtual access to products table)\n`);

    console.log('Forms Created:');
    console.log(`  - Contact Management Form`);
    console.log(`  - Invoice Management Form`);
    console.log(`  - Product Management Form\n`);

    console.log('Grids Created:');
    console.log(`  - Contacts Directory`);
    console.log(`  - Invoices List`);
    console.log(`  - Products Catalog\n`);

    console.log('Integration Points:');
    console.log(`  ✓ Low-Code ↔ Forge CardDAV (Contacts)`);
    console.log(`  ✓ Low-Code ↔ Forge ERP (Customers, Invoices, Products)`);
    console.log(`  ✓ Projects ↔ Customers (customer_id FK)`);
    console.log(`  ✓ Tasks ↔ Contacts (assigned_to_contact_id FK)`);
    console.log(`  ✓ Team Members ↔ Contacts (contact_id FK)\n`);

    console.log('Access Points:');
    console.log(`  - Contacts: https://localhost:5002/lowcode/designer?appId=${app.id}`);
    console.log(`  - Invoices: https://localhost:5002/lowcode/designer?appId=${app.id}`);
    console.log(`  - Products: https://localhost:5002/lowcode/designer?appId=${app.id}\n`);

    console.log('================================================\n');

    return {
      app,
      entities: {
        contact: contactEntity,
        invoice: invoiceEntity,
        product: productEntity
      },
      forms: {
        contact: contactForm,
        invoice: invoiceForm,
        product: productForm
      },
      grids: {
        contacts: contactsGrid,
        invoices: invoicesGrid,
        products: productsGrid
      },
      sampleData: {
        contactIds,
        customerIds,
        productIds,
        invoices
      }
    };

  } catch (error) {
    console.error('Error seeding Forge integration:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedForgeIntegration()
    .then(() => {
      console.log('Forge integration seed completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Forge integration seed failed:', error);
      process.exit(1);
    });
}

module.exports = seedForgeIntegration;
