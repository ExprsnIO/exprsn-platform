'use strict';

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    module: 'plugins',
    enabled: process.env.PLUGINS_ENABLED === 'true',
    scriptEnabled: process.env.PLUGINS_SCRIPT_ENABLED === 'true',
  });
});

module.exports = router;
