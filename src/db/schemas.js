'use strict';

const { MODULES } = require('../modules/registry');

// domain -> postgres schema. Derived from the module registry so there is a
// single source of truth. The gateway itself owns one extra schema for
// platform-level state (config overrides — TASK-039); it is deliberately NOT a
// registry entry because the gateway is not a module.
const PLATFORM_SCHEMA = 'platform';
const SCHEMAS = [...MODULES.map((m) => m.schema), PLATFORM_SCHEMA];

module.exports = { SCHEMAS, PLATFORM_SCHEMA };
