'use strict';

/**
 * Singleton emitter for platform config-override changes (TASK-039).
 * Events:
 *   'change' — { key, module, restartRequired, pendingRestart, updatedBy,
 *               updatedAt, action: 'set'|'delete' } (never carries values;
 *               consumers re-read config/process.env or the REST API).
 */
const { EventEmitter } = require('events');

const configEvents = new EventEmitter();
configEvents.setMaxListeners(50);

module.exports = { configEvents };
