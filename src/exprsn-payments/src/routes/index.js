const express = require('express');
const router = express.Router();

// Import route modules
const configurationsRouter = require('./configurations');
const transactionsRouter = require('./transactions');
const webhooksRouter = require('./webhooks');

// Mount routes
router.use('/configurations', configurationsRouter);
router.use('/transactions', transactionsRouter);
router.use('/webhooks', webhooksRouter);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'exprsn-payments',
    version: '1.0.0',
    endpoints: {
      configurations: '/api/configurations',
      transactions: '/api/transactions',
      webhooks: '/api/webhooks'
    },
    providers: ['stripe', 'paypal', 'authorizenet']
  });
});

module.exports = router;
