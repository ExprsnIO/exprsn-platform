/**
 * ═══════════════════════════════════════════════════════════
 * Feed generator record + describe builders (pure)
 *
 * We operate an app.bsky.feed.generator — an Exprsn-curated feed that Bluesky
 * clients can subscribe to. The "clean" feed surfaces posts we've ingested,
 * filtered by our moderation labels (active !hide excluded). The generator
 * record is published at at://<did>/app.bsky.feed.generator/<rkey>.
 * ═══════════════════════════════════════════════════════════
 */

const config = require('../../config');

/** at:// URI of our feed generator record. */
function feedUri(did, rkey = config.feed.rkey) {
  return `at://${did}/app.bsky.feed.generator/${rkey}`;
}

/** The app.bsky.feed.generator record (rkey from config) to publish in the repo. */
function buildGeneratorRecord(did, createdAt) {
  return {
    $type: 'app.bsky.feed.generator',
    did, // the feed generator service DID (our #bsky_fg host)
    displayName: config.feed.name,
    description: config.feed.description,
    createdAt: createdAt || new Date().toISOString(),
  };
}

/** app.bsky.feed.describeFeedGenerator response. */
function describe(did) {
  return {
    did,
    feeds: [{ uri: feedUri(did) }],
  };
}

module.exports = { feedUri, buildGeneratorRecord, describe };
