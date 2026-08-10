/**
 * ═══════════════════════════════════════════════════════════
 * Models Index
 * Exports all Sequelize models for the SVR service
 * ═══════════════════════════════════════════════════════════
 */

const Page = require('./Page');
const Template = require('./Template');
const Component = require('./Component');
const PageAsset = require('./PageAsset');
const PageAnalytics = require('./PageAnalytics');
const PageVersion = require('./PageVersion');

// Set up associations
Page.hasMany(PageVersion, { foreignKey: 'page_id', as: 'versions' });
PageVersion.belongsTo(Page, { foreignKey: 'page_id', as: 'page' });

module.exports = {
  Page,
  Template,
  Component,
  PageAsset,
  PageAnalytics,
  PageVersion
};
