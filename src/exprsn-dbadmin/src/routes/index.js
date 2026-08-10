const express = require('express');
const router = express.Router();

// Import route modules
const connectionRoutes = require('./connections');
const queryRoutes = require('./queries');
const tablespaceRoutes = require('./tablespaces');
const tableRoutes = require('./tables');
const functionRoutes = require('./functions');
const triggerRoutes = require('./triggers');
const sequenceRoutes = require('./sequences');
const roleRoutes = require('./roles');
const importExportRoutes = require('./import-export');
const jsonlexRoutes = require('./jsonlex');

// Mount routes
router.use('/connections', connectionRoutes);
router.use('/queries', queryRoutes);
router.use('/tablespaces', tablespaceRoutes);
router.use('/tables', tableRoutes);
router.use('/functions', functionRoutes);
router.use('/triggers', triggerRoutes);
router.use('/sequences', sequenceRoutes);
router.use('/roles', roleRoutes);
router.use('/import-export', importExportRoutes);
router.use('/jsonlex', jsonlexRoutes);

// API info endpoint
router.get('/', (req, res) => {
  res.json({
    success: true,
    service: 'exprsn-dbadmin',
    version: '1.0.0',
    endpoints: {
      connections: '/api/connections',
      queries: '/api/queries',
      tablespaces: '/api/tablespaces',
      tables: '/api/tables',
      functions: '/api/functions',
      triggers: '/api/triggers',
      sequences: '/api/sequences',
      roles: '/api/roles',
      importExport: '/api/import-export',
      jsonlex: '/api/jsonlex'
    }
  });
});

module.exports = router;
