const { shouldProcess, shouldProcessDelete, uriFraction } = require('../src/ingest/postFilter');

function postEvent(over = {}) {
  return {
    kind: 'create',
    uri: 'at://did:plc:abc/app.bsky.feed.post/3kabc',
    did: 'did:plc:abc',
    collection: 'app.bsky.feed.post',
    rkey: '3kabc',
    cid: 'bafyrei...',
    record: { text: 'hello world' },
    ...over,
  };
}

describe('postFilter.shouldProcess', () => {
  test('accepts a create of app.bsky.feed.post with text', () => {
    expect(shouldProcess(postEvent())).toBe(true);
  });

  test('rejects deletes and non-post collections', () => {
    expect(shouldProcess(postEvent({ kind: 'delete' }))).toBe(false);
    expect(shouldProcess(postEvent({ collection: 'app.bsky.feed.like' }))).toBe(false);
  });

  test('rejects empty/whitespace or missing text', () => {
    expect(shouldProcess(postEvent({ record: { text: '   ' } }))).toBe(false);
    expect(shouldProcess(postEvent({ record: {} }))).toBe(false);
    expect(shouldProcess(postEvent({ record: null }))).toBe(false);
  });

  test('shouldProcessDelete accepts deletes of wanted collections (no text needed)', () => {
    expect(shouldProcessDelete(postEvent({ kind: 'delete', record: null }))).toBe(true);
    expect(shouldProcessDelete(postEvent({ kind: 'create' }))).toBe(false);
    expect(shouldProcessDelete(postEvent({ kind: 'delete', collection: 'app.bsky.feed.like' }))).toBe(false);
  });

  test('uriFraction is deterministic and in [0,1)', () => {
    const a = uriFraction('at://x/y/z');
    const b = uriFraction('at://x/y/z');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });
});
