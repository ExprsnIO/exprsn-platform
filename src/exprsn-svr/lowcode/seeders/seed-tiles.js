/**
 * Seed Tiles
 *
 * Seeds all Business Hub tiles with their configurations.
 * These tiles represent the various designers and tools available in the low-code platform.
 *
 * Usage:
 *   node lowcode/seeders/seed-tiles.js
 */

const { sequelize, Tile } = require('../models');

const tiles = [
  {
    key: 'entities',
    name: 'Data Entities',
    description: 'Visual database designer with 25+ field types, migration generator, CRUD API generation, schema diff, rollback tools, and real-time collaboration.',
    icon: 'fas fa-database',
    iconGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    route: '/lowcode/entity-designer-pro?appId={appId}',
    category: 'data',
    sortOrder: 1,
    isActive: true,
    isEnhanced: true,
    badgeText: '13 Features',
    badgeColor: 'success',
    requiredPermissions: ['entities.view', 'entities.create'],
    metadata: {
      features: [
        '25+ field types',
        'Migration generator',
        'CRUD API generation',
        'Schema diff',
        'Rollback tools',
        'Real-time collaboration',
      ],
    },
  },
  {
    key: 'forms',
    name: 'Forms',
    description: 'Create interactive forms with drag-and-drop interface builder.',
    icon: 'fas fa-wpforms',
    iconGradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    route: '/lowcode/forms?appId={appId}',
    category: 'design',
    sortOrder: 2,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['forms.view'],
    metadata: {
      componentCount: 27,
    },
  },
  {
    key: 'grids',
    name: 'Data Grids',
    description: 'Build data tables with sorting, filtering, and pagination.',
    icon: 'fas fa-table',
    iconGradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    route: '/lowcode/grids?appId={appId}',
    category: 'design',
    sortOrder: 3,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['grids.view'],
    metadata: {},
  },
  {
    key: 'queries',
    name: 'Visual Queries',
    description: 'Build complex data queries with visual interface supporting 10 datasource types, filters, aggregations, and transformations.',
    icon: 'fas fa-filter',
    iconGradient: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    route: '/lowcode/queries?appId={appId}',
    category: 'data',
    sortOrder: 4,
    isActive: true,
    isNew: true,
    badgeText: '10 Datasources',
    badgeColor: 'success',
    requiredPermissions: ['queries.view', 'queries.create'],
    metadata: {
      supportedDatasources: 10,
    },
  },
  {
    key: 'processes',
    name: 'BPMN Processes',
    description: 'Design business process workflows with BPMN 2.0 standard notation.',
    icon: 'fas fa-sitemap',
    iconGradient: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    route: '/lowcode/process-designer?appId={appId}',
    category: 'automation',
    sortOrder: 5,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['processes.view'],
    metadata: {},
  },
  {
    key: 'workflows',
    name: 'Visual Workflows',
    description: 'Build data flow automations with visual node-based programming (Exprsn-Kicks).',
    icon: 'fas fa-project-diagram',
    iconGradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    route: '/lowcode/workflow-designer?appId={appId}',
    category: 'automation',
    sortOrder: 6,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['workflows.view'],
    metadata: {},
  },
  {
    key: 'charts',
    name: 'Charts & Analytics',
    description: 'Create data visualizations with 6 chart types (bar, line, pie, area, scatter, doughnut).',
    icon: 'fas fa-chart-bar',
    iconGradient: 'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    route: '/lowcode/chart-designer?appId={appId}',
    category: 'analytics',
    sortOrder: 7,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['charts.view'],
    metadata: {
      chartTypes: ['bar', 'line', 'pie', 'area', 'scatter', 'doughnut'],
    },
  },
  {
    key: 'reports',
    name: 'Reports',
    description: 'Build SQL reports with visual query builder, parameters, and Chart.js visualizations.',
    icon: 'fas fa-file-alt',
    iconGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    route: '/lowcode/reports?applicationId={appId}',
    category: 'analytics',
    sortOrder: 8,
    isActive: true,
    isNew: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['reports.view'],
    metadata: {},
  },
  {
    key: 'dashboards',
    name: 'Dashboards',
    description: 'Combine charts, grids, and widgets into interactive dashboards.',
    icon: 'fas fa-th-large',
    iconGradient: 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
    route: '/lowcode/dashboards?appId={appId}',
    category: 'analytics',
    sortOrder: 9,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['dashboards.view'],
    metadata: {},
  },
  {
    key: 'flows',
    name: 'Application Flows',
    description: 'Design user journeys and screen navigation flows with visual flowchart designer.',
    icon: 'fas fa-diagram-project',
    iconGradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    route: '/lowcode/app-flow-designer?appId={appId}',
    category: 'design',
    sortOrder: 10,
    isActive: true,
    isNew: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['flows.view'],
    metadata: {},
  },
  {
    key: 'settings',
    name: 'Settings & Variables',
    description: 'Configure application settings, define variables, and manage environment-specific values.',
    icon: 'fas fa-cog',
    iconGradient: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
    route: '/lowcode/settings?appId={appId}',
    category: 'system',
    sortOrder: 11,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['settings.view'],
    metadata: {},
  },
  {
    key: 'preview',
    name: 'Preview & Run',
    description: 'Test and interact with your application in runtime mode.',
    icon: 'fas fa-eye',
    iconGradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
    route: '/lowcode/preview?appId={appId}',
    category: 'system',
    sortOrder: 12,
    isActive: true,
    badgeText: null,
    badgeColor: 'success',
    requiredPermissions: ['preview.view'],
    metadata: {},
  },
  {
    key: 'decisions',
    name: 'Decision Tables',
    description: 'Define business rules using DMN decision tables with 16 operators and 5 hit policies.',
    icon: 'fas fa-gavel',
    iconGradient: 'linear-gradient(135deg, #f857a6 0%, #ff5858 100%)',
    route: '/lowcode/decision-designer?appId={appId}',
    category: 'automation',
    sortOrder: 13,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['decisions.view'],
    metadata: {
      operators: 16,
      hitPolicies: 5,
    },
  },
  {
    key: 'plugins',
    name: 'Plugins & Extensions',
    description: 'Extend functionality with custom plugins, hooks, and third-party integrations.',
    icon: 'fas fa-plug',
    iconGradient: 'linear-gradient(135deg, #9795f0 0%, #fbc8d4 100%)',
    route: '/lowcode/plugins?appId={appId}',
    category: 'integration',
    sortOrder: 14,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['plugins.view'],
    metadata: {},
  },
  {
    key: 'cards',
    name: 'Reusable Cards',
    description: 'Create reusable UI components and share them across your applications.',
    icon: 'fas fa-clone',
    iconGradient: 'linear-gradient(135deg, #fa8bff 0%, #2bd2ff 90%)',
    route: '/lowcode/cards?appId={appId}',
    category: 'design',
    sortOrder: 15,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['cards.view'],
    metadata: {},
  },
  {
    key: 'polls',
    name: 'Polls & Surveys',
    description: 'Create interactive polls and surveys with real-time voting and analytics.',
    icon: 'fas fa-poll',
    iconGradient: 'linear-gradient(135deg, #81fbb8 0%, #28c76f 100%)',
    route: '/lowcode/polls?appId={appId}',
    category: 'design',
    sortOrder: 16,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['polls.view'],
    metadata: {},
  },
  {
    key: 'datasources',
    name: 'Data Sources',
    description: 'Connect to external databases, APIs, Forge CRM, and other data sources.',
    icon: 'fas fa-database',
    iconGradient: 'linear-gradient(135deg, #ee9ae5 0%, #5961f9 100%)',
    route: '/lowcode/datasources?appId={appId}',
    category: 'integration',
    sortOrder: 17,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['datasources.view'],
    metadata: {},
  },
  {
    key: 'apis',
    name: 'APIs & Integrations',
    description: 'Build RESTful APIs, webhooks, and integrate with external services.',
    icon: 'fas fa-code',
    iconGradient: 'linear-gradient(135deg, #13547a 0%, #80d0c7 100%)',
    route: '/lowcode/api-designer?appId={appId}',
    category: 'integration',
    sortOrder: 18,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['apis.view'],
    metadata: {},
  },
  {
    key: 'security',
    name: 'Security & Permissions',
    description: 'Manage users, roles, groups, and fine-grained access controls (RBAC).',
    icon: 'fas fa-shield-alt',
    iconGradient: 'linear-gradient(135deg, #e96443 0%, #904e95 100%)',
    route: '/lowcode/security?appId={appId}',
    category: 'security',
    sortOrder: 19,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['security.view', 'security.manage'],
    metadata: {},
  },
  {
    key: 'automation',
    name: 'Automation Rules',
    description: 'Create event-driven automation rules with triggers, conditions, and actions.',
    icon: 'fas fa-magic',
    iconGradient: 'linear-gradient(135deg, #f77062 0%, #fe5196 100%)',
    route: '/lowcode/automation?appId={appId}',
    category: 'automation',
    sortOrder: 20,
    isActive: true,
    badgeText: 'Active',
    badgeColor: 'success',
    requiredPermissions: ['automation.view'],
    metadata: {},
  },
];

