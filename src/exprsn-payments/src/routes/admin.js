const express = require('express');
const router = express.Router();
const path = require('path');
const { validateCAToken, requirePermissions, asyncHandler } = require('@exprsn/shared');

/**
 * @route   GET /admin/dashboard
 * @desc    Show payments dashboard
 * @access  Private (requires read permission)
 */
router.get('/dashboard',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    res.render('dashboard', {
      user: req.user,
      title: 'Payments Dashboard'
    });
  }
);

/**
 * @route   GET /admin/subscriptions
 * @desc    Show subscriptions management page
 * @access  Private (requires read permission)
 */
router.get('/subscriptions',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    res.render('subscriptions', {
      user: req.user,
      title: 'Subscriptions'
    });
  }
);

/**
 * @route   GET /admin/subscriptions/:id
 * @desc    Show subscription detail page
 * @access  Private (requires read permission)
 */
router.get('/subscriptions/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    res.render('subscription-detail', {
      user: req.user,
      subscriptionId: req.params.id,
      title: 'Subscription Details'
    });
  }
);

/**
 * @route   GET /admin/invoices
 * @desc    Show invoices management page
 * @access  Private (requires read permission)
 */
router.get('/invoices',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    res.render('invoices', {
      user: req.user,
      title: 'Invoices'
    });
  }
);

/**
 * @route   GET /admin/invoices/:id
 * @desc    Show invoice detail page
 * @access  Private (requires read permission)
 */
router.get('/invoices/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    res.render('invoice-detail', {
      user: req.user,
      invoiceId: req.params.id,
      title: 'Invoice Details'
    });
  }
);

/**
 * @route   GET /admin/chargebacks
 * @desc    Show chargebacks management page
 * @access  Private (requires read permission)
 */
router.get('/chargebacks',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    res.render('chargebacks', {
      user: req.user,
      title: 'Chargebacks'
    });
  }
);

/**
 * @route   GET /admin/chargebacks/:id
 * @desc    Show chargeback detail page
 * @access  Private (requires read permission)
 */
router.get('/chargebacks/:id',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    res.render('chargeback-detail', {
      user: req.user,
      chargebackId: req.params.id,
      title: 'Chargeback Details'
    });
  }
);

/**
 * @route   GET /admin/customers
 * @desc    Show customers management page
 * @access  Private (requires read permission)
 */
router.get('/customers',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    res.render('customers', {
      user: req.user,
      title: 'Customers'
    });
  }
);

/**
 * @route   GET /admin/transactions
 * @desc    Show transactions page
 * @access  Private (requires read permission)
 */
router.get('/transactions',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    res.render('transactions', {
      user: req.user,
      title: 'Transactions'
    });
  }
);

/**
 * @route   GET /admin/reports/revenue
 * @desc    Show revenue reports
 * @access  Private (requires read permission)
 */
router.get('/reports/revenue',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    res.render('reports-revenue', {
      user: req.user,
      title: 'Revenue Reports'
    });
  }
);

/**
 * @route   GET /admin/reports/analytics
 * @desc    Show analytics dashboard
 * @access  Private (requires read permission)
 */
router.get('/reports/analytics',
  validateCAToken,
  requirePermissions({ read: true }),
  (req, res) => {
    res.render('reports-analytics', {
      user: req.user,
      title: 'Analytics'
    });
  }
);

module.exports = router;
