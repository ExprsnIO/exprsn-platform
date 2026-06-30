'use strict';

/** Vocabulary endpoints — the closed capability + event registries (for the UI). */
const express = require('express');
const router = express.Router();
const capabilities = require('../capabilities');
const events = require('../events');
const { INSTALL_MACHINE } = require('../services/stateMachine');

router.get('/capabilities', (req, res) => res.json({ capabilities: capabilities.CAPABILITIES }));
router.get('/events', (req, res) => res.json({ events: events.EVENTS, surfaces: events.MODULE_SURFACES }));
router.get('/lifecycle', (req, res) => res.json({ machine: INSTALL_MACHINE }));

module.exports = router;
