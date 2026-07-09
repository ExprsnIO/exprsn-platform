/**
 * SSRF guard (BUG-001) on the authenticated proof-of-control path.
 * `checkWellKnown` fetches a `.well-known` file at a host taken straight from
 * the user's LINKED did:web (caller-influenced), reachable via the authenticated
 * POST /atproto/dids/verify → verifyControl → proofOfControl.verify → checkWellKnown
 * chain. A did:web pointing at an internal/loopback/link-local host must NOT
 * trigger a fetch, and must resolve cleanly (false) rather than throw/hang.
 */

const proof = require('../src/identity/proofOfControl');

const TOKEN = 'exprsn-verify-abc123';

describe('proofOfControl SSRF hardening', () => {
  it('refuses to fetch a did:web on a loopback host', async () => {
    const fetchImpl = jest.fn();
    expect(await proof.checkWellKnown('did:web:127.0.0.1', TOKEN, { fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to fetch a did:web on a link-local/metadata host', async () => {
    const fetchImpl = jest.fn();
    expect(await proof.checkWellKnown('did:web:169.254.169.254', TOKEN, { fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses to fetch a did:web on an internal host with an encoded port', async () => {
    const fetchImpl = jest.fn();
    // did:web:10.0.0.5%3A8443 → https://10.0.0.5:8443/.well-known/...
    expect(await proof.checkWellKnown('did:web:10.0.0.5%3A8443', TOKEN, { fetchImpl })).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses a did:web hostname that resolves internally (DNS-rebind defense)', async () => {
    const dns = require('dns').promises;
    const spy = jest.spyOn(dns, 'lookup').mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const fetchImpl = jest.fn();
    try {
      expect(await proof.checkWellKnown('did:web:attacker-controlled.example', TOKEN, { fetchImpl })).toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('still verifies a did:web on a public host', async () => {
    // IP literal (not a hostname) so this stays hermetic — no real DNS lookup.
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => `${TOKEN}\n` });
    expect(await proof.checkWellKnown('did:web:8.8.8.8', TOKEN, { fetchImpl })).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, opts] = fetchImpl.mock.calls[0];
    expect(opts.redirect).toBe('manual');
  });
});
