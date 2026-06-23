/**
 * ═══════════════════════════════════════════════════════════
 * DID proof-of-control
 *
 * Proves a user controls a linked DID by checking that a one-time challenge
 * token they were issued has been published somewhere only the DID owner can
 * write:
 *   - did:web → a file at https://<host>/.well-known/atproto-did-challenge.txt
 *               (controlling the host == controlling the did:web)
 *   - did:plc → the account's Bluesky profile description (only the repo owner
 *               can edit it), read via the public AppView
 * Either method also works as a fallback for the other, so we try both.
 * Returns the proof method that succeeded, or null.
 * ═══════════════════════════════════════════════════════════
 */

const didResolver = require('./didResolver');
const appviewClient = require('../ingest/appviewClient');

/** Check the .well-known challenge file for a did:web host. */
async function checkWellKnown(did, token, { fetchImpl = fetch } = {}) {
  const parsed = didResolver.parseDid(did);
  if (!parsed || parsed.method !== 'web') return false;
  // did:web:host[%3Aport][:path…] → authority is the first segment.
  const authority = decodeURIComponent(parsed.id.split(':')[0]);
  const url = `https://${authority}/.well-known/atproto-did-challenge.txt`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return false;
    const body = await res.text();
    return body.includes(token);
  } catch (_) {
    return false;
  }
}

/** Check the account's profile description (works for any DID on the AppView). */
async function checkProfile(did, token, opts = {}) {
  const desc = await appviewClient.getProfileDescription(did, opts);
  return typeof desc === 'string' && desc.includes(token);
}

/**
 * Verify control of `did` using `token`. Returns 'well-known' | 'profile' | null.
 */
async function verify(did, token, opts = {}) {
  if (!did || !token) return null;
  if (await checkWellKnown(did, token, opts)) return 'well-known';
  if (await checkProfile(did, token, opts)) return 'profile';
  return null;
}

module.exports = { verify, checkWellKnown, checkProfile };
