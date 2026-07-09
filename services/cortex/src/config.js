'use strict';

/**
 * Cortex module config — a thin re-export of the platform config so the
 * gateway process and the standalone Bull worker (services/cortex/src/worker.js)
 * read identical values. The platform config loads the root .env itself.
 */

module.exports = require('../../../src/config');
