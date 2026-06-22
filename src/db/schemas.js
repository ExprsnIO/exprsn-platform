'use strict';

const { MODULES } = require('../modules/registry');

// domain -> postgres schema. Derived from the module registry so there is a
// single source of truth.
const SCHEMAS = MODULES.map((m) => m.schema);

module.exports = { SCHEMAS };
