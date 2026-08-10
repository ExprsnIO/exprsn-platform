/**
 * Seed HTML App Builder Libraries and Components Using Models
 * This avoids bulk insert issues with JSONB fields
 */

const { v4: uuidv4 } = require('uuid');
const models = require('../lowcode/models');

// System user ID for default components
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

async function seedLibraries() {
  console.log('\n🌐 Seeding HTML libraries...');

  const libraries = [
    // JavaScript Libraries
    {
      id: uuidv4(),
      name: 'jQuery',
      version: '3.7.1',
      description: 'Fast, small, and feature-rich JavaScript library for DOM manipulation',
      type: 'javascript',
      cdnJsUrl: 'https://code.jquery.com/jquery-3.7.1.min.js',
      integrityJs: 'sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=',
      dependencies: [],
      isActive: true,
      isPopular: true,
      metadata: { homepage: 'https://jquery.com/', category: 'dom' }
    },
    {
      id: uuidv4(),
      name: 'jQuery UI',
      version: '1.13.2',
      description: 'Curated set of user interface interactions, effects, widgets, and themes',
      type: 'both',
      cdnCssUrl: 'https://code.jquery.com/ui/1.13.2/themes/base/jquery-ui.min.css',
      cdnJsUrl: 'https://code.jquery.com/ui/1.13.2/jquery-ui.min.js',
      dependencies: ['jQuery'],
      isActive: true,
      isPopular: true,
      metadata: { homepage: 'https://jqueryui.com/', category: 'ui' }
    },
    {
      id: uuidv4(),
      name: 'Bootstrap',
      version: '5.3.2',
      description: 'The most popular HTML, CSS, and JS framework for responsive web development',
      type: 'both',
      cdnCssUrl: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
      cdnJsUrl: 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
      integrityCss: 'sha384-T3c6CoIi6uLrA9TneNEoa7RxnatzjcDSCmG1MXxSR1GAsXEV/Dwwykc2MPK8M2HN',
      integrityJs: 'sha384-C6RzsynM9kWDrMNeT87bh95OGNyZPhcTNXj1NW7RuBCsyN/o0jlpcV8Qyq46cDfL',
      dependencies: [],
      isActive: true,
      isPopular: true,
      metadata: { homepage: 'https://getbootstrap.com/', category: 'framework' }
    },
    {
      id: uuidv4(),
      name: 'Lodash',
      version: '4.17.21',
      description: 'Modern JavaScript utility library delivering modularity, performance & extras',
      type: 'javascript',
      cdnJsUrl: 'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
      integrityJs: 'sha384-Hq4M0KvVwvEqEBLV5KPGwkFpS0WwQNp3pNdLrJBDWOWkADYQGwsY0vU5G2VVsVYp',
      dependencies: [],
      isActive: true,
      isPopular: true,
      metadata: { homepage: 'https://lodash.com/', category: 'utility' }
    },
    {
      id: uuidv4(),
      name: 'Chart.js',
      version: '4.4.0',
      description: 'Simple yet flexible JavaScript charting for designers & developers',
      type: 'javascript',
      cdnJsUrl: 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
      dependencies: [],
      isActive: true,
      isPopular: true,
      metadata: { homepage: 'https://www.chartjs.org/', category: 'charts' }
    },
    {
      id: uuidv4(),
      name: 'DataTables',
      version: '1.13.7',
      description: 'Add advanced interaction controls to HTML tables',
      type: 'both',
      cdnCssUrl: 'https://cdn.datatables.net/1.13.7/css/jquery.dataTables.min.css',
      cdnJsUrl: 'https://cdn.datatables.net/1.13.7/js/jquery.dataTables.min.js',
      dependencies: ['jQuery'],
      isActive: true,
      isPopular: true,
      metadata: { homepage: 'https://datatables.net/', category: 'tables' }
    },
    {
      id: uuidv4(),
      name: 'Font Awesome',
      version: '6.5.1',
      description: 'The internet\'s icon library and toolkit',
      type: 'css',
      cdnCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css',
      integrityCss: 'sha512-DTOQO9RWCH3ppGqcWaEA1BIZOC6xxalwEsw9c2QQeAIftl+Vegovlnee1c9QX4TctnWMn13TZye+giMm8e2LwA==',
      dependencies: [],
      isActive: true,
      isPopular: true,
      metadata: { homepage: 'https://fontawesome.com/', category: 'icons' }
    }
  ];

  let count = 0;
  for (const lib of libraries) {
    await models.HtmlLibrary.create(lib);
    count++;
  }

  console.log(`✅ ${count} libraries seeded successfully!`);
  return count;
}

