'use strict';

const { validateManifest, validateConfig, isPrivateOrLoopback } = require('../src/services/manifestValidator');

const base = {
  key: 'demo-plugin',
  name: 'Demo',
  version: '1.0.0',
  kind: 'declarative',
  appliesTo: ['timeline'],
  events: ['timeline.post.created'],
  capabilities: ['read:timeline.posts', 'emit:notifications'],
  behavior: { match: { field: 'post.content', op: 'exists' }, actions: [{ type: 'log' }] },
};

describe('manifestValidator', () => {
  test('accepts a valid declarative manifest', () => {
    expect(validateManifest(base)).toMatchObject({ valid: true });
  });

  test('rejects unknown capability (the core trust control)', () => {
    const r = validateManifest({ ...base, capabilities: ['read:timeline.posts', 'pwn:everything'] });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/unknown capabilities/);
  });

  test('rejects unknown event and unknown surface', () => {
    const r = validateManifest({ ...base, events: ['nope.event'], appliesTo: ['nosuch'] });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/unknown events/);
    expect(r.errors.join(' ')).toMatch(/unknown appliesTo/);
  });

  test('rejects bad semver', () => {
    expect(validateManifest({ ...base, version: 'not-semver' }).valid).toBe(false);
  });

  test('webhook requires endpoint + call:webhook + blocks SSRF', () => {
    const wh = { ...base, kind: 'webhook', behavior: undefined, capabilities: ['read:timeline.posts'] };
    expect(validateManifest(wh).valid).toBe(false); // missing endpoint + call:webhook
    const wh2 = { ...wh, capabilities: ['read:timeline.posts', 'call:webhook'], endpoint: { url: 'http://127.0.0.1/hook' } };
    expect(validateManifest(wh2).errors.join(' ')).toMatch(/private\/loopback/);
    const wh3 = { ...wh2, endpoint: { url: 'https://hooks.example.com/h' } };
    expect(validateManifest(wh3).valid).toBe(true);
  });

  test('internal kind is rejected in MVP', () => {
    expect(validateManifest({ ...base, kind: 'internal', behavior: undefined }).valid).toBe(false);
  });

  test('script kind requires source and rejects banned tokens', () => {
    const ok = { ...base, kind: 'script', behavior: undefined, script: { source: 'return { x: 1 };' } };
    expect(validateManifest(ok).valid).toBe(true);
    const bad = { ...ok, script: { source: 'require("fs")' } };
    expect(validateManifest(bad).valid).toBe(false);
  });

  test('validateConfig honours the manifest configSchema', () => {
    const m = { configSchema: { type: 'object', required: ['threshold'], properties: { threshold: { type: 'number' } } } };
    expect(validateConfig(m, { threshold: 5 }).valid).toBe(true);
    expect(validateConfig(m, {}).valid).toBe(false);
  });

  test('isPrivateOrLoopback covers the obvious ranges', () => {
    ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', 'localhost'].forEach((h) =>
      expect(isPrivateOrLoopback(h)).toBe(true));
    expect(isPrivateOrLoopback('hooks.example.com')).toBe(false);
  });
});
