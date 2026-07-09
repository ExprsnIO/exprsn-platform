/**
 * ═══════════════════════════════════════════════════════════
 * AppView client
 *
 * Fetches public post content from a Bluesky AppView so we can run our AI
 * moderation on a post a trusted labeler flagged (we only receive the label, not
 * the text). Uses the public, unauthenticated AppView API.
 * ═══════════════════════════════════════════════════════════
 */

const config = require('../../config');
const logger = require('../../utils/logger');
const { readCapped } = require('../util/safeFetch');

/**
 * Fetch a URL and parse a JSON body with a hard byte cap (DoS guard — an
 * oversized AppView response is rejected, never buffered unbounded).
 * Returns null on non-2xx; throws on parse/size errors (callers catch).
 */
async function fetchJsonCapped(url, fetchImpl, maxBytes) {
  const res = await fetchImpl(url);
  if (!res.ok) return null;
  const text = await readCapped(res, maxBytes);
  return JSON.parse(text);
}

function warnIfTooLarge(url, err, maxBytes) {
  if (err && err.message === 'response_too_large') {
    logger.warn('AppView response exceeded size cap — dropped', { url, maxBytes });
  }
}

/** Fetch a post's text + first image URL by AT-URI, or null if unavailable. */
async function getPost(uri, { fetchImpl = fetch, maxBytes = config.limits.appviewMaxBodyBytes } = {}) {
  const url = `${config.consume.appviewUrl}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`;
  try {
    const json = await fetchJsonCapped(url, fetchImpl, maxBytes);
    if (!json) return null;
    const post = json.posts && json.posts[0];
    if (!post) return null;
    const text = post.record && typeof post.record.text === 'string' ? post.record.text : '';
    const image = (post.embed && post.embed.images && post.embed.images[0] && post.embed.images[0].fullsize) || null;
    return { text, image, authorDid: post.author && post.author.did };
  } catch (err) {
    warnIfTooLarge(url, err, maxBytes);
    return null;
  }
}

/** Fetch an actor's profile description (used for proof-of-control), or null. */
async function getProfileDescription(actor, { fetchImpl = fetch, maxBytes = config.limits.appviewMaxBodyBytes } = {}) {
  const url = `${config.consume.appviewUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`;
  try {
    const json = await fetchJsonCapped(url, fetchImpl, maxBytes);
    if (!json) return null;
    return typeof json.description === 'string' ? json.description : '';
  } catch (err) {
    warnIfTooLarge(url, err, maxBytes);
    return null;
  }
}

module.exports = { getPost, getProfileDescription };