async function seedComponents() {
  console.log('\n🧩 Seeding HTML components...');

  const components = [
    {
      id: uuidv4(),
      name: 'Container',
      slug: 'container',
      category: 'layout',
      description: 'Responsive container with Bootstrap grid system',
      htmlTemplate: '<div class="container {{fluid}}">\n  {{content}}\n</div>',
      css: '.container { max-width: 1200px; margin: 0 auto; padding: 0 15px; }',
      javascript: '',
      properties: [
        { name: 'fluid', type: 'boolean', default: false, label: 'Fluid width' },
        { name: 'content', type: 'html', default: '', label: 'Content' }
      ],
      dependencies: [],
      icon: 'fa fa-box',
      isPublic: true,
      isSystem: true,
      authorId: SYSTEM_USER_ID,
      version: '1.0.0'
    },
    {
      id: uuidv4(),
      name: 'Card',
      slug: 'card',
      category: 'layout',
      description: 'Bootstrap card component with header, body, and footer',
      htmlTemplate: `<div class="card {{class}}" style="{{style}}">
  {{#if header}}<div class="card-header">{{header}}</div>{{/if}}
  <div class="card-body">
    {{#if title}}<h5 class="card-title">{{title}}</h5>{{/if}}
    {{body}}
  </div>
  {{#if footer}}<div class="card-footer">{{footer}}</div>{{/if}}
</div>`,
      css: '.card { box-shadow: 0 2px 4px rgba(0,0,0,0.1); border-radius: 8px; }',
      javascript: '',
      properties: [
        { name: 'header', type: 'string', default: '', label: 'Header text' },
        { name: 'title', type: 'string', default: '', label: 'Title' },
        { name: 'body', type: 'html', default: '', label: 'Body content' },
        { name: 'footer', type: 'string', default: '', label: 'Footer text' },
        { name: 'class', type: 'string', default: '', label: 'CSS classes' },
        { name: 'style', type: 'string', default: '', label: 'Inline styles' }
      ],
      dependencies: ['Bootstrap'],
      icon: 'fa fa-id-card',
      isPublic: true,
      isSystem: true,
      authorId: SYSTEM_USER_ID,
      version: '1.0.0'
    },
    {
      id: uuidv4(),
      name: 'Button',
      slug: 'button',
      category: 'forms',
      description: 'Bootstrap styled button',
      htmlTemplate: '<button type="{{type}}" class="btn btn-{{variant}} {{size}}" onclick="{{onclick}}">{{text}}</button>',
      css: '',
      javascript: '',
      properties: [
        { name: 'text', type: 'string', default: 'Click me', label: 'Button text' },
        { name: 'type', type: 'select', options: ['button', 'submit', 'reset'], default: 'button', label: 'Type' },
        { name: 'variant', type: 'select', options: ['primary', 'secondary', 'success', 'danger', 'warning', 'info'], default: 'primary', label: 'Style' },
        { name: 'size', type: 'select', options: ['', 'btn-sm', 'btn-lg'], default: '', label: 'Size' },
        { name: 'onclick', type: 'string', default: '', label: 'onClick handler' }
      ],
      dependencies: ['Bootstrap'],
      icon: 'fa fa-hand-pointer',
      isPublic: true,
      isSystem: true,
      authorId: SYSTEM_USER_ID,
      version: '1.0.0'
    }
  ];

  let count = 0;
  for (const comp of components) {
    await models.HtmlComponent.create(comp);
    count++;
  }

  console.log(`✅ ${count} components seeded successfully!`);
  return count;
}

async function seedData() {
  try {
    console.log('🔍 Testing database connection...');
    await models.sequelize.authenticate();
    console.log('✅ Database connection successful');

    const libCount = await seedLibraries();
    const compCount = await seedComponents();

    console.log('\n✅ All seed data loaded successfully!');
    console.log(`   - ${libCount} libraries`);
    console.log(`   - ${compCount} components`);

    console.log('\n🚀 HTML App Builder is ready to use!');
    console.log('\n📍 Access the application:');
    console.log('   - Projects: http://localhost:5001/lowcode/html-projects');
    console.log('   - Designer: http://localhost:5001/lowcode/html-designer?projectId=<id>');
    console.log('   - Marketplace: http://localhost:5001/lowcode/html-components');

    process.exit(0);

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await models.sequelize.close();
  }
}

seedData();
