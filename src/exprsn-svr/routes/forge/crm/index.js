const express = require('express');
const router = express.Router();

// Mount CRM sub-routes
router.use('/contacts', require('./contacts'));
router.use('/leads', require('./leads'));
router.use('/companies', require('./companies'));
router.use('/activities', require('./activities'));
router.use('/opportunities', require('./opportunities'));
router.use('/tickets', require('./tickets'));
router.use('/campaigns', require('./campaigns'));

// CRM module info
router.get('/', (req, res) => {
  res.json({
    module: 'crm',
    description: 'Customer Relationship Management',
    version: '1.0.0',
    status: 'production-ready',
    features: {
      contacts: 'Complete contact lifecycle with merge/dedup, timeline, segmentation',
      leads: 'Lead scoring, qualification, and conversion',
      opportunities: 'Sales pipeline with forecasting, win/loss analysis',
      tickets: 'Support ticketing with SLA tracking and escalation',
      campaigns: 'Marketing automation with performance analytics',
      companies: 'Company management and relationships',
      activities: 'Activity tracking and logging'
    },
    endpoints: {
      contacts: '/api/crm/contacts',
      leads: '/api/crm/leads',
      opportunities: '/api/crm/opportunities',
      tickets: '/api/crm/tickets',
      campaigns: '/api/crm/campaigns',
      companies: '/api/crm/companies',
      activities: '/api/crm/activities'
    },
    statistics: {
      totalServices: 7,
      totalEndpoints: 80,
      linesOfCode: 3200
    }
  });
});

module.exports = router;
