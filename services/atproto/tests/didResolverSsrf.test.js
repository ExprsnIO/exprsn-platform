/**
 * SSRF guard (H2) at the resolver layer. `resolveDid` is reachable unauthenticated
 * via POST /atproto/labels/verify → verifyInboundLabel → resolveDid(label.src),
 * so a did:web/did:plc pointing at an internal host must NOT trigger a fetch.
 */

const { resolveDid } = require('../src/identity/didResolver');

describe('resolveDid SSRF hardening', () => {
  it('resolves did:exprsn offline without any network call', async () => {
    const fetchImpl = jest.fn();
    // A real self-certifying key isn't needed for the no-fetch assertion.
    const result = await resolveDid('did:exprsn:zQ3shokFTS3brHcDQrn82RUDfCZ', { fetchImpl });
    expect(result).not.toBeNull();
    expect(result.publicKeyMultibase).toBe('zQ3shokFTS3brHcDQrn82RUDfCZ');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to fetch a did:web on a private/loopback host', async () => {
    const fetchImpl = jest.fn();
    expect(await resolveDid('did:web:127.0.0.1', { fetchImpl })).toBeNull();
    expect(await resolveDid('did:web:169.254.169.254', { fetchImpl })).toBeNull();
    // did:web:10.0.0.5%3A8443 → https://10.0.0.5:8443/...
    expect(await resolveDid('did:web:10.0.0.5%3A8443', { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fetches a did:web on a public host and extracts the label key', async () => {
    const doc = {
      id: 'did:web:8.8.8.8',
      verificationMethod: [{ id: 'did:web:8.8.8.8#atproto_label', publicKeyMultibase: 'zPUBLICKEY' }],
    };
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => JSON.stringify(doc) });
    const result = await resolveDid('did:web:8.8.8.8', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.publicKeyMultibase).toBe('zPUBLICKEY');
  });

  it('rejects a malformed did:plc id (path-traversal guard) without fetching', async () => {
    const fetchImpl = jest.fn();
    expect(await resolveDid('did:plc:../../admin', { fetchImpl })).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
