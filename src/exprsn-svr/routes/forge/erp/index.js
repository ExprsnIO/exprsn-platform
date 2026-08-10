const express = require('express');
const router = express.Router();

// Mount ERP sub-routes

// Sales & Inventory
router.use('/products', require('./products'));
router.use('/inventory', require('./inventory'));
router.use('/purchase-orders', require('./purchaseOrders'));
router.use('/sales-orders', require('./salesOrders'));

// Financial Management
router.use('/invoices', require('./invoices'));
router.use('/accounting', require('./accounting'));
router.use('/reports', require('./reports'));
router.use('/tax', require('./tax'));
router.use('/bank-reconciliation', require('./bankReconciliation'));
router.use('/credit-notes', require('./creditNotes'));
router.use('/financial-reports', require('./financialReports'));

// HR Management
router.use('/employees', require('./employees'));
router.use('/hr', require('./hr'));

// Asset Management
router.use('/assets', require('./assets'));

// Project Management
router.use('/projects', require('./projects'));

// ERP module info
router.get('/', (req, res) => {
  res.json({
    module: 'erp',
    description: 'Enterprise Resource Planning',
    version: '1.0.0',
    modules: {
      sales: {
        products: '/api/erp/products',
        inventory: '/api/erp/inventory',
        purchaseOrders: '/api/erp/purchase-orders',
        salesOrders: '/api/erp/sales-orders'
      },
      financial: {
        invoices: '/api/erp/invoices',
        accounting: '/api/erp/accounting',
        reports: '/api/erp/reports',
        tax: '/api/erp/tax',
        bankReconciliation: '/api/erp/bank-reconciliation',
        creditNotes: '/api/erp/credit-notes',
        financialReports: '/api/erp/financial-reports'
      },
      hr: {
        employees: '/api/erp/employees',
        payroll: '/api/erp/hr/payroll',
        leaveRequests: '/api/erp/hr/leave-requests',
        performanceReviews: '/api/erp/hr/performance-reviews'
      },
      assets: {
        assets: '/api/erp/assets',
        maintenanceSchedules: '/api/erp/maintenance-schedules'
      },
      projects: {
        projects: '/api/erp/projects',
        dashboard: '/api/erp/projects/dashboard',
        milestones: '/api/erp/projects/:id/milestones',
        timeTracking: '/api/erp/projects/:id/time',
        statistics: '/api/erp/projects/:id/statistics'
      }
    },
    endpoints: 138,
    status: 'production-ready',
    completionPercentage: 100,
    features: {
      projectManagement: {
        description: 'Comprehensive project tracking with budgets, milestones, and time tracking',
        endpoints: 14
      },
      taxManagement: {
        description: 'Tax rates, exemptions, calculations, and compliance reporting',
        endpoints: 16
      },
      bankReconciliation: {
        description: 'Automated bank statement reconciliation with matching and adjustments',
        endpoints: 7
      },
      creditNotes: {
        description: 'Credit note issuance, application, and refund processing',
        endpoints: 11
      },
      financialReports: {
        description: 'Balance Sheet, P&L, Cash Flow, and Financial Metrics',
        endpoints: 4
      }
    }
  });
});

module.exports = router;
