const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  res.json({ success: true, message: 'Configuration routes - to be implemented' });
});

module.exports = router;
