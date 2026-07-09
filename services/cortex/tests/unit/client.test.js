'use strict';

/**
 * FEAT-023 / ADR 0001 — the public in-process façade.
 *
 * The two invariants under test are the ones the whole design rests on:
 *  1. CORTEX_ENABLED=false means NO router traffic and NO engine require.
 *  2. The façade never reaches cortex's flow layer (engine/jobs.js), which is
 *     what makes the moderator→cortex→moderator cycle structurally impossible.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const path = require('path');

const CLIENT = '../../src/client';
const AGENT = '../../src/engine/agent';

function withEnv(env, fn) {
  const prev = { ...process.env };
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    process.env = prev;
  }
}

describe('cortex client — fail-closed CORTEX_ENABLED gate', () => {
  test('complete() throws CortexDisabledError and never requires the engine', async () => {
    await withEnv({ CORTEX_ENABLED: 'false' }, async () => {
      await jest.isolateModulesAsync(async () => {
        const agentPath = require.resolve(path.join(__dirname, AGENT));
        const client = require(CLIENT);

        await expect(client.complete('sys', 'usr')).rejects.toMatchObject({
          name: 'CortexDisabledError',
          code: 'CORTEX_DISABLED',
        });

        // The lazy require sits behind the guard: with the flag off the
        // inference layer is never even pulled into the module graph, so it
        // cannot have emitted a request to the llama router.
        expect(require.cache[agentPath]).toBeUndefined();
      });
    });
  });

  test('judge() is gated the same way', async () => {
    await withEnv({ CORTEX_ENABLED: 'false' }, async () => {
      await jest.isolateModulesAsync(async () => {
        const client = require(CLIENT);
        await expect(client.judge('p', 't')).rejects.toMatchObject({ code: 'CORTEX_DISABLED' });
      });
    });
  });

  test('health() reports disabled without probing the router', async () => {
    await withEnv({ CORTEX_ENABLED: 'false' }, async () => {
      await jest.isolateModulesAsync(async () => {
        const client = require(CLIENT);
        await expect(client.health()).resolves.toEqual({ enabled: false, up: false });
      });
    });
  });

  test('isEnabled() mirrors the flag', async () => {
    await withEnv({ CORTEX_ENABLED: 'false' }, async () => {
      await jest.isolateModulesAsync(async () => {
        expect(require(CLIENT).isEnabled()).toBe(false);
      });
    });
    await withEnv({ CORTEX_ENABLED: 'true' }, async () => {
      await jest.isolateModulesAsync(async () => {
        expect(require(CLIENT).isEnabled()).toBe(true);
      });
    });
  });
});

describe('cortex client — enabled path', () => {
  test('complete() delegates to the inference layer and bounds latency', async () => {
    await withEnv({ CORTEX_ENABLED: 'true' }, async () => {
      await jest.isolateModulesAsync(async () => {
        jest.doMock(AGENT, () => ({
          simpleChat: jest.fn(async () => 'hello'),
          judge: jest.fn(async () => 'PASS'),
        }));
        const client = require(CLIENT);
        await expect(client.complete('sys', 'usr', { timeoutMs: 1000 })).resolves.toBe('hello');
        expect(require(AGENT).simpleChat).toHaveBeenCalledWith('sys', 'usr',
          expect.objectContaining({ temperature: 0.3 }));
      });
    });
  });

  test('a slow completion surfaces as CortexUnavailableError, not a hang', async () => {
    await withEnv({ CORTEX_ENABLED: 'true' }, async () => {
      await jest.isolateModulesAsync(async () => {
        jest.doMock(AGENT, () => ({
          simpleChat: () => new Promise((resolve) => setTimeout(() => resolve('too late'), 5000)),
          judge: jest.fn(),
        }));
        const client = require(CLIENT);
        await expect(client.complete('s', 'u', { timeoutMs: 30 })).rejects.toMatchObject({
          name: 'CortexUnavailableError',
          code: 'LLM_UNAVAILABLE',
        });
      });
    });
  });

  test('router failures are normalized to CortexUnavailableError', async () => {
    await withEnv({ CORTEX_ENABLED: 'true' }, async () => {
      await jest.isolateModulesAsync(async () => {
        jest.doMock(AGENT, () => ({
          simpleChat: jest.fn(async () => { throw new Error('ECONNREFUSED'); }),
          judge: jest.fn(),
        }));
        const client = require(CLIENT);
        await expect(client.complete('s', 'u')).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' });
      });
    });
  });
});

describe('cortex client — no path to the flow layer (cycle proof)', () => {
  test('requiring the client never loads engine/jobs.js, models, or queues', async () => {
    await withEnv({ CORTEX_ENABLED: 'true' }, async () => {
      await jest.isolateModulesAsync(async () => {
        require(CLIENT);
        const loaded = Object.keys(require.cache);
        // jobs.js is where moderatorScreen() lives; models/queues open DB/Redis.
        expect(loaded.some((p) => p.endsWith(`${path.sep}engine${path.sep}jobs.js`))).toBe(false);
        expect(loaded.some((p) => p.endsWith(`${path.sep}cortex${path.sep}src${path.sep}models${path.sep}index.js`))).toBe(false);
        expect(loaded.some((p) => p.endsWith(`${path.sep}cortex${path.sep}src${path.sep}queues${path.sep}index.js`))).toBe(false);
      });
    });
  });
});
