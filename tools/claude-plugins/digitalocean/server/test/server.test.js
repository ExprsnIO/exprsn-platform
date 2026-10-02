'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../index');
const { DOClient } = require('../client');

// --- fake DigitalOcean API ---------------------------------------------------

function fakeApi(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const key = `${init.method} ${u.pathname}`;
    calls.push({ key, url: u, init, body: init.body ? JSON.parse(init.body) : undefined });
    const handler = routes[key];
    const [status, body, headers = {}] = handler ? handler(u, calls.length) : [404, { id: 'not_found', message: 'nope' }];
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: (h) => headers[h.toLowerCase()] ?? null },
      text: async () => (body === undefined ? '' : JSON.stringify(body)),
    };
  };
  return { fetchImpl, calls };
}

const DROPLET = {
  id: 42, name: 'web-1', status: 'active', size_slug: 's-1vcpu-1gb', tags: ['exprsn'],
  region: { slug: 'nyc3' }, image: { slug: 'ubuntu-24-04-x64' },
  networks: { v4: [{ type: 'public', ip_address: '203.0.113.9' }, { type: 'private', ip_address: '10.0.0.2' }] },
};
const PROTECTED = { ...DROPLET, id: 7, name: 'db-prod', tags: ['protected'] };

const baseRoutes = {
  'GET /v2/droplets/42': () => [200, { droplet: DROPLET }],
  'GET /v2/droplets/7': () => [200, { droplet: PROTECTED }],
  'DELETE /v2/droplets/42': () => [204],
  'POST /v2/droplets/42/actions': () => [201, { action: { id: 99, status: 'in-progress', type: 'reboot' } }],
  'POST /v2/droplets/7/actions': () => [201, { action: { id: 98, status: 'in-progress', type: 'reboot' } }],
  'POST /v2/droplets': () => [202, { droplet: { ...DROPLET, id: 43, name: 'new-1' }, links: { actions: [{ id: 500 }] } }],
};

function setup(env = {}, routes = baseRoutes) {
  const api = fakeApi(routes);
  const server = createServer({
    env: { DIGITALOCEAN_TOKEN: 'test-token', ...env },
    fetchImpl: api.fetchImpl,
    sleep: async () => {},
    write: () => {},
  });
  const call = async (name, args) => {
    const res = await server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } });
    const text = res.content[0].text;
    return { isError: Boolean(res.isError), text, json: res.isError ? null : JSON.parse(text) };
  };
  return { server, call, calls: api.calls };
}

// --- protocol ---------------------------------------------------------------

