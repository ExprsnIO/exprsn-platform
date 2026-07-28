'use strict';

/**
 * FEAT-077 — capability façade (Shape A): backend registry behavior and
 * fail-closed dispatch semantics.
 *
 * The FileVault adapter is mocked out (it has its own suite —
 * capabilityFilevaultAdapter.test.js); these tests pin the façade contract:
 *  - frozen resource-type name registry; reserved names carry NO behavior
 *  - a type is usable ONLY once a backend is registered (else CAP_NOT_FOUND)
 *  - registerBackend throws on duplicate/unknown/malformed
 *  - pure dispatch — no per-type conditionals — proven by registering a fake
 *    adapter under the reserved 'roomFile' name and watching it get called
 *  - every unexpected adapter error surfaces as CapabilityError('CAP_NOT_FOUND')
 *  - the normative provenance matrix: owner-minted survives a private-flip,
 *    non-owner-minted dies, and dead-vs-missing are indistinguishable
 */

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

// Stub the FileVault adapter so requiring the façade doesn't pull models/CA.
const mockFileAdapter = {
  backendName: 'filevault-sharelink',
  mint: jest.fn(),
  authorize: jest.fn(),
  revoke: jest.fn(),
  revokeByResource: jest.fn(),
  listByResource: jest.fn()
};
jest.mock('../../src/services/capability/filevaultShareLinkAdapter', () => mockFileAdapter);

function fakeAdapter(overrides = {}) {
  return {
    backendName: 'fake-backend',
    mint: jest.fn(),
    authorize: jest.fn(),
    revoke: jest.fn(),
    revokeByResource: jest.fn(),
    listByResource: jest.fn(),
    ...overrides
  };
}

let capabilityService;

beforeEach(() => {
  jest.clearAllMocks();
  jest.resetModules(); // fresh registry per test ('file' re-registers itself)
  capabilityService = require('../../src/services/capabilityService');
});

describe('resource-type registry', () => {
  test('RESOURCE_TYPES is frozen and contains exactly the contract names', () => {
    expect(capabilityService.RESOURCE_TYPES).toEqual({
      FILE: 'file',
      ROOM_FILE: 'roomFile',
      ALBUM: 'album'
    });
    expect(Object.isFrozen(capabilityService.RESOURCE_TYPES)).toBe(true);
  });

  test('the FileVault adapter is self-registered for "file"', async () => {
    mockFileAdapter.mint.mockResolvedValue({ capability: {}, credential: {} });
    await capabilityService.grant('file', 'f1', 'u1', { kind: 'link' });
    expect(mockFileAdapter.mint).toHaveBeenCalledWith('f1', 'u1', { kind: 'link' });
  });

  test('registerBackend throws on a duplicate type', () => {
    expect(() => capabilityService.registerBackend('file', fakeAdapter()))
      .toThrow(/already registered/);
  });

  test('registerBackend throws on a name outside RESOURCE_TYPES', () => {
    expect(() => capabilityService.registerBackend('gallery', fakeAdapter()))
      .toThrow(/Unknown capability resource type/);
  });

  test('registerBackend throws on a malformed adapter (missing method)', () => {
    const bad = fakeAdapter();
    delete bad.revokeByResource;
    expect(() => capabilityService.registerBackend('roomFile', bad))
      .toThrow(/missing required method 'revokeByResource'/);
  });

  test('reserved-but-unregistered types fail closed with CAP_NOT_FOUND on every method', async () => {
    for (const type of ['roomFile', 'album']) {
      for (const call of [
        () => capabilityService.grant(type, 'r1', 'u1'),
        () => capabilityService.authorize(type, { token: 't' }, {}),
        () => capabilityService.revoke(type, 'c1', 'u1'),
        () => capabilityService.revokeByResource(type, 'r1'),
        () => capabilityService.listByResource(type, 'r1', 'u1')
      ]) {
        await expect(call()).rejects.toMatchObject({
          name: 'CapabilityError',
          code: 'CAP_NOT_FOUND'
        });
      }
    }
  });

  test('a completely unknown type gets the same denial (indistinguishable)', async () => {
    let unknownErr, reservedErr;
    await capabilityService.authorize('nope', {}, {}).catch((e) => { unknownErr = e; });
    await capabilityService.authorize('album', {}, {}).catch((e) => { reservedErr = e; });
    expect(unknownErr.code).toBe('CAP_NOT_FOUND');
    expect(reservedErr.code).toBe('CAP_NOT_FOUND');
    expect(unknownErr.message).toBe(reservedErr.message);
  });

  test('registering an adapter under a reserved name makes it live via pure dispatch', async () => {
    const adapter = fakeAdapter();
    adapter.authorize.mockResolvedValue({ resource: { id: 'rf1' }, capability: { id: 'cap1' } });
    capabilityService.registerBackend('roomFile', adapter);

    const result = await capabilityService.authorize(
      'roomFile', { grantId: 'g1' }, { requesterId: 'u2' });

    expect(result.resource.id).toBe('rf1');
    expect(adapter.authorize).toHaveBeenCalledWith({ grantId: 'g1' }, { requesterId: 'u2' });
    // and 'file' dispatch is untouched by the new registration
    expect(mockFileAdapter.authorize).not.toHaveBeenCalled();
  });
});

