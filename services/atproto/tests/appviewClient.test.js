const { getPost } = require('../src/ingest/appviewClient');

function mockFetch(json, ok = true) {
  return async () => ({ ok, status: ok ? 200 : 404, json: async () => json });
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
});
