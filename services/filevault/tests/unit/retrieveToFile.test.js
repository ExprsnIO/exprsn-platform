'use strict';

/**
 * TASK-040 — streaming file-retrieval accessor.
 *
 * `retrieveToFile(key, backend, destPath)` must stream a stored object to a
 * local file WITHOUT reading it into a whole Buffer (OOM guard for large video,
 * a prerequisite for FEAT-073 video moderation). These are behavioral tests:
 * we prove a multi-MB object round-trips byte-for-byte through the streaming
 * path, exercise the S3 stream path with a fake SDK stream, and confirm the
 * disk backend rejects a path-traversal key.
 */

const os = require('os');
const path = require('path');
const fsp = require('fs').promises;
const crypto = require('crypto');
const { Readable } = require('stream');

// The storage backends declare heavy optional SDKs at require-time that are not
// installed in the test environment (and aren't needed for the streaming path).
// Stub them so the modules load; the S3 test injects its own fake s3 client.
jest.mock('aws-sdk', () => ({ S3: class {} }), { virtual: true });
jest.mock('axios', () => ({ post: jest.fn() }), { virtual: true });
jest.mock('form-data', () => class FormData {}, { virtual: true });
jest.mock('dotenv', () => ({ config: jest.fn() }), { virtual: true });

// Keep winston off the filesystem/console during tests.
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const DiskBackend = require('../../src/storage/backends/disk');
const S3Backend = require('../../src/storage/backends/s3');
const storageManager = require('../../src/storage');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

let tmpRoot;

beforeEach(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'fv-r2f-'));
});

afterEach(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

describe('DiskBackend.retrieveToFile', () => {
  async function makeDiskBackend() {
    const storagePath = path.join(tmpRoot, 'store');
    const backend = new DiskBackend({ storagePath });
    await backend.initialize();
    return backend;
  }

  test('streams a multi-MB object to disk byte-for-byte', async () => {
    const backend = await makeDiskBackend();

    // ~8MB of random bytes — large enough that "read the whole thing into a
    // Buffer" is exactly what we are avoiding, small enough to keep the test fast.
    const payload = crypto.randomBytes(8 * 1024 * 1024);
    const { key } = await backend.store({ buffer: payload, originalname: 'big.bin' });

    const dest = path.join(tmpRoot, 'out', 'big.bin');
    await fsp.mkdir(path.dirname(dest), { recursive: true });

    const result = await backend.retrieveToFile(key, dest);

    expect(result.path).toBe(path.resolve(dest));
    expect(result.bytesWritten).toBe(payload.length);

    const written = await fsp.readFile(dest);
    expect(written.length).toBe(payload.length);
    expect(sha256(written)).toBe(sha256(payload));
  });

  test('rejects a key that resolves outside the storage root', async () => {
    const backend = await makeDiskBackend();
    const dest = path.join(tmpRoot, 'escape.bin');

    await expect(
      backend.retrieveToFile('../../../../etc/passwd', dest)
    ).rejects.toThrow(/escapes storage root/);
  });

  test('requires a destination path', async () => {
    const backend = await makeDiskBackend();
    await expect(backend.retrieveToFile('somekey', '')).rejects.toThrow(/destination path/);
  });

  test('does not disturb the existing buffer-returning retrieve()', async () => {
    const backend = await makeDiskBackend();
    const payload = Buffer.from('hello world');
    const { key } = await backend.store({ buffer: payload, originalname: 'x.txt' });

    const buf = await backend.retrieve(key);
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.equals(payload)).toBe(true);
  });
});

describe('S3Backend.retrieveToFile', () => {
  test('streams the SDK read-stream to disk (never buffers via .promise())', async () => {
    const payload = crypto.randomBytes(3 * 1024 * 1024);

    const backend = new S3Backend({ bucket: 'test-bucket' });
    backend.initialized = true;

    const getObject = jest.fn(() => ({
      // The streaming path must use createReadStream(), not promise().
      createReadStream: () => Readable.from(payload),
      promise: () => {
        throw new Error('retrieveToFile must not buffer via getObject().promise()');
      },
    }));
    backend.s3 = { getObject };

    const dest = path.join(tmpRoot, 's3-out.bin');
    const result = await backend.retrieveToFile('obj/key', dest);

    expect(getObject).toHaveBeenCalledWith({ Bucket: 'test-bucket', Key: 'obj/key' });
    expect(result.bytesWritten).toBe(payload.length);

    const written = await fsp.readFile(dest);
    expect(sha256(written)).toBe(sha256(payload));
  });
});

describe('StorageManager.retrieveToFile', () => {
  test('delegates to the selected backend', async () => {
    const fakeBackend = {
      retrieveToFile: jest.fn(async () => ({ path: '/dest', bytesWritten: 42 })),
    };
    storageManager.initialized = true;
    storageManager.backends.set('fake', fakeBackend);

    const out = await storageManager.retrieveToFile('k', 'fake', '/dest');

    expect(fakeBackend.retrieveToFile).toHaveBeenCalledWith('k', '/dest');
    expect(out).toEqual({ path: '/dest', bytesWritten: 42 });

    storageManager.backends.delete('fake');
  });

  test('throws if the backend cannot stream', async () => {
    storageManager.initialized = true;
    storageManager.backends.set('legacy', { retrieve: jest.fn() });

    await expect(
      storageManager.retrieveToFile('k', 'legacy', '/dest')
    ).rejects.toThrow(/does not support streaming retrieval/);

    storageManager.backends.delete('legacy');
  });
});
