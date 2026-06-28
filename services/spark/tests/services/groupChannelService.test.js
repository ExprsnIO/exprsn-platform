/**
 * Unit tests for the Phase 4 group channel service.
 *
 * Models and the nexus membership lookup are mocked so these run without a live
 * Postgres/Redis/nexus (the integration suites cover the real DB path).
 */

// Mock the live nexus membership resolver.
jest.mock('@exprsn/shared/middleware/groupMembership', () => ({
  resolveMembership: jest.fn()
}));

// Mock the Sequelize models used by the service.
jest.mock('../../src/models', () => ({
  Conversation: { findOrCreate: jest.fn() },
  Participant: { findOrCreate: jest.fn() }
}));

const { resolveMembership } = require('@exprsn/shared/middleware/groupMembership');
const { Conversation, Participant } = require('../../src/models');
const {
  CHANNEL_KINDS,
  canWriteChannel,
  mapNexusRoleToParticipantRole,
  ensureGroupChannels,
  authorizeConversationAccess
} = require('../../src/services/groupChannelService');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('canWriteChannel', () => {
  test('chat channel is writable by any member', () => {
    expect(canWriteChannel('chat', 'member')).toBe(true);
    expect(canWriteChannel('chat', 'moderator')).toBe(true);
  });

  test('announcement channel is writable only by admins/owners', () => {
    expect(canWriteChannel('announcement', 'member')).toBe(false);
    expect(canWriteChannel('announcement', 'moderator')).toBe(false);
    expect(canWriteChannel('announcement', 'admin')).toBe(true);
    expect(canWriteChannel('announcement', 'owner')).toBe(true);
  });
});

describe('mapNexusRoleToParticipantRole', () => {
  test('collapses moderator to member, preserves owner/admin', () => {
    expect(mapNexusRoleToParticipantRole('owner')).toBe('owner');
    expect(mapNexusRoleToParticipantRole('admin')).toBe('admin');
    expect(mapNexusRoleToParticipantRole('moderator')).toBe('member');
    expect(mapNexusRoleToParticipantRole('member')).toBe('member');
  });
});

describe('ensureGroupChannels', () => {
  test('provisions both a chat and an announcement channel', async () => {
    Conversation.findOrCreate.mockImplementation(async ({ where }) => [
      { id: `conv-${where.channelKind}`, channelKind: where.channelKind },
      true
    ]);

    const channels = await ensureGroupChannels('group-1', 'user-1');

    expect(Conversation.findOrCreate).toHaveBeenCalledTimes(CHANNEL_KINDS.length);
    expect(channels.chat.channelKind).toBe('chat');
    expect(channels.announcement.channelKind).toBe('announcement');
    // Created as group-bound with creator recorded.
    const firstCall = Conversation.findOrCreate.mock.calls[0][0];
    expect(firstCall.defaults.type).toBe('group');
    expect(firstCall.defaults.groupId).toBe('group-1');
    expect(firstCall.defaults.createdBy).toBe('user-1');
  });
});

describe('authorizeConversationAccess', () => {
  test('non-group conversations are always allowed (local check governs)', async () => {
    const res = await authorizeConversationAccess({ groupId: null }, 'user-1');
    expect(res.ok).toBe(true);
    expect(resolveMembership).not.toHaveBeenCalled();
  });

  test('blocks non-members of the group', async () => {
    resolveMembership.mockResolvedValue({ isMember: false, role: null });
    const res = await authorizeConversationAccess(
      { groupId: 'g1', channelKind: 'chat' }, 'user-1'
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe('NOT_GROUP_MEMBER');
  });

  test('member may write to chat', async () => {
    resolveMembership.mockResolvedValue({ isMember: true, role: 'member' });
    const res = await authorizeConversationAccess(
      { groupId: 'g1', channelKind: 'chat' }, 'user-1', { write: true }
    );
    expect(res.ok).toBe(true);
  });

  test('member may READ announcement but not write', async () => {
    resolveMembership.mockResolvedValue({ isMember: true, role: 'member' });

    const read = await authorizeConversationAccess(
      { groupId: 'g1', channelKind: 'announcement' }, 'user-1'
    );
    expect(read.ok).toBe(true);

    const write = await authorizeConversationAccess(
      { groupId: 'g1', channelKind: 'announcement' }, 'user-1', { write: true }
    );
    expect(write.ok).toBe(false);
    expect(write.code).toBe('ANNOUNCEMENT_ADMIN_ONLY');
  });

  test('admin may write to announcement', async () => {
    resolveMembership.mockResolvedValue({ isMember: true, role: 'admin' });
    const res = await authorizeConversationAccess(
      { groupId: 'g1', channelKind: 'announcement' }, 'user-1', { write: true }
    );
    expect(res.ok).toBe(true);
  });

  test('propagates membership service unavailability', async () => {
    resolveMembership.mockResolvedValue({ _error: 'unavailable' });
    const res = await authorizeConversationAccess(
      { groupId: 'g1', channelKind: 'chat' }, 'user-1'
    );
    expect(res.ok).toBe(false);
    expect(res.code).toBe('MEMBERSHIP_SERVICE_UNAVAILABLE');
  });
});

// Keep Participant referenced so the model mock is exercised/linted.
test('Participant model mock is wired', () => {
  expect(typeof Participant.findOrCreate).toBe('function');
});
