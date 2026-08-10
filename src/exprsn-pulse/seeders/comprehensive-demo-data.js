/**
 * Comprehensive Demo Data Seeder for Exprsn Pulse
 * Creates a complete sample environment with:
 * - Data Sources (PostgreSQL, REST API, CSV)
 * - Queries
 * - Datasets
 * - Visualizations
 * - Dashboards
 * - Reports
 * - Schedules
 */

const { sequelize, DataSource, Query, Dataset, Visualization, Dashboard, DashboardItem, Report, ReportParameter, Filter, Schedule } = require('../src/models');

// System user UUID for created_by fields
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

async function seed() {
  console.log('🌱 Starting comprehensive demo data seeding...\n');

  try {
    // ===========================================================================
    // 1. DATA SOURCES
    // ===========================================================================
    console.log('📊 Creating data sources...');

    const [pgDataSource, apiDataSource, customQueryDataSource] = await Promise.all([
      DataSource.create({
        name: 'Exprsn Analytics Database',
        type: 'postgresql',
        description: 'Main analytics database for Exprsn platform metrics',
        config: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          database: 'exprsn_pulse',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || '',
          ssl: false
        },
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        metadata: {
          tags: ['analytics', 'production'],
          environment: 'development'
        }
      }),

      DataSource.create({
        name: 'REST API - User Activity',
        type: 'rest-api',
        description: 'External REST API for user activity tracking',
        config: {
          baseUrl: 'https://jsonplaceholder.typicode.com',
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        },
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        metadata: {
          tags: ['external', 'users'],
          rateLimitPerHour: 1000
        }
      }),

      DataSource.create({
        name: 'Custom Query - Sales Data',
        type: 'custom-query',
        description: 'Custom SQL queries for sales data analysis',
        config: {
          queryTemplate: 'SELECT * FROM sales_data WHERE created_at >= {{start_date}}',
          allowedTables: ['sales_data', 'products', 'customers'],
          maxRows: 10000
        },
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        metadata: {
          tags: ['sales', 'custom'],
          queryType: 'sql'
        }
      })
    ]);

    console.log(`✅ Created ${3} data sources`);

    // ===========================================================================
    // 2. QUERIES
    // ===========================================================================
    console.log('\n📝 Creating queries...');

    const [userStatsQuery, dashboardStatsQuery, apiUsersQuery, salesQuery] = await Promise.all([
      Query.create({
        dataSourceId: pgDataSource.id,
        name: 'User Growth Statistics',
        description: 'Monthly user growth and engagement metrics',
        queryType: 'sql',
        queryDefinition: {
          sql: `SELECT
            DATE_TRUNC('month', created_at) as month,
            COUNT(*) as new_users,
            COUNT(DISTINCT CASE WHEN last_login_at > NOW() - INTERVAL '30 days' THEN id END) as active_users
          FROM users
          WHERE created_at >= NOW() - INTERVAL '12 months'
          GROUP BY DATE_TRUNC('month', created_at)
          ORDER BY month DESC`
        },
        parameters: [],
        createdBy: SYSTEM_USER_ID,
        metadata: {
          category: 'users',
          cacheDuration: 3600
        }
      }),

      Query.create({
        dataSourceId: pgDataSource.id,
        name: 'Dashboard Usage Analytics',
        description: 'Track most viewed and created dashboards',
        queryType: 'sql',
        queryDefinition: {
          sql: `SELECT
            id,
            name,
            description,
            is_realtime,
            created_at,
            updated_at
          FROM dashboards
          ORDER BY updated_at DESC
          LIMIT 10`
        },
        parameters: [],
        createdBy: SYSTEM_USER_ID,
        metadata: {
          category: 'analytics',
          refreshInterval: 60
        }
      }),

      Query.create({
        dataSourceId: apiDataSource.id,
        name: 'External Users List',
        description: 'Fetch users from external API',
        queryType: 'rest',
        queryDefinition: {
          method: 'GET',
          endpoint: '/users',
          headers: {},
          params: {}
        },
        parameters: [],
        createdBy: SYSTEM_USER_ID,
        metadata: {
          category: 'external',
          apiVersion: 'v1'
        }
      }),

      Query.create({
        dataSourceId: customQueryDataSource.id,
        name: 'Monthly Sales Summary',
        description: 'Aggregate sales data by month and region',
        queryType: 'sql',
        queryDefinition: {
          sql: 'SELECT * FROM sales_data WHERE created_at BETWEEN {{start_date}} AND {{end_date}}'
        },
        parameters: [
          {
            name: 'start_date',
            type: 'date',
            required: false,
            defaultValue: '2024-01-01'
          },
          {
            name: 'end_date',
            type: 'date',
            required: false,
            defaultValue: '2024-12-31'
          }
        ],
        createdBy: SYSTEM_USER_ID,
        metadata: {
          category: 'sales'
        }
      })
    ]);

    console.log(`✅ Created ${4} queries`);

    // ===========================================================================
    // 3. DATASETS
    // ===========================================================================
    console.log('\n📦 Creating datasets...');

    const [userGrowthDataset, dashboardAnalyticsDataset, salesDataset] = await Promise.all([
      Dataset.create({
        queryId: userStatsQuery.id,
        name: 'User Growth Dataset',
        data: [
          { month: '2024-01-01', new_users: 150, active_users: 420 },
          { month: '2024-02-01', new_users: 180, active_users: 510 },
          { month: '2024-03-01', new_users: 210, active_users: 650 },
          { month: '2024-04-01', new_users: 195, active_users: 720 },
          { month: '2024-05-01', new_users: 220, active_users: 840 },
          { month: '2024-06-01', new_users: 245, active_users: 950 }
        ],
        schema: {
          columns: [
            { name: 'month', type: 'date', label: 'Month' },
            { name: 'new_users', type: 'integer', label: 'New Users' },
            { name: 'active_users', type: 'integer', label: 'Active Users' }
          ]
        },
        rowCount: 6,
        columnCount: 3,
        createdBy: SYSTEM_USER_ID,
        metadata: {
          lastRefreshed: new Date().toISOString()
        }
      }),

      Dataset.create({
        queryId: dashboardStatsQuery.id,
        name: 'Dashboard Analytics Dataset',
        data: [
          { id: '1a', name: 'Sales Dashboard', description: 'Q4 Sales Metrics', is_realtime: true },
          { id: '2b', name: 'User Analytics', description: 'User engagement data', is_realtime: false },
          { id: '3c', name: 'Executive Overview', description: 'High-level KPIs', is_realtime: true }
        ],
        schema: {
          columns: [
            { name: 'id', type: 'string', label: 'ID' },
            { name: 'name', type: 'string', label: 'Dashboard Name' },
            { name: 'description', type: 'string', label: 'Description' },
            { name: 'is_realtime', type: 'boolean', label: 'Real-time' }
          ]
        },
        rowCount: 3,
        columnCount: 4,
        createdBy: SYSTEM_USER_ID
      }),

      Dataset.create({
        queryId: salesQuery.id,
        name: 'Sales Performance Dataset',
        data: [
          { month: '2024-01-01', region: 'North', revenue: 125000.50, units_sold: 450 },
          { month: '2024-01-01', region: 'South', revenue: 98500.25, units_sold: 380 },
          { month: '2024-01-01', region: 'East', revenue: 142000.75, units_sold: 520 },
          { month: '2024-01-01', region: 'West', revenue: 115000.00, units_sold: 410 },
          { month: '2024-02-01', region: 'North', revenue: 135000.50, units_sold: 480 },
          { month: '2024-02-01', region: 'South', revenue: 105500.25, units_sold: 395 }
        ],
        schema: {
          columns: [
            { name: 'month', type: 'date', label: 'Month' },
            { name: 'region', type: 'string', label: 'Region' },
            { name: 'revenue', type: 'decimal', label: 'Revenue' },
            { name: 'units_sold', type: 'integer', label: 'Units Sold' }
          ]
        },
        rowCount: 6,
        columnCount: 4,
        createdBy: SYSTEM_USER_ID
      })
    ]);

    console.log(`✅ Created ${3} datasets`);

    // ===========================================================================
    // 4. VISUALIZATIONS
    // ===========================================================================
    console.log('\n📈 Creating visualizations...');

    const [lineChartViz, barChartViz, pieChartViz, tableViz, numberCardViz] = await Promise.all([
      Visualization.create({
        datasetId: userGrowthDataset.id,
        name: 'User Growth Trend',
        type: 'line',
        description: 'Line chart showing user growth over time',
        dataMapping: {
          x: 'month',
          y: ['new_users', 'active_users']
        },
        config: {
          colors: ['#0066ff', '#10b981'],
          legend: { display: true, position: 'top' },
          grid: { display: true },
          smooth: true
        },
        createdBy: SYSTEM_USER_ID,
        metadata: {
          category: 'trends'
        }
      }),

      Visualization.create({
        datasetId: salesDataset.id,
        name: 'Sales by Region',
        type: 'bar',
        description: 'Bar chart comparing sales across regions',
        dataMapping: {
          x: 'region',
          y: 'revenue'
        },
        config: {
          orientation: 'vertical',
          colors: ['#3b82f6'],
          showValues: true
        },
        createdBy: SYSTEM_USER_ID,
        metadata: {
          category: 'sales'
        }
      }),

      Visualization.create({
        datasetId: salesDataset.id,
        name: 'Revenue Distribution',
        type: 'pie',
        description: 'Pie chart showing revenue distribution by region',
        dataMapping: {
          value: 'revenue',
          label: 'region'
        },
        config: {
          showPercentage: true,
          colors: ['#0066ff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
        },
        createdBy: SYSTEM_USER_ID
      }),

      Visualization.create({
        datasetId: dashboardAnalyticsDataset.id,
        name: 'Dashboard List',
        type: 'table',
        description: 'Tabular view of all dashboards',
        dataMapping: {
          columns: ['name', 'description', 'is_realtime']
        },
        config: {
          columnConfig: [
            { field: 'name', header: 'Name', width: 200, sortable: true },
            { field: 'description', header: 'Description', width: 300 },
            { field: 'is_realtime', header: 'Real-time', width: 100, type: 'boolean' }
          ],
          pageSize: 10,
          sortable: true,
          filterable: true
        },
        createdBy: SYSTEM_USER_ID
      }),

      Visualization.create({
        datasetId: userGrowthDataset.id,
        name: 'Total Active Users',
        type: 'metric',
        description: 'Single number card showing total active users',
        dataMapping: {
          value: 'active_users',
          aggregation: 'sum'
        },
        config: {
          prefix: '',
          suffix: ' users',
          decimals: 0,
          color: '#10b981',
          icon: 'bi-people-fill'
        },
        createdBy: SYSTEM_USER_ID
      })
    ]);

    console.log(`✅ Created ${5} visualizations`);

    // ===========================================================================
    // 5. DASHBOARDS
    // ===========================================================================
    console.log('\n🎛️  Creating dashboards...');

    const [executiveDashboard, analyticsDashboard] = await Promise.all([
      Dashboard.create({
        name: 'Executive Overview',
        description: 'High-level metrics for executive team',
        layout: 'grid',
        isPublic: false,
        isRealtime: false,
        refreshInterval: 300,
        createdBy: SYSTEM_USER_ID,
        tags: ['executive', 'overview'],
        metadata: {
          category: 'executive',
          priority: 'high'
        }
      }),

      Dashboard.create({
        name: 'Analytics Dashboard',
        description: 'Detailed analytics and trends',
        layout: 'grid',
        isPublic: true,
        isRealtime: true,
        refreshInterval: 60,
        createdBy: SYSTEM_USER_ID,
        tags: ['analytics', 'realtime'],
        metadata: {
          category: 'analytics'
        }
      })
    ]);

    // Add visualizations to dashboards
    await Promise.all([
      DashboardItem.create({
        dashboardId: executiveDashboard.id,
        visualizationId: numberCardViz.id,
        position: { x: 0, y: 0, w: 3, h: 2 },
        config: {}
      }),
      DashboardItem.create({
        dashboardId: executiveDashboard.id,
        visualizationId: lineChartViz.id,
        position: { x: 3, y: 0, w: 9, h: 4 },
        config: {}
      }),
      DashboardItem.create({
        dashboardId: executiveDashboard.id,
        visualizationId: pieChartViz.id,
        position: { x: 0, y: 4, w: 6, h: 4 },
        config: {}
      }),
      DashboardItem.create({
        dashboardId: executiveDashboard.id,
        visualizationId: barChartViz.id,
        position: { x: 6, y: 4, w: 6, h: 4 },
        config: {}
      }),

      DashboardItem.create({
        dashboardId: analyticsDashboard.id,
        visualizationId: tableViz.id,
        position: { x: 0, y: 0, w: 12, h: 6 },
        config: {}
      }),
      DashboardItem.create({
        dashboardId: analyticsDashboard.id,
        visualizationId: lineChartViz.id,
        position: { x: 0, y: 6, w: 12, h: 4 },
        config: {}
      })
    ]);

    console.log(`✅ Created ${2} dashboards with ${6} items`);

    // ===========================================================================
    // 6. REPORTS
    // ===========================================================================
    console.log('\n📄 Creating reports...');

    const [monthlyReport, quarterlyReport] = await Promise.all([
      Report.create({
        name: 'Monthly Performance Report',
        description: 'Comprehensive monthly performance metrics',
        category: 'Performance',
        type: 'mixed',
        format: 'pdf',
        pageSize: 'a4',
        orientation: 'portrait',
        definition: {
          sections: [
            { type: 'header', content: 'Monthly Performance Report' },
            { type: 'visualization', visualizationId: lineChartViz.id },
            { type: 'visualization', visualizationId: barChartViz.id },
            { type: 'table', datasetId: userGrowthDataset.id }
          ],
          includeCharts: true,
          includeTables: true
        },
        createdBy: SYSTEM_USER_ID,
        metadata: {
          frequency: 'monthly',
          tags: ['monthly', 'performance']
        }
      }),

      Report.create({
        name: 'Quarterly Analytics Summary',
        description: 'Executive summary of quarterly analytics',
        category: 'Analytics',
        type: 'mixed',
        format: 'excel',
        definition: {
          sections: [
            { type: 'summary', content: 'Quarterly Analytics Summary' },
            { type: 'visualization', visualizationId: pieChartViz.id },
            { type: 'table', datasetId: salesDataset.id }
          ],
          includeSummary: true,
          includeDetails: true
        },
        createdBy: SYSTEM_USER_ID,
        metadata: {
          frequency: 'quarterly',
          tags: ['quarterly', 'executive']
        }
      })
    ]);

    // Add parameters to reports
    await Promise.all([
      ReportParameter.create({
        reportId: monthlyReport.id,
        name: 'report_month',
        label: 'Report Month',
        type: 'date',
        defaultValue: new Date().toISOString().slice(0, 7),
        required: true,
        order: 1
      }),

      ReportParameter.create({
        reportId: quarterlyReport.id,
        name: 'quarter',
        label: 'Quarter',
        type: 'select',
        defaultValue: 'Q4',
        options: ['Q1', 'Q2', 'Q3', 'Q4'],
        required: true,
        order: 1
      }),

      ReportParameter.create({
        reportId: quarterlyReport.id,
        name: 'year',
        label: 'Year',
        type: 'number',
        defaultValue: new Date().getFullYear(),
        required: true,
        order: 2
      })
    ]);

    console.log(`✅ Created ${2} reports with parameters`);

    // ===========================================================================
    // 7. SCHEDULES
    // ===========================================================================
    console.log('\n⏰ Creating schedules...');

    const [monthlySchedule, weeklySchedule] = await Promise.all([
      Schedule.create({
        reportId: monthlyReport.id,
        name: 'Monthly Report - First Monday',
        description: 'Send monthly report on first Monday of each month',
        cronExpression: '0 9 * * 1#1',
        timezone: 'America/Los_Angeles',
        parameters: {},
        format: 'pdf',
        recipients: ['executive@exprsn.io', 'analytics@exprsn.io'],
        deliveryMethod: 'email',
        emailSubject: 'Monthly Performance Report - {{month}}',
        emailBody: 'Please find attached the monthly performance report.',
        isActive: true,
        startDate: new Date(),
        createdBy: SYSTEM_USER_ID,
        metadata: {
          priority: 'high'
        }
      }),

      Schedule.create({
        reportId: quarterlyReport.id,
        name: 'Weekly Analytics Digest',
        description: 'Weekly analytics summary every Monday morning',
        cronExpression: '0 8 * * 1',
        timezone: 'America/Los_Angeles',
        parameters: {},
        format: 'excel',
        recipients: ['team@exprsn.io'],
        deliveryMethod: 'email',
        emailSubject: 'Weekly Analytics Digest',
        emailBody: 'Your weekly analytics summary is attached.',
        isActive: true,
        startDate: new Date(),
        createdBy: SYSTEM_USER_ID
      })
    ]);

    console.log(`✅ Created ${2} schedules`);

    // ===========================================================================
    // Summary
    // ===========================================================================
    console.log('\n' + '='.repeat(70));
    console.log('✨ Demo data seeding completed successfully!');
    console.log('='.repeat(70));
    console.log(`
📊 Data Sources:     3
📝 Queries:          4
📦 Datasets:         3
📈 Visualizations:   5
🎛️  Dashboards:       2 (with 6 items)
📄 Reports:          2 (with 3 parameters)
⏰ Schedules:        2

🌐 Access the dashboard at: https://localhost:8443
    `);

    return {
      dataSources: 3,
      queries: 4,
      datasets: 3,
      visualizations: 5,
      dashboards: 2,
      dashboardItems: 6,
      reports: 2,
      schedules: 2
    };

  } catch (error) {
    console.error('❌ Error seeding demo data:', error);
    throw error;
  }
}

// Run seeder if called directly
if (require.main === module) {
  seed()
    .then(() => {
      console.log('\n✅ Seeding complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seed };
