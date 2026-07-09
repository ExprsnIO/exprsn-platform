const proof = require('../src/identity/proofOfControl');
const appviewClient = require('../src/ingest/appviewClient');

const TOKEN = 'exprsn-verify-abc123';

describe('proofOfControl', () => {
  test('checkWellKnown passes when the did:web host serves the token', async () => {
    // IP literal (not a hostname) so this stays hermetic — safeFetch's SSRF guard
    // (BUG-001) resolves hostnames via real DNS, and this suite runs offline.
    const fetchImpl = async (url) => {
      expect(url).toBe('https://8.8.8.8/.well-known/atproto-did-challenge.txt');
      return { ok: true, status: 200, text: async () => `${TOKEN}\n` };
    };
    expect(await proof.checkWellKnown('did:web:8.8.8.8', TOKEN, { fetchImpl })).toBe(true);
  });

  test('checkWellKnown decodes the port and fails on missing token', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, text: async () => 'nope' });
    expect(await proof.checkWellKnown('did:web:8.8.8.8%3A8443', TOKEN, { fetchImpl })).toBe(false);
  });

  test('verify falls back to the profile description for did:plc', async () => {
    const spy = jest
      .spyOn(appviewClient, 'getProfileDescription')
      .mockResolvedValue(`hi! ${TOKEN} verifying`);
    const method = await proof.verify('did:plc:abc', TOKEN);
    expect(method).toBe('profile');
    spy.mockRestore();
  });

  test('verify returns null when neither method has the token', async () => {
    const spy = jest.spyOn(appviewClient, 'getProfileDescription').mockResolvedValue('unrelated bio');
    const method = await proof.verify('did:plc:abc', TOKEN);
    expect(method).toBeNull();
    spy.mockRestore();
  });
});
