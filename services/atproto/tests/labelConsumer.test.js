const { toWsUrl, resolveEntry, SUBSCRIBE_PATH } = require('../src/ingest/labelConsumer');

describe('labelConsumer URL resolution', () => {
  test('toWsUrl normalizes hosts/schemes and appends the subscribeLabels path', () => {
    expect(toWsUrl('https://mod.bsky.app')).toBe(`wss://mod.bsky.app${SUBSCRIBE_PATH}`);
    expect(toWsUrl('mod.bsky.app')).toBe(`wss://mod.bsky.app${SUBSCRIBE_PATH}`);
    expect(toWsUrl('http://localhost:8443/')).toBe(`ws://localhost:8443${SUBSCRIBE_PATH}`);
    // already a full ws subscribeLabels URL → unchanged
    expect(toWsUrl(`wss://x.io${SUBSCRIBE_PATH}`)).toBe(`wss://x.io${SUBSCRIBE_PATH}`);
  });

  test('resolveEntry resolves a did:exprsn to its labeler endpoint (offline)', async () => {
    const didResolver = require('../src/identity/didResolver');
    const { generateKeypair } = require('../src/labeler/keyManager');
    const { publicKeyMultibase } = await generateKeypair();
    const did = didResolver.didExprsnFromKey(publicKeyMultibase);

    const resolved = await resolveEntry(did);
    expect(resolved.did).toBe(did);
    expect(resolved.wsUrl).toMatch(/^wss:\/\/.+\/xrpc\/com\.atproto\.label\.subscribeLabels$/);
  });

  test('resolveEntry passes through a raw wss URL', async () => {
    const resolved = await resolveEntry(`wss://peer.exprsn.io${SUBSCRIBE_PATH}`);
    expect(resolved.did).toBeNull();
    expect(resolved.wsUrl).toBe(`wss://peer.exprsn.io${SUBSCRIBE_PATH}`);
  });
});
