const express = require('express');
const router = express.Router();

// TODO: Implement route handlers
router.get('/', (req, res) => {
  res.json({ success: true, message: 'Endpoint not yet implemented', data: [] });
});

module.exports = router;
