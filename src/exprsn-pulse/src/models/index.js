/**
 * Exprsn Pulse - Database Models
 */

const { Sequelize } = require('sequelize');
const config = require('../config');

// Initialize Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME || 'exprsn_pulse',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
);

// Import models
const DataSource = require('./DataSource')(sequelize);
const Dataset = require('./Dataset')(sequelize);
const Query = require('./Query')(sequelize);
const Visualization = require('./Visualization')(sequelize);
const Dashboard = require('./Dashboard')(sequelize);
const DashboardItem = require('./DashboardItem')(sequelize);
const Report = require('./Report')(sequelize);
const ReportParameter = require('./ReportParameter')(sequelize);
const Filter = require('./Filter')(sequelize);
const Schedule = require('./Schedule')(sequelize);
const ScheduleExecution = require('./ScheduleExecution')(sequelize);
const Share = require('./Share')(sequelize);

// Define associations
DataSource.hasMany(Query, { foreignKey: 'dataSourceId', as: 'queries' });
Query.belongsTo(DataSource, { foreignKey: 'dataSourceId', as: 'dataSource' });

Query.hasMany(Dataset, { foreignKey: 'queryId', as: 'datasets' });
Dataset.belongsTo(Query, { foreignKey: 'queryId', as: 'query' });

Dataset.hasMany(Visualization, { foreignKey: 'datasetId', as: 'visualizations' });
Visualization.belongsTo(Dataset, { foreignKey: 'datasetId', as: 'dataset' });

Dashboard.hasMany(DashboardItem, { foreignKey: 'dashboardId', as: 'items', onDelete: 'CASCADE' });
DashboardItem.belongsTo(Dashboard, { foreignKey: 'dashboardId', as: 'dashboard' });

DashboardItem.belongsTo(Visualization, { foreignKey: 'visualizationId', as: 'visualization' });
Visualization.hasMany(DashboardItem, { foreignKey: 'visualizationId', as: 'dashboardItems' });

Report.hasMany(ReportParameter, { foreignKey: 'reportId', as: 'parameters', onDelete: 'CASCADE' });
ReportParameter.belongsTo(Report, { foreignKey: 'reportId', as: 'report' });

Report.hasMany(Filter, { foreignKey: 'reportId', as: 'filters', onDelete: 'CASCADE' });
Filter.belongsTo(Report, { foreignKey: 'reportId', as: 'report' });

Report.hasMany(Schedule, { foreignKey: 'reportId', as: 'schedules' });
Schedule.belongsTo(Report, { foreignKey: 'reportId', as: 'report' });

Schedule.hasMany(ScheduleExecution, { foreignKey: 'scheduleId', as: 'executions' });
ScheduleExecution.belongsTo(Schedule, { foreignKey: 'scheduleId', as: 'schedule' });

Dashboard.hasMany(Share, { foreignKey: 'resourceId', as: 'shares', scope: { resourceType: 'dashboard' } });
Report.hasMany(Share, { foreignKey: 'resourceId', as: 'shares', scope: { resourceType: 'report' } });

// Export models and sequelize instance
module.exports = {
  sequelize,
  DataSource,
  Dataset,
  Query,
  Visualization,
  Dashboard,
  DashboardItem,
  Report,
  ReportParameter,
  Filter,
  Schedule,
  ScheduleExecution,
  Share
};
