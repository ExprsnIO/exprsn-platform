const express = require('express');
const router = express.Router();

router.get('/status', async (req, res) => {
  res.json({ success: true, message: 'Process management - to be implemented' });
});

module.exports = router;