test('initialize negotiates protocol and reports tools capability', async () => {
  const { server } = setup();
  const res = await server.handle({ id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
  assert.equal(res.protocolVersion, '2025-03-26');
  assert.ok(res.capabilities.tools);
  assert.match(res.instructions, /read-only/);
});

test('onLine answers parse errors and unknown methods, ignores notifications', async () => {
  const out = [];
  const server = createServer({ env: {}, write: (m) => out.push(m) });
  await server.onLine('{not json');
  await server.onLine(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
  await server.onLine(JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'bogus' }));
  assert.equal(out.length, 2);
  assert.equal(out[0].error.code, -32700);
  assert.equal(out[1].id, 5);
  assert.equal(out[1].error.code, -32601);
});

test('tools/list hides write and destroy tools by mode', async () => {
  const names = async (mode) => (await setup({ DO_MCP_MODE: mode }).server.handle({ id: 1, method: 'tools/list' }))
    .tools.map((t) => t.name);
  const ro = await names('read-only');
  const rw = await names('read-write');
  const full = await names('full');
  assert.ok(ro.includes('do_list_droplets') && ro.includes('do_api_request'));
  assert.ok(!ro.includes('do_create_droplet') && !ro.includes('do_delete_droplet'));
  assert.ok(rw.includes('do_create_droplet') && !rw.includes('do_delete_droplet'));
  assert.ok(full.includes('do_delete_droplet'));
});

test('invalid mode falls back to read-only', () => {
  assert.equal(setup({ DO_MCP_MODE: 'yolo' }).server.policy.mode, 'read-only');
});

// --- reads ------------------------------------------------------------------

test('list tools paginate and project compact summaries', async () => {
  const routes = {
    'GET /v2/droplets': (u) => (u.searchParams.get('page') === '2'
      ? [200, { droplets: [PROTECTED], meta: { total: 2 }, links: {} }]
      : [200, { droplets: [DROPLET], meta: { total: 2 }, links: { pages: { next: 'https://api.digitalocean.com/v2/droplets?page=2&per_page=200' } } }]),
  };
  const { call, calls } = setup({}, routes);
  const { json } = await call('do_list_droplets', { tag_name: 'exprsn' });
  assert.equal(json.returned, 2);
  assert.equal(json.truncated, false);
  assert.deepEqual(json.droplets[0], {
    id: 42, name: 'web-1', status: 'active', region: 'nyc3', size: 's-1vcpu-1gb', image: 'ubuntu-24-04-x64',
    public_ipv4: '203.0.113.9', private_ipv4: '10.0.0.2', tags: ['exprsn'],
  });
  assert.equal(calls[0].url.searchParams.get('tag_name'), 'exprsn');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer test-token');
});

test('missing token yields a clear tool error, not a crash', async () => {
  const server = createServer({ env: {}, write: () => {} });
  const res = await server.handle({ id: 1, method: 'tools/call', params: { name: 'do_list_regions', arguments: {} } });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /DIGITALOCEAN_TOKEN is not set/);
});

test('API errors surface status and message without leaking the token', async () => {
  const { call } = setup({}, { 'GET /v2/regions': () => [401, { id: 'unauthorized', message: 'Unable to authenticate you' }] });
  const res = await call('do_list_regions', {});
  assert.equal(res.isError, true);
  assert.match(res.text, /HTTP 401 — unauthorized Unable to authenticate you/);
  assert.doesNotMatch(res.text, /test-token/);
});

test('429 is retried honouring Retry-After', async () => {
  const routes = {
    'GET /v2/account': (_u, n) => (n === 1 ? [429, { id: 'too_many_requests' }, { 'retry-after': '1' }] : [200, { account: { email: 'a@b.c' } }]),
    'GET /v2/customers/my/balance': () => [200, { month_to_date_balance: '1.00' }],
  };
  const { call, calls } = setup({}, routes);
  const { json } = await call('do_account', {});
  assert.equal(json.account.email, 'a@b.c');
  assert.equal(json.server.mode, 'read-only');
  assert.equal(calls.filter((c) => c.key === 'GET /v2/account').length, 2);
});

test('do_wait_for_action polls until completed', async () => {
  const routes = { 'GET /v2/actions/99': (_u, n) => [200, { action: { id: 99, status: n < 3 ? 'in-progress' : 'completed' } }] };
  const { call, calls } = setup({}, routes);
  const { json } = await call('do_wait_for_action', { action_id: 99 });
  assert.equal(json.done, true);
  assert.equal(calls.length, 3);
});

// --- policy -----------------------------------------------------------------

test('read-only mode refuses writes even if called directly', async () => {
  const { call, calls } = setup();
  const res = await call('do_create_droplet', { name: 'x', region: 'nyc3', size: 's', image: 'i' });
  assert.equal(res.isError, true);
  assert.match(res.text, /DO_MCP_MODE=read-write/);
  assert.equal(calls.length, 0);
});

