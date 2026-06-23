/**
 * Round-trips a label signature through @atproto/crypto. Requires the ESM
 * AT-Proto/IPLD deps to be installed (npm install at repo root). The signer
 * resolves its key from ATPROTO_SIGNING_KEY, which we generate in beforeAll.
 */

let signLabel;
let verifyLabelSig;
let didKey;

beforeAll(async () => {
  const { generateKeypair, reset } = require('../src/labeler/keyManager');
  const kp = await generateKeypair();
  didKey = kp.did;
  process.env.ATPROTO_SIGNING_KEY = kp.privateKeyHex;
  reset(); // force keyManager to reload from the env var we just set
  ({ signLabel, verifyLabelSig } = require('../src/labeler/labelSigner'));
});

describe('labelSigner', () => {
  test('signs and verifies a label', async () => {
    const label = {
      ver: 1,
      src: didKey,
      uri: 'at://did:plc:abc/app.bsky.feed.post/3kabc',
      val: 'spam',
      cts: new Date('2026-06-22T00:00:00.000Z'),
    };
    const sig = await signLabel(label);
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(await verifyLabelSig(didKey, label, sig)).toBe(true);
  });

  test('tampered label fails verification', async () => {
    const label = {
      ver: 1,
      src: didKey,
      uri: 'at://did:plc:abc/app.bsky.feed.post/3kabc',
      val: 'nsfw',
      cts: new Date('2026-06-22T00:00:00.000Z'),
    };
    const sig = await signLabel(label);
    const tampered = { ...label, val: 'spam' };
    expect(await verifyLabelSig(didKey, tampered, sig)).toBe(false);
  });
});
