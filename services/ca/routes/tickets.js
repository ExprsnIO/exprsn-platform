/**
 * ═══════════════════════════════════════════════════════════════════════
 * Ticket Routes
 * ═══════════════════════════════════════════════════════════════════════
 *
 * platform: HTML index view removed (API-only module). JSON ticket
 * generation is preserved below.
 */

const express = require('express');
const router = express.Router();
const { Ticket } = require('../models');

router.post('/generate', async (req, res) => {
  try {
    const ticket = await Ticket.create({
      ticketCode: Ticket.generateTicketCode(),
      userId: req.session.user.id,
      type: req.body.type || 'login',
      maxUses: parseInt(req.body.maxUses) || 1,
      usesRemaining: parseInt(req.body.maxUses) || 1,
      expiresAt: new Date(Date.now() + 300000) // 5 minutes
    });
    res.json({ success: true, ticket });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
