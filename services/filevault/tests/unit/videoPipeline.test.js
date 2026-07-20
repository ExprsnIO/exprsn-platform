'use strict';

/**
 * FEAT-073 — video moderation PIPELINE (keyframe extraction + vision passes).
 * ffmpeg/ffprobe (child_process.execFile), storage.retrieveToFile, and the cortex
 * façade are all mocked. The real filesystem is used for the temp dir so we can
 * assert it is purged even when the pass throws.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const fs = require('fs');
const fsp = require('fs').promises;

jest.mock('child_process', () => ({ execFile: jest.fn() }));
jest.mock('../../src/storage', () => ({ retrieveToFile: jest.fn(async () => ({ path: 'x', bytesWritten: 1 })) }));
jest.mock('../../../cortex/src/client', () => ({
  moderateFrames: jest.fn(),
  describeFrames: jest.fn(),
}));
jest.mock('@exprsn/shared', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { execFile } = require('child_process');
const storage = require('../../src/storage');
const cortex = require('../../../cortex/src/client');
const pipeline = require('../../../../src/workers/videoModeration/pipeline');

const FILE = { id: 'v1', userId: 'u1', mimetype: 'video/mp4', storageKey: 'k', storageBackend: 'disk' };

const CLEAN = {
  provider: 'cortex', backend: 'llama', model: 'test-vl', riskScore: 4,
  nsfwScore: 0, violenceScore: 0, flags: [], explanation: 'benign',
  frameScores: [{ frame: 0, riskScore: 4, flags: [] }], framesInspected: 3, framesTotal: 3,
};
const NASTY = { ...CLEAN, riskScore: 96, nsfwScore: 98, flags: ['nsfw'] };
const DESC = { backend: 'llama', model: 'test-vl', altText: 'a clip', tags: ['clip'], textInImage: '' };

// A default execFile mock: ffprobe reports a duration, ffmpeg writes a frame file.
function wireFfmpegOk({ duration = '90.0' } = {}) {
  execFile.mockImplementation((bin, args, opts, cb) => {
    if (String(bin).includes('ffprobe')) {
      cb(null, `${duration}\n`, '');
      return;
    }
    const outPath = args[args.length - 1];
    fs.writeFileSync(outPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    cb(null, '', '');
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.FILEVAULT_VIDEO_MODERATION;
  delete process.env.FILEVAULT_VIDEO_RISK_THRESHOLD;
  delete process.env.FFMPEG_PATH;
  delete process.env.FFPROBE_PATH;
  storage.retrieveToFile.mockResolvedValue({ path: 'x', bytesWritten: 1 });
});

// ---------------------------------------------------------------- frame planning

describe('frameTimestamps() — clamped to [min, max]', () => {
  test('a long video is capped at VIDEO_FRAMES_MAX (default 12)', () => {
    expect(pipeline.frameTimestamps(3600).length).toBe(12);
  });
  test('a short video still yields VIDEO_FRAMES_MIN (default 3)', () => {
    expect(pipeline.frameTimestamps(5).length).toBe(3);
  });
  test('unknown duration falls back to the minimum', () => {
    expect(pipeline.frameTimestamps(0).length).toBe(3);
  });
});

// ---------------------------------------------------------------- happy paths

describe('evaluateVideo() success', () => {
  test('a clean video (enforce) is approved with tags, and the temp dir is purged', async () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    wireFfmpegOk();
    cortex.moderateFrames.mockResolvedValue(CLEAN);
    cortex.describeFrames.mockResolvedValue(DESC);
    const mkdtemp = jest.spyOn(fsp, 'mkdtemp');

    const patch = await pipeline.evaluateVideo(FILE);

    expect(patch.status).toBe('approved');
    expect(patch.reason).toBe('clean');
    expect(patch.verdict.frameScores).toEqual(CLEAN.frameScores);
    expect(patch.aiTags).toEqual(['clip']);
    // streamed to disk, never buffered
    expect(storage.retrieveToFile).toHaveBeenCalledWith('k', 'disk', expect.any(String));
    // temp dir gone
    const dir = await mkdtemp.mock.results[0].value;
    expect(fs.existsSync(dir)).toBe(false);
  });

  test('enforce: a flagged video is REJECTED (held)', async () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    wireFfmpegOk();
    cortex.moderateFrames.mockResolvedValue(NASTY);
    cortex.describeFrames.mockResolvedValue(DESC);
    const patch = await pipeline.evaluateVideo(FILE);
    expect(patch.status).toBe('rejected');
    expect(patch.reason).toBe('flagged');
  });

  test('shadow: a flagged video stays APPROVED but records the verdict', async () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'shadow';
    wireFfmpegOk();
    cortex.moderateFrames.mockResolvedValue(NASTY);
    cortex.describeFrames.mockResolvedValue(DESC);
    const patch = await pipeline.evaluateVideo(FILE);
    expect(patch.status).toBe('approved');
    expect(patch.reason).toBe('shadow_flagged');
    expect(patch.riskScore).toBe(96);
  });

  test('describeFrames failure is SOFT — the verdict is still written', async () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    wireFfmpegOk();
    cortex.moderateFrames.mockResolvedValue(CLEAN);
    cortex.describeFrames.mockRejectedValue(
      Object.assign(new Error('caption down'), { code: 'VISION_UNAVAILABLE' }));
    const patch = await pipeline.evaluateVideo(FILE);
    expect(patch.status).toBe('approved');
    expect(patch.aiTags).toEqual([]);
    expect(patch.altText).toBeNull();
  });
});

// ---------------------------------------------------------------- fail closed

describe('evaluateVideo() fails CLOSED', () => {
  test('moderateFrames throwing PROPAGATES (never approves) and still purges the temp dir', async () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    wireFfmpegOk();
    cortex.moderateFrames.mockRejectedValue(
      Object.assign(new Error('router down'), { code: 'LLM_UNAVAILABLE' }));
    const mkdtemp = jest.spyOn(fsp, 'mkdtemp');

    await expect(pipeline.evaluateVideo(FILE)).rejects.toThrow(/router down/);
    expect(cortex.describeFrames).not.toHaveBeenCalled();

    const dir = await mkdtemp.mock.results[0].value;
    expect(fs.existsSync(dir)).toBe(false); // purged even on throw
  });

  test('a missing ffprobe binary is a TRANSIENT FFMPEG_UNAVAILABLE (retryable)', async () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    execFile.mockImplementation((bin, args, opts, cb) => {
      cb(Object.assign(new Error('spawn ffprobe ENOENT'), { code: 'ENOENT' }));
    });
    await expect(pipeline.evaluateVideo(FILE)).rejects.toMatchObject({ code: 'FFMPEG_UNAVAILABLE' });
    expect(cortex.moderateFrames).not.toHaveBeenCalled(); // never inspected → never approved
  });

  test('a video ffprobe cannot decode is terminal UNSUPPORTED_VIDEO', async () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    execFile.mockImplementation((bin, args, opts, cb) => {
      cb(Object.assign(new Error('Invalid data found'), { code: 1 }), '', 'moov atom not found');
    });
    await expect(pipeline.evaluateVideo(FILE)).rejects.toMatchObject({ code: 'UNSUPPORTED_VIDEO' });
  });

  test('when NO frame can be extracted, it fails transiently (never approves)', async () => {
    process.env.FILEVAULT_VIDEO_MODERATION = 'enforce';
    execFile.mockImplementation((bin, args, opts, cb) => {
      if (String(bin).includes('ffprobe')) { cb(null, '90.0\n', ''); return; }
      // ffmpeg "succeeds" but writes no file → no frame buffer read
      cb(null, '', '');
    });
    await expect(pipeline.evaluateVideo(FILE)).rejects.toMatchObject({ code: 'FFMPEG_NO_FRAMES' });
    expect(cortex.moderateFrames).not.toHaveBeenCalled();
  });
});
