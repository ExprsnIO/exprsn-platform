/**
 * SSRF guard (H2) — safeFetch / address classification.
 * Pure logic; no network. Covers the private-range classifier, the name
 * blocklist, scheme enforcement, IP-literal rejection, and the size cap.
 */

const {
  safeFetch,
  safeFetchJson,
  isPrivateIPv4,
  isPrivateIPv6,
  isBlockedName,
  assertPublicHost,
} = require('../src/util/safeFetch');

describe('isPrivateIPv4', () => {
  it.each([
    '10.0.0.1', '10.255.255.255', '127.0.0.1', '169.254.169.254',
    '172.16.0.1', '172.31.255.255', '192.168.1.1', '100.64.0.1',
    '0.0.0.0', '224.0.0.1', '240.0.0.1',
  ])('flags %s as private/reserved', (ip) => {
    expect(isPrivateIPv4(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34'])('allows public %s', (ip) => {
    expect(isPrivateIPv4(ip)).toBe(false);
  });

  it('treats malformed input as unsafe', () => {
    expect(isPrivateIPv4('not.an.ip')).toBe(true);
  });
});

describe('isPrivateIPv6', () => {
  it.each(['::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'])(
    'flags %s as private',
    (ip) => {
      expect(isPrivateIPv6(ip)).toBe(true);
    }
  );

  it.each(['2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows public %s', (ip) => {
    expect(isPrivateIPv6(ip)).toBe(false);
  });
});

describe('isBlockedName', () => {
  it.each(['localhost', 'foo.localhost', 'svc.local', 'db.internal', ''])('blocks %s', (h) => {
    expect(isBlockedName(h)).toBe(true);
  });
  it.each(['example.com', 'plc.directory', 'bsky.social'])('allows %s', (h) => {
    expect(isBlockedName(h)).toBe(false);
  });
});

describe('assertPublicHost', () => {
  it('rejects a private IP literal', async () => {
    await expect(assertPublicHost('169.254.169.254')).rejects.toThrow(/blocked_ip/);
  });
  it('rejects a blocked name without DNS', async () => {
    await expect(assertPublicHost('localhost')).rejects.toThrow(/blocked_host/);
  });
  it('accepts a public IP literal', async () => {
    await expect(assertPublicHost('8.8.8.8')).resolves.toBeUndefined();
  });
});

describe('safeFetch', () => {
  it('rejects non-https schemes', async () => {
    await expect(safeFetch('http://example.com/x')).rejects.toThrow(/blocked_scheme/);
  });

  it('rejects an https URL pointing at a private IP (no fetch issued)', async () => {
    const fetchImpl = jest.fn();
    await expect(safeFetch('https://10.0.0.5:8443/internal', { fetchImpl })).rejects.toThrow(/blocked_ip/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('issues a non-redirect-following request for a public host', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true });
    await safeFetch('https://8.8.8.8/.well-known/did.json', { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, opts] = fetchImpl.mock.calls[0];
    expect(opts.redirect).toBe('manual');
    expect(opts.signal).toBeDefined();
  });
});

describe('safeFetchJson', () => {
  it('returns null on a non-2xx response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false });
    expect(await safeFetchJson('https://8.8.8.8/x', { fetchImpl })).toBeNull();
  });

  it('parses a capped JSON body on success', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ hello: 'world' }),
    });
    expect(await safeFetchJson('https://8.8.8.8/x', { fetchImpl })).toEqual({ hello: 'world' });
  });

  it('rejects an oversized body', async () => {
    const huge = 'x'.repeat(2_000_000);
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, text: async () => huge });
    await expect(safeFetchJson('https://8.8.8.8/x', { fetchImpl, maxBytes: 1000 })).rejects.toThrow(
      /response_too_large/
    );
  });
});
