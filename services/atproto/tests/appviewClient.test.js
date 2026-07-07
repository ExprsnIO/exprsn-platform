const { getPost, getProfileDescription } = require('../src/ingest/appviewClient');

function mockFetch(json, ok = true) {
  return async () => ({ ok, status: ok ? 200 : 404, text: async () => JSON.stringify(json) });
}

/** A response whose body streams forever — only a byte cap can stop it. */
function endlessStreamFetch(chunkBytes = 64 * 1024) {
  const chunk = new Uint8Array(chunkBytes);
  return async () => ({
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() { return { done: false, value: chunk }; },
          async cancel() {},
        };
      },
    },
  });
}

describe('appviewClient.getPost', () => {
  test('extracts text, image and author from a getPosts response', async () => {
    const post = await getPost('at://did:plc:x/app.bsky.feed.post/1', {
      fetchImpl: mockFetch({
        posts: [
          {
            author: { did: 'did:plc:x' },
            record: { text: 'hello' },
            embed: { images: [{ fullsize: 'https://cdn/img.jpg' }] },
          },
        ],
      }),
    });
    expect(post).toEqual({ text: 'hello', image: 'https://cdn/img.jpg', authorDid: 'did:plc:x' });
  });

  test('returns null on empty/missing posts', async () => {
    expect(await getPost('at://x/y/z', { fetchImpl: mockFetch({ posts: [] }) })).toBeNull();
  });

  test('returns null on non-2xx', async () => {
    expect(await getPost('at://x/y/z', { fetchImpl: mockFetch({}, false) })).toBeNull();
  });

  test('oversized response is capped and treated as unavailable (no unbounded buffering)', async () => {
    await expect(
      getPost('at://x/y/z', { fetchImpl: endlessStreamFetch(), maxBytes: 2048 })
    ).resolves.toBeNull();
  });
});

describe('appviewClient.getProfileDescription', () => {
  test('extracts the description', async () => {
    expect(
      await getProfileDescription('did:plc:x', { fetchImpl: mockFetch({ description: 'hi' }) })
    ).toBe('hi');
  });

  test('oversized response is capped and treated as unavailable', async () => {
    await expect(
      getProfileDescription('did:plc:x', { fetchImpl: endlessStreamFetch(), maxBytes: 2048 })
    ).resolves.toBeNull();
  });
});
