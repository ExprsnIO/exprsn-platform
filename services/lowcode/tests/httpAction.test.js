'use strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const moduleActions = require('../src/services/moduleActions');

describe('http_request SSRF guard (via capability-gated run)', () => {
  const run = (url) => moduleActions.run('http_request', { url }, {}, ['call:http.request']);

  test('is registered with its capability', () => {
    expect(moduleActions.isModuleAction('http_request')).toBe(true);
    expect(moduleActions.requiredCapability('http_request')).toBe('call:http.request');
  });

  test('denied without the capability', async () => {
    const out = await moduleActions.run('http_request', { url: 'https://example.com' }, {}, []);
    expect(out.error).toMatch(/missing capability call:http.request/);
  });

  test('rejects non-http protocols and junk urls', async () => {
    expect((await run('ftp://example.com')).error).toMatch(/unsupported protocol/);
    expect((await run('file:///etc/passwd')).error).toMatch(/unsupported protocol/);
    expect((await run('not a url')).error).toMatch(/invalid url/);
  });

  test('rejects loopback/private hosts', async () => {
    expect((await run('http://localhost:8443/x')).error).toMatch(/private hostnames/);
    expect((await run('http://foo.local/x')).error).toMatch(/private hostnames/);
    expect((await run('http://127.0.0.1/x')).error).toMatch(/private\/loopback/);
    expect((await run('http://10.1.2.3/x')).error).toMatch(/private\/loopback/);
    expect((await run('http://192.168.1.1/x')).error).toMatch(/private\/loopback/);
    expect((await run('http://172.20.0.1/x')).error).toMatch(/private\/loopback/);
    expect((await run('http://169.254.169.254/latest/meta-data')).error).toMatch(/private\/loopback/); // cloud metadata
    expect((await run('http://[::1]/x')).error).toMatch(/private\/loopback/);
  });

  test('rejects unsupported methods', async () => {
    const out = await moduleActions.run('http_request', { url: 'https://example.com', method: 'TRACE' }, {}, ['call:http.request']);
    expect(out.error).toMatch(/unsupported method/);
  });
});
