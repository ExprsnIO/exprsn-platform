/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Prefetch - Logger
 * Uses @exprsn/shared logger for consistency across services
 * ═══════════════════════════════════════════════════════════════════════
 */

const { createLogger } = require('@exprsn/shared');

module.exports = createLogger('exprsn-prefetch');
