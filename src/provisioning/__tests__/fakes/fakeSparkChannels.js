/**
 * Fake for services/spark/src/services/groupChannelService — the spark channel
 * façade the engine's S8 (slice-2 glue) binds and its compensator deletes.
 *
 * Real spark touches Redis/ES/its own schema at require time, so it is mocked:
 * ensureGroupChannels is idempotent per groupId and returns { chat, announcement }
 * conversation stubs; state lives in caState so S8 create + compensation delete are
 * observable.
 */

'use strict';

const crypto = require('crypto');
const { state } = require('./caState');

module.exports = {
  async ensureGroupChannels(groupId /* , createdBy */) {
    let channels = state.sparkChannelsByGroup.get(groupId);
    if (!channels) {
      channels = {
        chat: { id: crypto.randomUUID(), groupId, channelKind: 'chat' },
        announcement: { id: crypto.randomUUID(), groupId, channelKind: 'announcement' }
      };
      state.sparkChannelsByGroup.set(groupId, channels);
    }
    return channels;
  },

  async deleteGroupChannels(groupId) {
    const had = state.sparkChannelsByGroup.has(groupId);
    state.sparkChannelsByGroup.delete(groupId);
    return had ? 2 : 0;
  }
};
