'use strict';

// The shared package eagerly constructs Stripe from this; set a dummy so the
// module graph loads under jest (no .env is loaded in tests).
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.SERVICE_TOKEN_SECRET = process.env.SERVICE_TOKEN_SECRET || 'x'.repeat(48);

// Mock the scope resolver so dispatch needs no database.
jest.mock('../src/services/scopeResolver', () => ({ resolve: jest.fn() }));
const scopeResolver = require('../src/services/scopeResolver');
const pluginHost = require('../src/services/pluginHost');

describe('pluginHost — durability guarantees', () => {
  afterEach(() => jest.clearAllMocks());

  test('emit NEVER throws even when resolution rejects (contained)', async () => {
    process.env.PLUGINS_ENABLED = 'true';
    scopeResolver.resolve.mockRejectedValue(new Error('db is down'));
    await expect(pluginHost.emit('timeline.post.created', { module: 'timeline', post: {} })).resolves.toBeUndefined();
  });

  test('a throwing subscriber cannot break emit', async () => {
    process.env.PLUGINS_ENABLED = 'false'; // exercise the subscriber fan-out path only
    const unsub = pluginHost.subscribe(() => { throw new Error('subscriber boom'); });
    await expect(pluginHost.emit('lowcode.record.created', {})).resolves.toBeUndefined();
    unsub();
  });

  test('re-entrancy depth guard drops deep events', async () => {
    process.env.PLUGINS_ENABLED = 'true';
    scopeResolver.resolve.mockResolvedValue([]);
    await pluginHost.emit('timeline.post.created', { _pluginDepth: pluginHost.MAX_DEPTH + 1 });
    expect(scopeResolver.resolve).not.toHaveBeenCalled(); // guard tripped before resolving
  });

  test('with the flag OFF, dispatch does no resolution work (inert)', async () => {
    process.env.PLUGINS_ENABLED = 'false';
    scopeResolver.resolve.mockResolvedValue([]);
    await pluginHost.emit('timeline.post.created', { module: 'timeline' });
    expect(scopeResolver.resolve).not.toHaveBeenCalled();
  });
});
