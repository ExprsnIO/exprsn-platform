/**
 * did:exprsn self-certifying method: a label signed under a did:exprsn issuer
 * must verify offline (resolve the key from the DID itself, no network). This is
 * the ingest⇄outgest round-trip for the Exprsn-native label mesh.
 */

const didResolver = require('../src/identity/didResolver');

let signLabel;
let verifyInboundLabel;
let did;

beforeAll(async () => {
  const { generateKeypair, reset } = require('../src/labeler/keyManager');
  const kp = await generateKeypair();
  did = didResolver.didExprsnFromKey(kp.publicKeyMultibase);
  process.env.ATPROTO_SIGNING_KEY = kp.privateKeyHex;
  reset();
  ({ signLabel } = require('../src/labeler/labelSigner'));
  ({ verifyInboundLabel } = require('../src/labeler/labelVerifier'));
});

describe('did:exprsn', () => {
  test('didExprsnFromKey + parseDid + toDidKey are consistent', () => {
    const parsed = didResolver.parseDid(did);
    expect(parsed.method).toBe('exprsn');
    expect(did).toBe(`did:exprsn:${parsed.id}`);
    expect(didResolver.toDidKey(did)).toBe(`did:key:${parsed.id}`);
  });

  test('resolveDid derives a DID document offline with #atproto_label key', async () => {
    const { doc, publicKeyMultibase } = await didResolver.resolveDid(did);
    expect(doc.id).toBe(did);
    const vm = doc.verificationMethod.find((v) => v.id.endsWith('#atproto_label'));
    expect(vm.publicKeyMultibase).toBe(publicKeyMultibase);
    expect(doc.service.some((s) => s.type === 'AtprotoLabeler')).toBe(true);
  });

  test('a label signed by a did:exprsn issuer verifies on ingest', async () => {
    const label = {
      ver: 1,
      src: did,
      uri: 'at://did:exprsn:peer/app.bsky.feed.post/3abc',
      val: 'nsfw',
      cts: new Date('2026-06-23T00:00:00.000Z'),
    };
    const sig = await signLabel(label);
    const result = await verifyInboundLabel({ ...label, sig });
    expect(result.ok).toBe(true);
  });

  test('a tampered did:exprsn label fails ingest verification', async () => {
    const label = {
      ver: 1,
      src: did,
      uri: 'at://did:exprsn:peer/app.bsky.feed.post/3abc',
      val: 'nsfw',
      cts: new Date('2026-06-23T00:00:00.000Z'),
    };
    const sig = await signLabel(label);
    const result = await verifyInboundLabel({ ...label, val: 'spam', sig });
    expect(result.ok).toBe(false);
  });
});
