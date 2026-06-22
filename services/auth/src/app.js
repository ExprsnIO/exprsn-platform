/**
 * ═══════════════════════════════════════════════════════════
 * Express app handle (test entrypoint)
 *
 * The platform module lives in ./index (exports { name, app, init }). Tests and
 * supertest want the bare Express app, so re-export it here. Requiring this does
 * NOT listen and does NOT run init() — the test harness configures the DB and
 * passport strategies itself (see tests/helpers/testDatabase.js).
 * ═══════════════════════════════════════════════════════════
 */

module.exports = require('./index').app;
