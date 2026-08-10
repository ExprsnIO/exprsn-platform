/**
 * Forge Business Platform - Main Router
 *
 * Consolidates CRM, ERP, and Groupware functionality into exprsn-svr.
 * All forge routes are mounted under /forge prefix.
 */

const express = require('express');
const router = express.Router();
const path = require('path');

// Import CRM routes (only existing files)
const crmContactRoutes = require('./crm/contacts');
const crmCompanyRoutes = require('./crm/companies');
const crmLeadRoutes = require('./crm/leads');
const crmOpportunityRoutes = require('./crm/opportunities');
const crmActivityRoutes = require('./crm/activities');
const crmCampaignRoutes = require('./crm/campaigns');
const crmTicketRoutes = require('./crm/tickets');

// Import ERP routes
const erpRoutes = require('./erp/index');

// Import Groupware routes
const groupwareRoutes = require('./groupware');

// Import Schema/Config routes
const configRoutes = require('./config');
const schemaRoutes = require('./schemas');
const schemaDesignerRoutes = require('./schema-designer-simple');

// Mount CRM routes
router.use('/crm/contacts', crmContactRoutes);
router.use('/crm/companies', crmCompanyRoutes);
router.use('/crm/leads', crmLeadRoutes);
router.use('/crm/opportunities', crmOpportunityRoutes);
router.use('/crm/activities', crmActivityRoutes);
router.use('/crm/campaigns', crmCampaignRoutes);
router.use('/crm/tickets', crmTicketRoutes);

// Mount ERP routes
router.use('/erp', erpRoutes);

// Mount Groupware routes
router.use('/groupware', groupwareRoutes);

// Mount Configuration routes
router.use('/config', configRoutes);
router.use('/schemas', schemaRoutes);
router.use('/schema-designer', schemaDesignerRoutes);

// Visual Schema Designer - List Page
router.get('/designer', (req, res) => {
  res.render('schema-designer-list', {
    title: 'Schema Designer - Schemas List'
  });
});

// Visual Schema Designer - Canvas Page
router.get('/designer/:schemaId', (req, res) => {
  res.render('schema-designer', {
    schemaId: req.params.schemaId,
    title: 'Visual Schema Designer'
  });
});

// Forge home page
router.get('/', (req, res) => {
  res.render('forge/index', {
    title: 'Forge Business Platform',
    currentPath: req.path
  });
});

// API status
router.get('/api/status', (req, res) => {
  res.json({
    success: true,
    service: 'Forge Business Platform',
    version: '1.0.0',
    modules: {
      crm: {
        status: 'active',
        routes: 7,
        description: 'Customer Relationship Management'
      },
      erp: {
        status: 'active',
        routes: 138,
        description: 'Enterprise Resource Planning',
        submodules: ['sales', 'inventory', 'financial', 'hr', 'assets', 'projects']
      },
      groupware: {
        status: 'active',
        description: 'Collaboration & Communication'
      },
      config: {
        status: 'active',
        description: 'Configuration Management'
      },
      schemas: {
        status: 'active',
        description: 'Dynamic Schema Management'
      }
    },
    endpoints: {
      crm: '/forge/crm',
      erp: '/forge/erp',
      groupware: '/forge/groupware',
      config: '/forge/config',
      schemas: '/forge/schemas'
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