describe('fail-closed error normalization', () => {
  test('an unexpected adapter error (DB down, bug) surfaces as CAP_NOT_FOUND', async () => {
    mockFileAdapter.authorize.mockRejectedValue(new Error('connect ECONNREFUSED'));
    await expect(capabilityService.authorize('file', { token: 't' }, {}))
      .rejects.toMatchObject({ code: 'CAP_NOT_FOUND', cause: 'connect ECONNREFUSED' });
  });

  test('the same holds for grant / revoke / revokeByResource / listByResource', async () => {
    mockFileAdapter.mint.mockRejectedValue(new Error('boom'));
    mockFileAdapter.revoke.mockRejectedValue(new Error('boom'));
    mockFileAdapter.revokeByResource.mockRejectedValue(new Error('boom'));
    mockFileAdapter.listByResource.mockRejectedValue(new Error('boom'));

    for (const call of [
      () => capabilityService.grant('file', 'f1', 'u1'),
      () => capabilityService.revoke('file', 'c1', 'u1'),
      () => capabilityService.revokeByResource('file', 'f1'),
      () => capabilityService.listByResource('file', 'f1', 'u1')
    ]) {
      await expect(call()).rejects.toMatchObject({ code: 'CAP_NOT_FOUND' });
    }
  });

  test('an adapter CapabilityError passes through unchanged (cause intact)', async () => {
    // Use the façade's own exported class: jest.resetModules() gives each test
    // a fresh module registry, so the top-level require would be a different
    // class identity than the one the façade instanceof-checks against.
    const original = new capabilityService.CapabilityError('CAP_NOT_FOUND', 'SHARE_LINK_EXPIRED');
    mockFileAdapter.authorize.mockRejectedValue(original);
    let caught;
    await capabilityService.authorize('file', { token: 't' }, {}).catch((e) => { caught = e; });
    expect(caught).toBe(original);
    expect(caught.cause).toBe('SHARE_LINK_EXPIRED');
  });

  test('revokeByResource returning { revoked: 0 } is success, not an error', async () => {
    mockFileAdapter.revokeByResource.mockResolvedValue({ revoked: 0 });
    await expect(capabilityService.revokeByResource('file', 'f1', { reason: 'resource-replaced' }))
      .resolves.toEqual({ revoked: 0 });
    expect(mockFileAdapter.revokeByResource).toHaveBeenCalledWith('f1', { reason: 'resource-replaced' });
  });
});

describe('normative provenance semantics (Rick 2026-07-13, enforced by adapters)', () => {
  // A minimal adapter implementing the required lazy authorize-time predicate:
  // visibility !== 'private' || mintedAsOwner || requester is owner.
  const FILE_ROW = { id: 'rf1', userId: 'owner-1', visibility: 'private' };
  const GRANTS = {
    'owner-minted': { mintedAsOwner: true },
    'nonowner-minted': { mintedAsOwner: false }
  };

  beforeEach(() => {
    capabilityService.registerBackend('roomFile', fakeAdapter({
      authorize: async (credential, ctx) => {
        const grantRow = GRANTS[credential.grantId];
        if (!grantRow) throw new capabilityService.CapabilityError('CAP_NOT_FOUND', 'MISSING');
        const alive = FILE_ROW.visibility !== 'private'
          || grantRow.mintedAsOwner
          || String(FILE_ROW.userId) === String(ctx.requesterId);
        if (!alive) throw new capabilityService.CapabilityError('CAP_NOT_FOUND', 'PROVENANCE_DEAD');
        return {
          resource: FILE_ROW,
          capability: { id: credential.grantId, provenance: { mintedAsOwner: grantRow.mintedAsOwner } }
        };
      }
    }));
  });

  test('an owner-minted grant SURVIVES the private-flip for a non-owner requester', async () => {
    const result = await capabilityService.authorize(
      'roomFile', { grantId: 'owner-minted' }, { requesterId: 'stranger' });
    expect(result.resource.id).toBe('rf1');
  });

  test('a non-owner-minted grant is DEAD once the file went private', async () => {
    await expect(capabilityService.authorize(
      'roomFile', { grantId: 'nonowner-minted' }, { requesterId: 'stranger' }))
      .rejects.toMatchObject({ code: 'CAP_NOT_FOUND' });
  });

  test('the file owner still passes even through a dead grant', async () => {
    const result = await capabilityService.authorize(
      'roomFile', { grantId: 'nonowner-minted' }, { requesterId: 'owner-1' });
    expect(result.resource.id).toBe('rf1');
  });

  test('provenance-dead and missing are indistinguishable to the caller', async () => {
    let deadErr, missingErr;
    await capabilityService.authorize('roomFile', { grantId: 'nonowner-minted' },
      { requesterId: 'stranger' }).catch((e) => { deadErr = e; });
    await capabilityService.authorize('roomFile', { grantId: 'never-existed' },
      { requesterId: 'stranger' }).catch((e) => { missingErr = e; });
    expect(deadErr.code).toBe('CAP_NOT_FOUND');
    expect(missingErr.code).toBe('CAP_NOT_FOUND');
    expect(deadErr.message).toBe(missingErr.message);
  });
});
