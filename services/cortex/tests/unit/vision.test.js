'use strict';

/**
 * FEAT-030 / ADR 0002 — image normalization + the vision inference surface.
 * Real `sharp` (so decode/EXIF/bomb guards are genuinely exercised); the router
 * is mocked, so no model is loaded.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.CORTEX_ENABLED = 'true';
process.env.CORTEX_VISION_MODEL = 'test-vl';
// Poll fast: exercises the real waiting loop without jest fake timers, which
// would stall sharp's (real, non-timer) async decode work.
process.env.CORTEX_VISION_LOAD_POLL_MS = '5';
process.env.CORTEX_VISION_LOAD_WAIT_MS = '200';

const sharp = require('sharp');

jest.mock('../../src/lib/llama', () => ({
  chatComplete: jest.fn(),
  modelSupportsImages: jest.fn(async () => true),
  // default: the vision model is already resident
  listModels: jest.fn(async () => ({ data: [{ id: 'test-vl', status: { value: 'loaded' } }] })),
  loadModel: jest.fn(async () => ({})),
  routerHealth: jest.fn(),
}));

const llama = require('../../src/lib/llama');
const image = require('../../src/lib/image');
const vision = require('../../src/engine/vision');

const solid = (r, g, b, w = 64, h = 64) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r, g, b } } });

const reply = (obj, fenced = false) => ({
  choices: [{ message: { content: fenced ? '```json\n' + JSON.stringify(obj) + '\n```' : JSON.stringify(obj) } }],
});

const VERDICT = {
  nsfw_score: 5, violence_score: 0, hate_symbol_score: 0,
  self_harm_score: 0, overall_risk_score: 4, flags: ['none'], explanation: 'benign',
};

beforeEach(() => {
  jest.clearAllMocks();
  llama.modelSupportsImages.mockResolvedValue(true);
  llama.listModels.mockResolvedValue({ data: [{ id: 'test-vl', status: { value: 'loaded' } }] });
  llama.loadModel.mockResolvedValue({});
  vision.resetCapabilityCache();
});

// ---------------------------------------------------------------- normalize

describe('image normalization', () => {
  test('decodes png / jpeg / webp / gif to a single JPEG frame', async () => {
    for (const fmt of ['png', 'jpeg', 'webp', 'gif']) {
      const buf = await solid(10, 200, 90)[fmt]().toBuffer();
      const { frames, meta } = await image.normalize(buf);
      expect(meta.format).toBe(fmt);
      expect(frames).toHaveLength(1);
      expect((await sharp(frames[0]).metadata()).format).toBe('jpeg');
    }
  });

  test('downscales an oversized image to the configured max edge', async () => {
    const big = await solid(1, 2, 3, 3000, 1500).png().toBuffer();
    const { frames } = await image.normalize(big);
    const m = await sharp(frames[0]).metadata();
    expect(Math.max(m.width, m.height)).toBeLessThanOrEqual(1024);
  });

  test('does not enlarge a small image', async () => {
    const small = await solid(1, 2, 3, 32, 32).png().toBuffer();
    const { frames } = await image.normalize(small);
    const m = await sharp(frames[0]).metadata();
    expect(m.width).toBe(32);
  });

  test('strips EXIF/GPS from the frame it sends to the model', async () => {
    const withExif = await solid(9, 9, 9)
      .withMetadata({ exif: { IFD0: { Copyright: 'secret', Artist: 'me' } } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeTruthy();

    const { frames } = await image.normalize(withExif);
    expect((await sharp(frames[0]).metadata()).exif).toBeUndefined();
  });

  test('rejects a decompression bomb rather than decoding it', async () => {
    const prev = require('../../src/config').cortex.visionMaxPixels;
    require('../../src/config').cortex.visionMaxPixels = 16; // 4x4
    try {
      const buf = await solid(1, 1, 1, 64, 64).png().toBuffer();
      await expect(image.normalize(buf)).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE' });
    } finally {
      require('../../src/config').cortex.visionMaxPixels = prev;
    }
  });

  test('rejects empty and corrupt buffers as UNSUPPORTED_IMAGE, not a crash', async () => {
    await expect(image.normalize(Buffer.alloc(0))).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE' });
    await expect(image.normalize(Buffer.from('not an image at all'))).rejects.toMatchObject({
      code: 'UNSUPPORTED_IMAGE',
    });
  });

  // sharp cannot ENCODE an animated GIF from a flat canvas (animation comes from
  // input page metadata), so this is a hand-built 2-frame GIF89a.
  const ANIMATED_GIF = Buffer.from([
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
    0x01, 0x00, 0x01, 0x00, 0xf0, 0x00, 0x00, // 1x1, global colour table of 2
    0x00, 0x00, 0x00, 0xff, 0xff, 0xff, // black, white
    0x21, 0xff, 0x0b, 0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30,
    0x03, 0x01, 0x00, 0x00, 0x00, // NETSCAPE2.0 loop
    0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, // frame 1 GCE
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0x02, 0x02, 0x44, 0x01, 0x00, // pixel = colour 0
    0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00, // frame 2 GCE
    0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0x02, 0x02, 0x4c, 0x01, 0x00, // pixel = colour 1
    0x3b, // trailer
  ]);

  test('samples every frame of an animated GIF (frame 0 alone is a bypass)', async () => {
    expect((await sharp(ANIMATED_GIF, { pages: -1 }).metadata()).pages).toBe(2);

    const { frames, meta } = await image.normalize(ANIMATED_GIF);
    expect(meta.pages).toBe(2);
    expect(meta.sampled).toBe(2);
    expect(frames.length).toBe(2); // did NOT stop at frame 0
  });

  test('frame sampling spans first..last and is capped', () => {
    expect(image.frameIndices(1, 3)).toEqual([0]);
    expect(image.frameIndices(2, 3)).toEqual([0, 1]);
    expect(image.frameIndices(5, 3)).toEqual([0, 2, 4]); // first, middle, last
    expect(image.frameIndices(100, 3)).toEqual([0, 50, 99]);
    expect(image.frameIndices(100, 1)).toEqual([0]);
  });
});

// ---------------------------------------------------------------- capability

describe('vision capability preflight', () => {
  test('unset CORTEX_VISION_MODEL → VISION_UNAVAILABLE', async () => {
    const config = require('../../src/config');
    const prev = config.cortex.visionModel;
    config.cortex.visionModel = null;
    try {
      await expect(vision.assertVisionCapable()).rejects.toMatchObject({ code: 'VISION_UNAVAILABLE' });
    } finally {
      config.cortex.visionModel = prev;
    }
  });

  test('a text-only model is refused (mmproj not loaded)', async () => {
    llama.modelSupportsImages.mockResolvedValue(false);
    await expect(vision.assertVisionCapable()).rejects.toThrow(/does not accept image input/);
  });

  test('an unreachable router surfaces as VISION_UNAVAILABLE', async () => {
    llama.modelSupportsImages.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(vision.assertVisionCapable()).rejects.toMatchObject({ code: 'VISION_UNAVAILABLE' });
  });

  test('a positive preflight is memoized (one /models call, not one per image)', async () => {
    await vision.assertVisionCapable();
    await vision.assertVisionCapable();
    expect(llama.modelSupportsImages).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------- inference

describe('moderateImage (fails closed)', () => {
  const png = () => solid(3, 3, 3).png().toBuffer();

  test('parses a fenced JSON verdict (the VL model fences; the text brain does not)', async () => {
    llama.chatComplete.mockResolvedValue(reply(VERDICT, true));
    const r = await vision.moderateImage(await png());
    expect(r.provider).toBe('cortex');
    expect(r.riskScore).toBe(4);
    expect(r.nsfwScore).toBe(5);
    expect(r.imageMeta.format).toBe('png');
  });

  test('routes vision through its own concurrency pool with the vision timeout', async () => {
    llama.chatComplete.mockResolvedValue(reply(VERDICT));
    await vision.moderateImage(await png());
    const [, , , opts] = llama.chatComplete.mock.calls[0];
    expect(opts).toMatchObject({ pool: 'vision' });
    expect(opts.timeoutMs).toBeGreaterThan(60000);
  });

  test('THROWS when a score is missing rather than defaulting it to 0/safe', async () => {
    const partial = { ...VERDICT };
    delete partial.nsfw_score;
    llama.chatComplete.mockResolvedValue(reply(partial));
    await expect(vision.moderateImage(await png())).rejects.toThrow(/missing scores/);
  });

  test('THROWS on an unparseable verdict', async () => {
    llama.chatComplete.mockResolvedValue({ choices: [{ message: { content: 'I cannot help.' } }] });
    await expect(vision.moderateImage(await png())).rejects.toThrow(/no parseable JSON/);
  });

  test('clamps out-of-range scores instead of passing them through', async () => {
    llama.chatComplete.mockResolvedValue(reply({ ...VERDICT, overall_risk_score: 250, nsfw_score: -10 }));
    const r = await vision.moderateImage(await png());
    expect(r.riskScore).toBe(100);
    expect(r.nsfwScore).toBe(0);
  });

  test('never sends image bytes as a plain string prompt (content-parts only)', async () => {
    llama.chatComplete.mockResolvedValue(reply(VERDICT));
    await vision.moderateImage(await png());
    const [, messages] = llama.chatComplete.mock.calls[0];
    const user = messages.find((m) => m.role === 'user');
    expect(Array.isArray(user.content)).toBe(true);
    expect(user.content.filter((c) => c.type === 'image_url')).toHaveLength(1);
  });
});

// The bug this caught in real use: under MODELS_MAX=1 any text call evicts the
// VL model, and the router answers a mid-load request with an empty body instead
// of blocking — which looked like "the model wrote bad JSON".
describe('cold-swap handling (MODELS_MAX=1)', () => {
  const png = () => solid(3, 3, 3).png().toBuffer();

  test('loads the vision model when unloaded, and waits for residency before inferring', async () => {
    // /models/load is async: it 200s while the model is still "loading".
    llama.listModels
      .mockResolvedValueOnce({ data: [{ id: 'test-vl', status: { value: 'unloaded' } }] })
      .mockResolvedValueOnce({ data: [{ id: 'test-vl', status: { value: 'loading' } }] })
      .mockResolvedValue({ data: [{ id: 'test-vl', status: { value: 'loaded' } }] });
    llama.chatComplete.mockResolvedValue(reply(VERDICT));

    await vision.moderateImage(await png());

    expect(llama.loadModel).toHaveBeenCalledWith('test-vl');
    // the completion must not be sent until residency is confirmed
    expect(llama.loadModel.mock.invocationCallOrder[0])
      .toBeLessThan(llama.chatComplete.mock.invocationCallOrder[0]);
  });

  test('a refused load (another model loading) is treated as a race, not a failure', async () => {
    llama.listModels
      .mockResolvedValueOnce({ data: [{ id: 'test-vl', status: { value: 'unloaded' } }] })
      .mockResolvedValue({ data: [{ id: 'test-vl', status: { value: 'loaded' } }] });
    llama.loadModel.mockRejectedValue(new Error('another model is loading'));
    llama.chatComplete.mockResolvedValue(reply(VERDICT));

    await expect(vision.moderateImage(await png())).resolves.toMatchObject({ provider: 'cortex' });
  });

  test('an unregistered model is a clear config error', async () => {
    llama.listModels.mockResolvedValue({ data: [] });
    await expect(vision.ensureVisionResident('nope')).rejects.toThrow(/not registered with the router/);
  });

  test('does not reload a model that is already resident', async () => {
    llama.chatComplete.mockResolvedValue(reply(VERDICT));
    await vision.moderateImage(await png());
    expect(llama.loadModel).not.toHaveBeenCalled();
  });

  test('an empty completion is reported as VISION_UNAVAILABLE, not a parse error', async () => {
    llama.chatComplete.mockResolvedValue({ choices: [{ message: { content: '' } }] });
    await expect(vision.moderateImage(await png())).rejects.toMatchObject({ code: 'VISION_UNAVAILABLE' });
  });

  test('a truncated response names truncation rather than bad JSON', async () => {
    llama.chatComplete.mockResolvedValue({
      choices: [{ finish_reason: 'length', message: { content: '{"nsfw_score":1' } }],
    });
    await expect(vision.moderateImage(await png())).rejects.toThrow(/truncated/);
  });

  // The router refuses a concurrent POST /models/load while anything is loading,
  // which is precisely the text-job-swapping-in / image-job-arrives collision.
  test('waits out a "loading" status instead of racing a concurrent load', async () => {
    llama.listModels
      .mockResolvedValueOnce({ data: [{ id: 'test-vl', status: { value: 'loading' } }] })
      .mockResolvedValueOnce({ data: [{ id: 'test-vl', status: { value: 'loading' } }] })
      .mockResolvedValue({ data: [{ id: 'test-vl', status: { value: 'loaded' } }] });

    await expect(vision.ensureVisionResident('test-vl')).resolves.toBeUndefined();
    expect(llama.loadModel).not.toHaveBeenCalled(); // never nudged a loading model
  });

  test('gives up if a "loading" model never becomes resident', async () => {
    llama.listModels.mockResolvedValue({ data: [{ id: 'test-vl', status: { value: 'loading' } }] });
    await expect(vision.ensureVisionResident('test-vl')).rejects.toMatchObject({
      code: 'VISION_UNAVAILABLE',
    });
  });
});

describe('describeImage', () => {
  test('returns normalized tags + alt text', async () => {
    llama.chatComplete.mockResolvedValue(
      reply({ alt_text: 'A green square.', tags: ['Green', 'green', ' Square '], text_in_image: '' }, true),
    );
    const r = await vision.describeImage(await solid(0, 255, 0).png().toBuffer());
    expect(r.altText).toBe('A green square.');
    expect(r.tags).toEqual(['green', 'square']); // deduped + lowercased
  });

  test('throws on an unparseable description (caller decides to fail soft)', async () => {
    llama.chatComplete.mockResolvedValue({ choices: [{ message: { content: 'sorry' } }] });
    await expect(vision.describeImage(await solid(1, 1, 1).png().toBuffer())).rejects.toThrow(/no parseable JSON/);
  });
});

// ---------------------------------------------------------------- privacy

describe('image bytes never reach telemetry (ADR 0002 §4)', () => {
  test('the vision engine does not import the flow layer or call the prompt log', () => {
    const src = require('fs').readFileSync(require.resolve('../../src/engine/vision.js'), 'utf8');
    // Strip comments — the file legitimately *discusses* logPrompt/jobs.js in
    // its header; what matters is that no code requires or calls them.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/logPrompt/);
    expect(code).not.toMatch(/require\(['"].*engine\/jobs/);
    expect(code).not.toMatch(/promptLog/);
  });

  test('requiring the vision engine never loads models/queues/jobs', () => {
    const path = require('path');
    const loaded = Object.keys(require.cache);
    expect(loaded.some((p) => p.endsWith(`${path.sep}engine${path.sep}jobs.js`))).toBe(false);
    expect(loaded.some((p) => p.endsWith(`${path.sep}cortex${path.sep}src${path.sep}models${path.sep}index.js`))).toBe(false);
  });
});