test('create droplet dry_run sends nothing; real call returns action ids', async () => {
  const { call, calls } = setup({ DO_MCP_MODE: 'read-write' });
  const dry = await call('do_create_droplet', { name: 'new-1', region: 'nyc3', size: 's-1vcpu-1gb', image: '12345', dry_run: true });
  assert.equal(dry.json.dry_run, true);
  assert.equal(dry.json.would_send.body.image, 12345);
  assert.equal(dry.json.would_send.body.monitoring, true);
  assert.equal(calls.length, 0);
  const real = await call('do_create_droplet', { name: 'new-1', region: 'nyc3', size: 's-1vcpu-1gb', image: 'ubuntu-24-04-x64' });
  assert.deepEqual(real.json.action_ids, [500]);
});

test('delete requires full mode, exact confirm, and respects protected tag', async () => {
  let { call, calls } = setup({ DO_MCP_MODE: 'read-write' });
  assert.match((await call('do_delete_droplet', { droplet_id: 42, confirm: 'web-1' })).text, /DO_MCP_MODE=full/);

  ({ call, calls } = setup({ DO_MCP_MODE: 'full' }));
  const wrong = await call('do_delete_droplet', { droplet_id: 42, confirm: 'web-2' });
  assert.match(wrong.text, /confirm="web-1"/);
  assert.ok(!calls.some((c) => c.key.startsWith('DELETE')));

  const prot = await call('do_delete_droplet', { droplet_id: 7, confirm: 'db-prod' });
  assert.match(prot.text, /"protected" tag/);

  const ok = await call('do_delete_droplet', { droplet_id: 42, confirm: 'web-1' });
  assert.equal(ok.json.deleted, true);
  assert.ok(calls.some((c) => c.key === 'DELETE /v2/droplets/42'));
});

test('droplet actions: reboot blocked on protected droplet, rebuild needs full + confirm', async () => {
  const rw = setup({ DO_MCP_MODE: 'read-write' });
  assert.match((await rw.call('do_droplet_action', { droplet_id: 7, type: 'reboot' })).text, /protected/);
  assert.equal((await rw.call('do_droplet_action', { droplet_id: 42, type: 'reboot' })).json.action.id, 99);
  assert.match((await rw.call('do_droplet_action', { droplet_id: 42, type: 'rebuild' })).text, /DO_MCP_MODE=full/);

  const full = setup({ DO_MCP_MODE: 'full' });
  assert.match((await full.call('do_droplet_action', { droplet_id: 42, type: 'rebuild' })).text, /confirm="web-1"/);
});

test('protected tag can be disabled with an empty DO_MCP_PROTECTED_TAG', async () => {
  const { call } = setup({ DO_MCP_MODE: 'read-write', DO_MCP_PROTECTED_TAG: '' });
  assert.equal((await call('do_droplet_action', { droplet_id: 7, type: 'reboot' })).isError, false);
});

test('do_api_request: level follows method; DELETE needs confirm=path; path is sandboxed', async () => {
  const routes = { 'GET /v2/vpcs': () => [200, { vpcs: [] }], 'DELETE /v2/vpcs/abc': () => [204] };
  const ro = setup({}, routes);
  assert.equal((await ro.call('do_api_request', { method: 'GET', path: '/vpcs' })).json.status, 200);
  assert.match((await ro.call('do_api_request', { method: 'POST', path: '/vpcs', body: {} })).text, /read-write/);
  assert.match((await ro.call('do_api_request', { method: 'GET', path: '/../x' })).text, /relative to \/v2/);

  const full = setup({ DO_MCP_MODE: 'full' }, routes);
  assert.match((await full.call('do_api_request', { method: 'DELETE', path: '/vpcs/abc' })).text, /confirm="\/vpcs\/abc"/);
  assert.equal((await full.call('do_api_request', { method: 'DELETE', path: '/vpcs/abc', confirm: '/vpcs/abc' })).json.status, 204);
});

test('client refuses to send the token to a foreign origin', () => {
  const c = new DOClient({ token: 't' });
  assert.throws(() => c.buildUrl('https://evil.example/v2/droplets'), /foreign origin/);
  assert.equal(c.buildUrl('/v2/droplets').toString(), 'https://api.digitalocean.com/v2/droplets');
});
