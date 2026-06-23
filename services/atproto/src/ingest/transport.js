/**
 * Transport factory — selects the firehose transport by config. Both expose the
 * same EventEmitter contract (connect/close + 'event'/'cursor' events) so the
 * worker is transport-agnostic.
 */

const config = require('../../config');
const JetstreamTransport = require('./jetstreamTransport');
const SubscribeReposTransport = require('./subscribeReposTransport');

function createTransport({ cursor = null } = {}) {
  const kind = config.firehose.transport;
  switch (kind) {
    case 'jetstream':
      return new JetstreamTransport({ cursor });
    case 'subscribeRepos':
      return new SubscribeReposTransport({ cursor });
    default:
      throw new Error(`Unknown ATPROTO_FIREHOSE_TRANSPORT: ${kind} (use jetstream|subscribeRepos)`);
  }
}

module.exports = { createTransport };
