'use strict';

// Human-readable run-artifact ids (task-…, asst-…, chat-…, mail-…, rev-…),
// kept from the source engine because the API exposes and cross-references
// them. Matches /^[\w-]+$/ by construction.

const crypto = require('crypto');

function newId(prefix) {
  return `${prefix}-${Math.floor(Date.now() / 1000)}-${crypto.randomBytes(3).toString('hex')}`;
}

module.exports = { newId };
