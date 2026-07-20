'use strict';

/**
 * BUG-032 regression — recordingService.createRecording must persist a valid row:
 * snake_case model attributes, the NOT-NULL user_id, and a status inside the
 * processing|ready|failed|deleted enum (NOT the old invalid 'recording'). The
 * Recording model, cloudflare, and the logger are mocked — no DB.
 */

const mockCreate = jest.fn(async (payload) => ({ id: 'rec-1', ...payload }));

jest.mock('../src/models', () => ({
  Recording: { create: mockCreate },
  Stream: {},
  Room: {},
}));
jest.mock('../src/services/cloudflare', () => ({}));
jest.mock('../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const recordingService = require('../src/services/recording');

const VALID_STATUS = new Set(['processing', 'ready', 'failed', 'deleted']);

beforeEach(() => jest.clearAllMocks());

describe('createRecording() — BUG-032', () => {
  test('persists snake_case attrs, the user_id, and a VALID status enum ("processing", not "recording")', async () => {
    await recordingService.createRecording({
      roomId: 'room-1', userId: 'u1', title: 'Room recording', outputPath: '/var/rec/rec-1.mp4', format: 'mp4',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const payload = mockCreate.mock.calls[0][0];

    // The initiating user is required (was silently dropped before the fix).
    expect(payload.user_id).toBe('u1');
    // A valid enum value — never the old invalid 'recording'.
    expect(payload.status).toBe('processing');
    expect(payload.status).not.toBe('recording');
    expect(VALID_STATUS.has(payload.status)).toBe(true);
    // snake_case attributes the model actually defines.
    expect(payload.room_id).toBe('room-1');
    expect(payload.storage_url).toBe('/var/rec/rec-1.mp4');
    expect(payload).toHaveProperty('started_at');
    // no camelCase keys the model would silently drop.
    expect(payload).not.toHaveProperty('roomId');
    expect(payload).not.toHaveProperty('userId');
    expect(payload).not.toHaveProperty('startedAt');
  });

  test('maps streamId -> stream_id and nulls the absent room_id', async () => {
    await recordingService.createRecording({ streamId: 's1', userId: 'u2', title: 'Stream recording' });
    const payload = mockCreate.mock.calls[0][0];
    expect(payload.stream_id).toBe('s1');
    expect(payload.room_id).toBeNull();
    expect(payload.user_id).toBe('u2');
    expect(payload.status).toBe('processing');
  });
});
