'use strict';

/**
 * FEAT-072 / ADR 0005 — backend registry: role resolution, failover taxonomy,
 * circuit breaker, and the queue-only invariant. These are the safety-critical
 * behaviours the cost/benefit review called out as needing dedicated coverage.
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.CORTEX_ENABLED = 'true';
process.env.CORTEX_VISION_MODEL = 'primary-vl';

const { CircuitBreaker } = require('../../src/backends/breaker');
const {
  BackendUnavailableError, VisionUnavailableError, isUserFault, isAvailabilityError,
} = require('../../src/backends/errors');
// The SAME jobContext instance (one AsyncLocalStorage) must back both the test's
// runInJobContext wrapper and the registry — otherwise the isolated registry
// sees an empty store and every secondary call looks "outside a job".
const jobContext = require('../../src/backends/jobContext');
const { runInJobContext } = jobContext;

// ---------------------------------------------------------------- error taxonomy

describe('error taxonomy (ADR 0005 §3)', () => {
  test('UNSUPPORTED_IMAGE / UNSUPPORTED_VIDEO are user faults, never availability', () => {
    for (const code of ['UNSUPPORTED_IMAGE', 'UNSUPPORTED_VIDEO']) {
      const e = Object.assign(new Error('bad bytes'), { code });
      expect(isUserFault(e)).toBe(true);
      expect(isAvailabilityError(e)).toBe(false);
    }
  });

  test('transport / vision-config errors are availability (drive failover)', () => {
    expect(isAvailabilityError(new BackendUnavailableError('down'))).toBe(true);
    expect(isAvailabilityError(new VisionUnavailableError('text-only'))).toBe(true);
    expect(isAvailabilityError(Object.assign(new Error('x'), { code: 'LLM_UNAVAILABLE' }))).toBe(true);
  });

  test('an unknown error is NOT treated as availability (no silent failover)', () => {
    expect(isAvailabilityError(new Error('something weird'))).toBe(false);
    expect(isUserFault(new Error('something weird'))).toBe(false);
  });
});

// ---------------------------------------------------------------- breaker

describe('circuit breaker', () => {
  const cfg = { failures: 3, windowMs: 1000, cooldownMs: 100, cooldownMaxMs: 800 };
  let clock;
  const now = () => clock;

  beforeEach(() => { clock = 0; });

  test('opens after N consecutive failures, then skips until cooldown elapses', () => {
    const b = new CircuitBreaker('x', cfg, now);
    b.recordFailure(); b.recordFailure();
    expect(b.allowsAttempt()).toBe(true); // 2 < 3
    b.recordFailure(); // 3rd → OPEN
    expect(b.state).toBe('open');
    expect(b.allowsAttempt()).toBe(false);
    clock = 100; // cooldown elapsed
    expect(b.allowsAttempt()).toBe(true); // → HALF_OPEN
    expect(b.state).toBe('half_open');
  });

  test('a failed HALF_OPEN trial re-opens with a DOUBLED cooldown', () => {
    const b = new CircuitBreaker('x', cfg, now);
    b.recordFailure(); b.recordFailure(); b.recordFailure(); // OPEN, cooldown 100
    clock = 100; b.allowsAttempt(); // HALF_OPEN
    b.recordFailure(); // trial failed → re-OPEN at t=100 with cooldown doubled to 200
    expect(b.currentCooldown).toBe(200);
    clock = 299; expect(b.allowsAttempt()).toBe(false); // reopens at 100+200=300
    clock = 300; expect(b.allowsAttempt()).toBe(true);
  });

  test('success in HALF_OPEN closes and resets the exponential cooldown', () => {
    const b = new CircuitBreaker('x', cfg, now);
    b.recordFailure(); b.recordFailure(); b.recordFailure();
    clock = 100; b.allowsAttempt(); // HALF_OPEN
    b.recordSuccess();
    expect(b.state).toBe('closed');
    expect(b.currentCooldown).toBe(cfg.cooldownMs); // reset
  });

  test('scattered failures outside the window do not trip it', () => {
    const b = new CircuitBreaker('x', cfg, now);
    b.recordFailure();
    clock = 2000; // > windowMs since first failure
    b.recordFailure();
    b.recordFailure();
    expect(b.state).toBe('closed'); // window restarted; only 2 in the new window
  });
});

// ---------------------------------------------------------------- registry/failover
//
// The registry reads config + drivers at require time, so we mock the drivers
// and re-require the registry per scenario with jest.isolateModules.

function loadRegistryWith({ ollama = null, primaryOverride = null } = {}) {
  let registry;
  jest.isolateModules(() => {
    // Keep ONE AsyncLocalStorage across the isolate boundary (see top of file).
    jest.doMock('../../src/backends/jobContext', () => jobContext);
    if (primaryOverride) jest.doMock('../../src/backends/llamacpp', () => primaryOverride);
    if (ollama) {
      process.env.CORTEX_OLLAMA_ENABLED = 'true';
      process.env.CORTEX_ASYNC_ROLE = 'worker';
      jest.doMock('../../src/backends/ollama', () => ollama);
    } else {
      delete process.env.CORTEX_OLLAMA_ENABLED;
      delete process.env.CORTEX_ASYNC_ROLE;
    }
    // eslint-disable-next-line global-require
    registry = require('../../src/backends');
  });
  return registry;
}

function fakeDriver(name, overrides = {}) {
  return {
    name,
    capabilities: { managesResidency: false, acceptsImages: true, pullable: false },
    modelFor: (role) => (role === 'vision' ? `${name}-vl` : null),
    health: jest.fn(async () => true),
    supportsVision: jest.fn(async () => true),
    ensureResident: jest.fn(async () => {}),
    chatComplete: jest.fn(async () => ({ text: `${name}-ok`, finishReason: 'stop' })),
    ...overrides,
  };
}

describe('registry failover', () => {
  afterEach(() => { jest.resetModules(); jest.dontMock('../../src/backends/ollama'); jest.dontMock('../../src/backends/llamacpp'); });

  test('with only the primary registered, a vision call uses it', async () => {
    const primary = fakeDriver('llamacpp');
    const registry = loadRegistryWith({ primaryOverride: primary });
    const r = await registry.chatForRole('vision', [], {}, { pool: 'vision' });
    expect(r.backend).toBe('llamacpp');
    expect(primary.chatComplete).toHaveBeenCalledTimes(1);
  });

  test('an availability failure on the primary fails over to the secondary (in a job)', async () => {
    const primary = fakeDriver('llamacpp', {
      chatComplete: jest.fn(async () => { throw new BackendUnavailableError('primary down', { backend: 'llamacpp' }); }),
    });
    const secondary = fakeDriver('ollama');
    const registry = loadRegistryWith({ primaryOverride: primary, ollama: secondary });

    const r = await runInJobContext({ queue: 'test' }, () => registry.chatForRole('vision', [], {}, { pool: 'vision' }));
    expect(r.backend).toBe('ollama');
    expect(primary.chatComplete).toHaveBeenCalledTimes(1);
    expect(secondary.chatComplete).toHaveBeenCalledTimes(1);
  });

  test('a USER_FAULT is terminal — no failover to the secondary', async () => {
    const primary = fakeDriver('llamacpp', {
      chatComplete: jest.fn(async () => { throw Object.assign(new Error('bad bytes'), { code: 'UNSUPPORTED_IMAGE' }); }),
    });
    const secondary = fakeDriver('ollama');
    const registry = loadRegistryWith({ primaryOverride: primary, ollama: secondary });

    await expect(
      runInJobContext({}, () => registry.chatForRole('vision', [], {}, { pool: 'vision' })),
    ).rejects.toMatchObject({ code: 'UNSUPPORTED_IMAGE' });
    expect(secondary.chatComplete).not.toHaveBeenCalled();
  });

  test('QUEUE-ONLY: using the secondary OUTSIDE a job throws CORTEX_SYNC_CALL_FORBIDDEN', async () => {
    const primary = fakeDriver('llamacpp', {
      chatComplete: jest.fn(async () => { throw new BackendUnavailableError('primary down'); }),
    });
    const secondary = fakeDriver('ollama');
    const registry = loadRegistryWith({ primaryOverride: primary, ollama: secondary });

    // No runInJobContext wrapper → the secondary must be refused.
    await expect(registry.chatForRole('vision', [], {}, { pool: 'vision' }))
      .rejects.toMatchObject({ code: 'CORTEX_SYNC_CALL_FORBIDDEN' });
    expect(secondary.chatComplete).not.toHaveBeenCalled();
  });

  test('a text-only secondary model is skipped without tripping its breaker', async () => {
    const primary = fakeDriver('llamacpp', {
      chatComplete: jest.fn(async () => { throw new BackendUnavailableError('primary down'); }),
    });
    const secondary = fakeDriver('ollama', { supportsVision: jest.fn(async () => false) });
    const registry = loadRegistryWith({ primaryOverride: primary, ollama: secondary });

    await expect(
      runInJobContext({}, () => registry.chatForRole('vision', [], {}, { pool: 'vision' })),
    ).rejects.toMatchObject({ code: 'LLM_UNAVAILABLE' }); // all backends exhausted
    expect(secondary.chatComplete).not.toHaveBeenCalled(); // never sent an image to a text model
    // The text-only skip must NOT have tripped the secondary's breaker.
    expect(registry.snapshot().breakers.find((b) => b.backend === 'ollama').state).toBe('closed');
  });

  test('the gateway registry (no worker role) never contains the secondary', async () => {
    const primary = fakeDriver('llamacpp');
    const secondary = fakeDriver('ollama');
    // ollama enabled but NO CORTEX_ASYNC_ROLE=worker → must not register.
    let registry;
    jest.isolateModules(() => {
      process.env.CORTEX_OLLAMA_ENABLED = 'true';
      delete process.env.CORTEX_ASYNC_ROLE;
      jest.doMock('../../src/backends/llamacpp', () => primary);
      jest.doMock('../../src/backends/ollama', () => secondary);
      // eslint-disable-next-line global-require
      registry = require('../../src/backends');
    });
    expect(registry.hasSecondary()).toBe(false);
    expect(registry.snapshot().secondaries).toEqual([]);
    delete process.env.CORTEX_OLLAMA_ENABLED;
  });
});