async function seedTiles() {
  try {
    console.log('🌱 Starting tiles seeder...');

    // Authenticate database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Count existing tiles
    const existingCount = await Tile.count();
    console.log(`📊 Found ${existingCount} existing tiles`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Seed each tile
    for (const tileData of tiles) {
      const [tile, wasCreated] = await Tile.findOrCreate({
        where: { key: tileData.key },
        defaults: tileData,
      });

      if (wasCreated) {
        console.log(`✨ Created tile: ${tileData.key} (${tileData.name})`);
        created++;
      } else {
        // Update existing tile with new data
        const changed = await tile.update(tileData);
        if (changed) {
          console.log(`🔄 Updated tile: ${tileData.key} (${tileData.name})`);
          updated++;
        } else {
          console.log(`⏭️  Skipped tile: ${tileData.key} (no changes)`);
          skipped++;
        }
      }
    }

    console.log('\n📈 Seeding Summary:');
    console.log(`   ✨ Created: ${created} tiles`);
    console.log(`   🔄 Updated: ${updated} tiles`);
    console.log(`   ⏭️  Skipped: ${skipped} tiles`);
    console.log(`   📊 Total: ${tiles.length} tiles`);

    // Display tiles by category
    console.log('\n📂 Tiles by Category:');
    const categories = [...new Set(tiles.map(t => t.category))].sort();
    for (const category of categories) {
      const categoryTiles = tiles.filter(t => t.category === category);
      console.log(`   ${category}: ${categoryTiles.length} tiles`);
      categoryTiles.forEach(t => {
        const badges = [];
        if (t.isNew) badges.push('NEW');
        if (t.isEnhanced) badges.push('ENHANCED');
        const badgeStr = badges.length > 0 ? ` [${badges.join(', ')}]` : '';
        console.log(`      - ${t.name}${badgeStr}`);
      });
    }

    console.log('\n✅ Tiles seeder completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding tiles:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  seedTiles();
}

module.exports = { seedTiles, tiles };
