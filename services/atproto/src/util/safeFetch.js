/**
 * ═══════════════════════════════════════════════════════════
 * safeFetch — SSRF-hardened HTTPS fetch for resolving attacker-influenced URLs
 *
 * The DID resolver fetches `did:web` / `did:plc` documents whose host comes
 * straight from a caller-supplied DID (e.g. via the OPEN `POST /atproto/labels/
 * verify` route → resolveDid(label.src)). Without guards that is a server-side
 * request forgery primitive: `did:web:169.254.169.254` (cloud metadata),
 * `did:web:10.0.0.5%3A8443` (internal services), or a public host that redirects
 * to an internal one.
 *
 * Mitigations applied here:
 *   - https only (no file:/http:/gopher:/…);
 *   - resolve the hostname and REJECT if any resolved address is private /
 *     loopback / link-local / unique-local / reserved (blocks both IP-literal
 *     DIDs and hostnames that resolve internally — basic DNS-rebind defense);
 *   - never follow redirects (redirect: 'manual') so a 3xx → internal is not
 *     chased; the caller treats a non-2xx as unresolvable;
 *   - hard timeout; and a streamed response-size cap to bound memory.
 * ═══════════════════════════════════════════════════════════
 */

const dns = require('dns').promises;
const net = require('net');

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 1_000_000; // 1 MB — DID docs are tiny

/** Disallowed hostnames (case-insensitive, exact or suffix) regardless of DNS. */
function isBlockedName(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (h === 'localhost') return true;
  if (h.endsWith('.localhost')) return true;
  if (h.endsWith('.local')) return true;
  if (h.endsWith('.internal')) return true;
  return false;
}

/** True for an IPv4 string in a private / loopback / link-local / reserved range. */
function isPrivateIPv4(ip) {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast (224/4) + reserved (240/4)
  return false;
}

/** True for an IPv6 string in loopback / link-local / unique-local / unspecified. */
function isPrivateIPv6(ip) {
  let h = String(ip).toLowerCase();
  // Strip zone id (fe80::1%eth0)
  const pct = h.indexOf('%');
  if (pct !== -1) h = h.slice(0, pct);

  if (h === '::1' || h === '::') return true; // loopback / unspecified
  // IPv4-mapped/embedded (::ffff:a.b.c.d) — validate the embedded v4.
  const v4 = h.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4 && (h.startsWith('::ffff:') || h.startsWith('::'))) {
    return isPrivateIPv4(v4[1]);
  }
  if (h.startsWith('fe8') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) {
    return true; // fe80::/10 link-local
  }
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // fc00::/7 unique-local
  return false;
}

function isPrivateIp(ip) {
  return net.isIPv4(ip) ? isPrivateIPv4(ip) : isPrivateIPv6(ip);
}

/** Throws if the hostname is blocked or resolves to a non-public address. */
async function assertPublicHost(hostname) {
  if (isBlockedName(hostname)) {
    throw new Error(`blocked_host:${hostname}`);
  }
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error(`blocked_ip:${hostname}`);
    return;
  }
  // DNS hostname: every resolved address must be public.
  let addrs;
  try {
    addrs = await dns.lookup(hostname, { all: true });
  } catch (_) {
    throw new Error(`dns_failed:${hostname}`);
  }
  if (!addrs.length) throw new Error(`dns_empty:${hostname}`);
  for (const { address } of addrs) {
    if (isPrivateIp(address)) throw new Error(`blocked_resolved_ip:${address}`);
  }
}

/** Read a fetch Response body with a hard byte cap (streamed). */
async function readCapped(res, maxBytes = DEFAULT_MAX_BYTES) {
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader) {
    const text = await res.text();
    if (Buffer.byteLength(text) > maxBytes) throw new Error('response_too_large');
    return text;
  }
  let total = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch (_) { /* ignore */ }
      throw new Error('response_too_large');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * SSRF-hardened HTTPS fetch. Validates the URL/host before connecting, refuses to
 * follow redirects, and enforces a timeout. Returns the fetch Response.
 */
async function safeFetch(url, { timeoutMs = DEFAULT_TIMEOUT_MS, headers, fetchImpl = fetch } = {}) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    throw new Error('invalid_url');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`blocked_scheme:${parsed.protocol}`);
  }
  await assertPublicHost(parsed.hostname);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { redirect: 'manual', headers, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** safeFetch + JSON parse with the size cap applied. Returns null on non-2xx. */
async function safeFetchJson(url, opts = {}) {
  const res = await safeFetch(url, opts);
  if (!res.ok) return null;
  const text = await readCapped(res, opts.maxBytes || DEFAULT_MAX_BYTES);
  return JSON.parse(text);
}

module.exports = {
  safeFetch,
  safeFetchJson,
  assertPublicHost,
  isPrivateIp,
  isPrivateIPv4,
  isPrivateIPv6,
  isBlockedName,
  readCapped,
};
