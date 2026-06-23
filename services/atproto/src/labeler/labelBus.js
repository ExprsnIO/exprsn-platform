/**
 * In-process pub/sub bridging labelService (producer) and the subscribeLabels
 * WebSocket server (consumer). Single-instance MVP: one emitter, one server.
 * Emits 'label' with a stored Label row whenever a new label is signed.
 */

const { EventEmitter } = require('events');

const bus = new EventEmitter();
// subscribeLabels can fan a single label out to many sockets.
bus.setMaxListeners(0);

module.exports = bus;
