const { PdsClient } = require('../src/identity/pdsClient');

function mockFetch(handler) {
  return async (url, opts) => {
    const { status = 200, json = {} } = handler(url, opts) || {};
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(json),
    };
  };
}

describe('PdsClient', () => {
  test('login posts createSession and stores the session', async () => {
    let seen = null;
    const pds = new PdsClient({
      url: 'https://pds.example/',
      fetchImpl: mockFetch((url, opts) => {
        seen = { url, body: JSON.parse(opts.body) };
        return { json: { did: 'did:plc:abc', handle: 'mod.example', accessJwt: 'jwt123' } };
      }),
    });
    const session = await pds.login('mod.example', 'pw');
    expect(seen.url).toBe('https://pds.example/xrpc/com.atproto.server.createSession');
    expect(seen.body).toEqual({ identifier: 'mod.example', password: 'pw' });
    expect(session.did).toBe('did:plc:abc');
  });

  test('putRecord sends the bearer token and record body', async () => {
    let headers;
    let body;
    const pds = new PdsClient({
      url: 'https://pds.example',
      fetchImpl: mockFetch((url, opts) => {
        headers = opts.headers;
        body = JSON.parse(opts.body);
        return { json: { uri: 'at://did:plc:abc/app.bsky.labeler.service/self', cid: 'bafy' } };
      }),
    });
    pds.session = { accessJwt: 'jwt123' };
    const res = await pds.putRecord({
      repo: 'did:plc:abc',
      collection: 'app.bsky.labeler.service',
      rkey: 'self',
      record: { $type: 'app.bsky.labeler.service' },
    });
    expect(headers.authorization).toBe('Bearer jwt123');
    expect(body.collection).toBe('app.bsky.labeler.service');
    expect(res.cid).toBe('bafy');
  });

  test('non-2xx surfaces the XRPC error message', async () => {
    const pds = new PdsClient({
      url: 'https://pds.example',
      fetchImpl: mockFetch(() => ({ status: 401, json: { error: 'AuthRequired', message: 'bad creds' } })),
    });
    await expect(pds.login('x', 'y')).rejects.toThrow('bad creds');
  });
});
