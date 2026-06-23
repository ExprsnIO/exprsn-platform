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

/** Fetch a post's text + first image URL by AT-URI, or null if unavailable. */
async function getPost(uri, { fetchImpl = fetch } = {}) {
  const url = `${config.consume.appviewUrl}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(uri)}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const json = await res.json();
    const post = json.posts && json.posts[0];
    if (!post) return null;
    const text = post.record && typeof post.record.text === 'string' ? post.record.text : '';
    const image = (post.embed && post.embed.images && post.embed.images[0] && post.embed.images[0].fullsize) || null;
    return { text, image, authorDid: post.author && post.author.did };
  } catch (_) {
    return null;
  }
}

/** Fetch an actor's profile description (used for proof-of-control), or null. */
async function getProfileDescription(actor, { fetchImpl = fetch } = {}) {
  const url = `${config.consume.appviewUrl}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json.description === 'string' ? json.description : '';
  } catch (_) {
    return null;
  }
}

module.exports = { getPost, getProfileDescription };
