'use strict';

/**
 * FEAT-073 — VIDEO moderation awareness in the FileVault chokepoint service.
 * The cortex façade is mocked; no model, DB, Redis, or Bull is involved. The
 * queue modules are mocked so the dispatcher's routing can be asserted.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

jest.mock('../../../cortex/src/client', () => ({
  isEnabled: jest.fn(() => true),
  moderateImage: jest.fn(),
  describeImage: jest.fn(),
  moderateFrames: jest.fn(),
  describeFrames: jest.fn(),
}));

const mockEnqueueImageModeration = jest.fn(async () => true);
const mockRequeueImageModeration = jest.fn(async () => true);
const mockEnqueueVideoModeration = jest.fn(async () => true);
const mockRequeueVideoModeration = jest.fn(async () => true);
jest.mock('../../src/queues/imageModeration', () => ({
  enqueueImageModeration: mockEnqueueImageModeration,
  requeueImageModeration: mockRequeueImageModeration,
}));
jest.mock('../../src/queues/videoModeration', () => ({
  enqueueVideoModeration: mockEnqueueVideoModeration,
  requeueVideoModeration: mockRequeueVideoModeration,
}));

const svc = require('../../src/services/imageModerationService');

const vid = (over = {}) => ({ id: 'v1', userId: 'u1', mimetype: 'video/mp4', metadata: {}, ...over });
const img = (over = {}) => ({ id: 'f1', userId: 'u1', mimetype: 'image/png', metadata: {}, ...over });

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.FILEVAULT_IMAGE_MODERATION;
  delete process.env.FILEVAULT_VIDEO_MODERATION;
  delete process.env.FILEVAULT_VIDEO_RISK_THRESHOLD;
});

// ---------------------------------------------------------------- mode parsing

describe('videoModerationMode() — off | shadow | enforce, independent of images', () => {
  const cases = [
    [undefined, 'off'], ['', 'off'], ['false', 'off'], ['off', 'off'], ['nonsense', 'off'],
    ['shadow', 'shadow'], ['SHADOW', 'shadow'], ['  shadow  ', 'shadow'],
    ['enforce', 'enforce'], ['true', 'enforce'],
  ];
  test.each(cases)('%s -> %s', (raw, expected) => {
    if (raw === undefined) delete process.env.FILEVAULT_VIDEO_MODERATION;
    else process.env.FILEVAULT_VIDEO_MODERATION = raw;
    expect(svc.videoModerationMode()).toBe(expected);
  });

  test('the two flags are independent', () => {
    process.env.FILEVAULT_IMAGE_MODERATION = 'off';
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    expect(svc.moderationMode()).toBe('off');
    expect(svc.videoModerationMode()).toBe('enforce');
  });
});

// ---------------------------------------------------------------- mediaKind

describe('mediaKind()', () => {
  test('an image under image-enforce is "image"; a video is null when video off', () => {
    process.env.FILEVAULT_IMAGE_MODERATION = 'enforce';
    expect(svc.mediaKind(img())).toBe('image');
    expect(svc.mediaKind(vid())).toBeNull();
  });

  test('a video under video-enforce is "video"; an image is null when image off', () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    expect(svc.mediaKind(vid())).toBe('video');
    expect(svc.mediaKind(img())).toBeNull();
  });

  test('encrypted media of either kind is null', () => {
    process.env.FILEVAULT_IMAGE_MODERATION = 'enforce';
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    expect(svc.mediaKind(img({ metadata: { encrypted: true } }))).toBeNull();
    expect(svc.mediaKind(vid({ metadata: { e2ee: true } }))).toBeNull();
  });

  test('a non-media object is null', () => {
    process.env.FILEVAULT_IMAGE_MODERATION = 'enforce';
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    expect(svc.mediaKind(vid({ mimetype: 'application/pdf' }))).toBeNull();
  });
});

// ---------------------------------------------------------------- initial state

describe('video initialState() — same fail-closed semantics as images', () => {
  test('enforce: a video starts HIDDEN (pending) and is queued', () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    expect(svc.initialState(vid())).toEqual({ status: 'pending', reason: null });
    expect(svc.shouldQueue(vid())).toBe(true);
    expect(svc.isServableToOthers({ status: 'pending' })).toBe(false);
  });

  test('shadow: a video starts APPROVED (servable, never held) but is still queued', () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'shadow';
    expect(svc.initialState(vid())).toEqual({ status: 'approved', reason: 'shadow_pending' });
    expect(svc.isServableToOthers({ status: 'approved' })).toBe(true);
    expect(svc.shouldQueue(vid())).toBe(true);
  });

  test('off: a video is skipped/feature_disabled and NOT queued', () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'off';
    expect(svc.initialState(vid())).toEqual({ status: 'skipped', reason: 'feature_disabled' });
    expect(svc.shouldQueue(vid())).toBe(false);
  });

  test('an encrypted video is skipped explicitly, never queued', () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    const enc = vid({ metadata: { encrypted: true } });
    expect(svc.initialState(enc)).toEqual({ status: 'skipped', reason: 'encrypted' });
    expect(svc.shouldQueue(enc)).toBe(false);
  });
});

// ---------------------------------------------------------------- image untouched

describe('image behavior is unchanged by the video flag', () => {
  test('image enforce still holds; a video flag being on does not change it', () => {
    process.env.FILEVAULT_IMAGE_MODERATION = 'enforce';
    process.env.FILEVAULT_VIDEO_MODERATION = 'shadow';
    expect(svc.initialState(img())).toEqual({ status: 'pending', reason: null });
    expect(svc.shouldQueue(img())).toBe(true);
  });

  test('image off keeps images skipped/feature_disabled even with video enforce', () => {
    process.env.FILEVAULT_IMAGE_MODERATION = 'off';
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    expect(svc.initialState(img())).toEqual({ status: 'skipped', reason: 'feature_disabled' });
    expect(svc.shouldQueue(img())).toBe(false);
  });
});

// ---------------------------------------------------------------- risk threshold

describe('videoRiskThreshold()', () => {
  test('defaults to 70', () => {
    expect(svc.videoRiskThreshold()).toBe(70);
  });
  test('is configurable and independent of the image threshold', () => {
    process.env.FILEVAULT_VIDEO_RISK_THRESHOLD = '55';
    process.env.FILEVAULT_IMAGE_RISK_THRESHOLD = '90';
    expect(svc.videoRiskThreshold()).toBe(55);
    expect(svc.imageRiskThreshold()).toBe(90);
  });
});

// ---------------------------------------------------------------- dispatcher

describe('enqueueModerationFor() routes to the correct queue', () => {
  test('an image routes to the image queue (add, or requeue on replacement)', async () => {
    process.env.FILEVAULT_IMAGE_MODERATION = 'enforce';
    await svc.enqueueModerationFor(img());
    expect(mockEnqueueImageModeration).toHaveBeenCalledWith('f1');
    expect(mockEnqueueVideoModeration).not.toHaveBeenCalled();

    await svc.enqueueModerationFor(img(), { requeue: true });
    expect(mockRequeueImageModeration).toHaveBeenCalledWith('f1');
  });

  test('a video routes to the video queue (add, or requeue on replacement)', async () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    await svc.enqueueModerationFor(vid());
    expect(mockEnqueueVideoModeration).toHaveBeenCalledWith('v1');
    expect(mockEnqueueImageModeration).not.toHaveBeenCalled();

    await svc.enqueueModerationFor(vid(), { requeue: true });
    expect(mockRequeueVideoModeration).toHaveBeenCalledWith('v1');
  });

  test('a non-governed object is a no-op on BOTH queues', async () => {
    process.env.FILEVAULT_IMAGE_MODERATION = 'off';
    process.env.FILEVAULT_VIDEO_MODERATION = 'off';
    const r = await svc.enqueueModerationFor(vid());
    expect(r).toBe(false);
    expect(mockEnqueueImageModeration).not.toHaveBeenCalled();
    expect(mockEnqueueVideoModeration).not.toHaveBeenCalled();
  });
});
