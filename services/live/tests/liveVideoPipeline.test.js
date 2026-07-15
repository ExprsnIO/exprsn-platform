'use strict';

/**
 * FEAT-074 — the Live-recording branch of the shared video pipeline,
 * `evaluateLocalVideo(localPath, { mode, riskThreshold })`. Mirrors the FileVault
 * videoPipeline unit test: ffmpeg/ffprobe (child_process.execFile) and the cortex
 * façade are mocked; the real filesystem backs the frames temp dir so we can
 * assert it is purged — and, critically, that the SOURCE recording is never
 * deleted (worker:live owns that file).
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const fs = require('fs');
const fsp = require('fs').promises;

jest.mock('child_process', () => ({ execFile: jest.fn() }));
// The pipeline requires these at module load; the Live branch never calls them,
// but stub them so requiring the pipeline stays cheap and DB/Redis-free.
jest.mock('../../filevault/src/storage', () => ({ retrieveToFile: jest.fn() }));
jest.mock('../../filevault/src/services/imageModerationService', () => ({
  videoModerationMode: jest.fn(() => 'off'),
  videoRiskThreshold: jest.fn(() => 70),
}));
jest.mock('../../cortex/src/client', () => ({
  moderateFrames: jest.fn(),
  describeFrames: jest.fn(),
}));
jest.mock('@exprsn/shared', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}));

const { execFile } = require('child_process');
const cortex = require('../../cortex/src/client');
const pipeline = require('../../../src/workers/videoModeration/pipeline');

const LOCAL_PATH = '/var/recordings/room-abc/recording-123.mp4';

const CLEAN = {
  provider: 'cortex', backend: 'llama', model: 'test-vl', riskScore: 4,
  nsfwScore: 0, violenceScore: 0, flags: [], explanation: 'benign',
  frameScores: [{ frame: 0, riskScore: 4, flags: [] }], framesInspected: 3, framesTotal: 3,
};
const NASTY = { ...CLEAN, riskScore: 96, nsfwScore: 98, flags: ['nsfw'] };
const DESC = { backend: 'llama', model: 'test-vl', altText: 'a clip', tags: ['clip'], textInImage: '' };

// ffprobe reports a duration; ffmpeg writes a JPEG into the frames temp dir.
function wireFfmpegOk({ duration = '90.0' } = {}) {
  execFile.mockImplementation((bin, args, opts, cb) => {
    if (String(bin).includes('ffprobe')) { cb(null, `${duration}\n`, ''); return; }
    const outPath = args[args.length - 1];
    fs.writeFileSync(outPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    cb(null, '', '');
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.FFMPEG_PATH;
  delete process.env.FFPROBE_PATH;
});

// ---------------------------------------------------------------- happy paths

describe('evaluateLocalVideo() — enforce/shadow/clean verdict shaping', () => {
  test('clean -> approved/clean, with tags, and the frames dir is purged', async () => {
    wireFfmpegOk();
    cortex.moderateFrames.mockResolvedValue(CLEAN);
    cortex.describeFrames.mockResolvedValue(DESC);
    const mkdtemp = jest.spyOn(fsp, 'mkdtemp');

    const patch = await pipeline.evaluateLocalVideo(LOCAL_PATH, { mode: 'enforce', riskThreshold: 70 });

    expect(patch.status).toBe('approved');
    expect(patch.reason).toBe('clean');
    expect(patch.riskScore).toBe(4);
    expect(patch.aiTags).toEqual(['clip']);
    const dir = await mkdtemp.mock.results[0].value;
    expect(fs.existsSync(dir)).toBe(false); // frames dir purged
  });

  test('enforce + flagged -> rejected/flagged (held)', async () => {
    wireFfmpegOk();
    cortex.moderateFrames.mockResolvedValue(NASTY);
    cortex.describeFrames.mockResolvedValue(DESC);
    const patch = await pipeline.evaluateLocalVideo(LOCAL_PATH, { mode: 'enforce', riskThreshold: 70 });
    expect(patch.status).toBe('rejected');
    expect(patch.reason).toBe('flagged');
  });

  test('shadow + flagged -> approved/shadow_flagged (never held)', async () => {
    wireFfmpegOk();
    cortex.moderateFrames.mockResolvedValue(NASTY);
    cortex.describeFrames.mockResolvedValue(DESC);
    const patch = await pipeline.evaluateLocalVideo(LOCAL_PATH, { mode: 'shadow', riskThreshold: 70 });
    expect(patch.status).toBe('approved');
    expect(patch.reason).toBe('shadow_flagged');
    expect(patch.riskScore).toBe(96);
  });

  test('describeFrames failure is SOFT — the verdict still builds', async () => {
    wireFfmpegOk();
    cortex.moderateFrames.mockResolvedValue(CLEAN);
    cortex.describeFrames.mockRejectedValue(
      Object.assign(new Error('caption down'), { code: 'VISION_UNAVAILABLE' }));
    const patch = await pipeline.evaluateLocalVideo(LOCAL_PATH, { mode: 'enforce', riskThreshold: 70 });
    expect(patch.status).toBe('approved');
    expect(patch.aiTags).toEqual([]);
    expect(patch.altText).toBeNull();
  });
});

// ---------------------------------------------------------------- fail closed

describe('evaluateLocalVideo() fails CLOSED and never deletes the source', () => {
  test('moderateFrames throwing PROPAGATES (never approves) and still purges the frames dir', async () => {
    wireFfmpegOk();
    cortex.moderateFrames.mockRejectedValue(
      Object.assign(new Error('router down'), { code: 'LLM_UNAVAILABLE' }));
    const mkdtemp = jest.spyOn(fsp, 'mkdtemp');

    await expect(
      pipeline.evaluateLocalVideo(LOCAL_PATH, { mode: 'enforce', riskThreshold: 70 }),
    ).rejects.toThrow(/router down/);
    expect(cortex.describeFrames).not.toHaveBeenCalled();

    const dir = await mkdtemp.mock.results[0].value;
    expect(fs.existsSync(dir)).toBe(false); // purged even on throw
  });

  test('the SOURCE localPath is NEVER rm-ed — only the mkdtemp frames dir is', async () => {
    wireFfmpegOk();
    cortex.moderateFrames.mockResolvedValue(CLEAN);
    cortex.describeFrames.mockResolvedValue(DESC);
    const mkdtemp = jest.spyOn(fsp, 'mkdtemp');
    // Wrap rm so it still purges for real, but record every path it was asked to remove.
    const realRm = fsp.rm.bind(fsp);
    const rm = jest.spyOn(fsp, 'rm').mockImplementation((p, opts) => realRm(p, opts));

    await pipeline.evaluateLocalVideo(LOCAL_PATH, { mode: 'enforce', riskThreshold: 70 });

    const framesDir = await mkdtemp.mock.results[0].value;
    const removed = rm.mock.calls.map(([p]) => p);
    expect(removed).toContain(framesDir);          // frames dir is cleaned up
    expect(removed).not.toContain(LOCAL_PATH);      // source recording is untouched
    rm.mockRestore();
  });

  test('a missing ffprobe binary is a TRANSIENT FFMPEG_UNAVAILABLE (never inspected -> never approved)', async () => {
    execFile.mockImplementation((bin, args, opts, cb) => {
      cb(Object.assign(new Error('spawn ffprobe ENOENT'), { code: 'ENOENT' }));
    });
    await expect(
      pipeline.evaluateLocalVideo(LOCAL_PATH, { mode: 'enforce', riskThreshold: 70 }),
    ).rejects.toMatchObject({ code: 'FFMPEG_UNAVAILABLE' });
    expect(cortex.moderateFrames).not.toHaveBeenCalled();
  });

  test('an undecodable recording is terminal UNSUPPORTED_VIDEO', async () => {
    execFile.mockImplementation((bin, args, opts, cb) => {
      cb(Object.assign(new Error('Invalid data'), { code: 1 }), '', 'moov atom not found');
    });
    await expect(
      pipeline.evaluateLocalVideo(LOCAL_PATH, { mode: 'enforce', riskThreshold: 70 }),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_VIDEO' });
  });
});
