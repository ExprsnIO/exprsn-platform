'use strict';

/**
 * Timeline demo-content seeder.
 *
 * Inserts a handful of rich, public timeline posts — text, single image,
 * multi-image gallery (with "+N" overflow), an inline video, a live/HLS card,
 * and a mixed post — plus a few comments, so the full-content view and the
 * media renderer have something realistic to show. This is DEMO content, not
 * the scale seeder (see seed-main.js); it is small, idempotent, and safe to
 * re-run.
 *
 * Media uses directly-loadable public URLs (no FileVault upload required), so
 * the browser viewing the SPA needs outbound internet to fetch the images /
 * video / HLS manifest. Posts are authored by real users discovered from
 * `auth.users` (so they surface in those users' Home feeds and profiles); set
 * SEED_TIMELINE_USER_ID to pin authorship to a specific user. All posts are
 * `visibility: 'public'`, so they always appear in the Global feed regardless.
 *
 * Idempotency: every post is tagged `metadata.seedDemo = true`. Each run first
 * removes prior demo posts (and their comments), then re-inserts — so re-running
 * tops up to the current definition rather than duplicating.
 *
 * Usage:
 *   node scripts/seed/timeline-demo.js                 # (re)create demo posts
 *   SEED_TIMELINE_USER_ID=<uuid> node scripts/seed/timeline-demo.js
 *   SEED_DEMO_RESET=1 node scripts/seed/timeline-demo.js   # delete only, no insert
 */

const path = require('path');

require('./prod-guard');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
// @exprsn/shared eagerly builds a Stripe client at import; give it a dummy key
// so requiring the models pulls cleanly without real billing config.
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_seed_dummy';
require('dotenv').config({ path: path.join(ROOT, '.env') });

const { sequelize, Post, Comment } = require(path.join(ROOT, 'services/timeline/src/models'));

// A stable fallback author (used only if no real users are found and no
// SEED_TIMELINE_USER_ID is given). UUID is fixed so re-runs stay deterministic.
const FALLBACK_AUTHORS = [
  '00000000-0000-4000-8000-0000000d3m01',
  '00000000-0000-4000-8000-0000000d3m02',
  '00000000-0000-4000-8000-0000000d3m03',
];

const img = (seed, w = 1024, h = 768) => `https://picsum.photos/seed/${seed}/${w}/${h}`;
// Public sample assets (Google's gtv test bucket + Mux's HLS test stream).
const SAMPLE_MP4 = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';
const SAMPLE_HLS = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

/**
 * Post definitions, oldest → newest (later entries insert last, so they sort to
 * the top of a newest-first feed). `comments` are seeded after the post.
 */
const POSTS = [
  {
    contentType: 'text',
    content:
      'Kicking off the new platform timeline 🎉 Full-content views, galleries, ' +
      'inline video, and live streams are all live now. #exprsn #launch',
    media: [],
    comments: ['Looks great!', 'Finally — been waiting for the detail view.'],
  },
  {
    contentType: 'image',
    content: 'Golden hour over the bay. One of those skies that doesn’t need a filter. 📷',
    media: [{ type: 'image', url: img('exprsn-sunset', 1200, 800), title: 'Golden hour' }],
    comments: ['Stunning shot.'],
  },
  {
    contentType: 'image',
    content: 'A few frames from this weekend’s trip — swipe through the gallery. 🏔️',
    media: [
      { type: 'image', url: img('exprsn-g1') },
      { type: 'image', url: img('exprsn-g2') },
      { type: 'image', url: img('exprsn-g3') },
      { type: 'image', url: img('exprsn-g4') },
      { type: 'image', url: img('exprsn-g5') },
      { type: 'image', url: img('exprsn-g6') },
    ],
    comments: ['That third one is wild.', 'Where is this?', 'Adding to my list.'],
  },
  {
    contentType: 'video',
    content: 'Short clip from the test rig — tap to play. 🎬',
    media: [
      {
        type: 'video',
        url: SAMPLE_MP4,
        thumbnailUrl: img('exprsn-video-poster', 1280, 720),
        title: 'For Bigger Joyrides',
      },
    ],
    comments: ['Smooth playback 👌'],
  },
  {
    contentType: 'video',
    content: 'We’re LIVE — join the stream and say hi in chat. 🔴 #live',
    media: [
      {
        type: 'live',
        url: SAMPLE_HLS,
        thumbnailUrl: img('exprsn-live-poster', 1280, 720),
        title: 'Live: building the timeline detail view',
      },
    ],
    comments: ['Watching now!', 'Audio is crisp.'],
  },
  {
    contentType: 'image',
    content:
      'Mixed post: a bit of text, a photo, and a clip — the renderer lays out ' +
      'live cards first, then the image/video grid below.',
    media: [
      { type: 'image', url: img('exprsn-mixed-1', 1024, 1024) },
      { type: 'image', url: img('exprsn-mixed-2', 1024, 1024) },
      {
        type: 'video',
        url: SAMPLE_MP4,
        thumbnailUrl: img('exprsn-mixed-vid', 1280, 720),
        title: 'Clip',
      },
    ],
    comments: ['Nice mix.'],
  },
];

async function discoverAuthors() {
  if (process.env.SEED_TIMELINE_USER_ID) {
    return [process.env.SEED_TIMELINE_USER_ID];
  }
  // Best-effort: borrow a few real user ids so demo posts show in Home feeds.
  try {
    const [rows] = await sequelize.query(
      'SELECT id FROM auth.users ORDER BY "createdAt" ASC LIMIT 3',
    );
    const ids = (rows || []).map((r) => r.id).filter(Boolean);
    if (ids.length) return ids;
  } catch (_) {
    // auth schema / column may differ; fall through to the fixed demo authors.
  }
  return FALLBACK_AUTHORS;
}

async function deleteDemoPosts() {
  const rows = await Post.findAll({
    where: sequelize.literal("metadata->>'seedDemo' = 'true'"),
    attributes: ['id'],
  });
  const ids = rows.map((r) => r.id);
  if (!ids.length) return 0;
  await Comment.destroy({ where: { postId: ids } });
  await Post.destroy({ where: { id: ids } });
  return ids.length;
}

async function main() {
  await sequelize.authenticate();

  const removed = await deleteDemoPosts();
  if (removed) console.log(`Removed ${removed} existing demo post(s).`);

  if (process.env.SEED_DEMO_RESET) {
    console.log('SEED_DEMO_RESET set — delete only, skipping insert.');
    await sequelize.close();
    return;
  }

  const authors = await discoverAuthors();
  console.log(`Authoring demo posts as: ${authors.join(', ')}`);

  let created = 0;
  for (let i = 0; i < POSTS.length; i++) {
    const def = POSTS[i];
    const userId = authors[i % authors.length];
    const post = await Post.create({
      userId,
      content: def.content,
      contentType: def.contentType,
      media: def.media,
      visibility: 'public',
      likeCount: 0,
      repostCount: 0,
      commentCount: def.comments ? def.comments.length : 0,
      deleted: false,
      metadata: { seedDemo: true, entities: { hashtags: [], mentions: [], urls: [] } },
    });
    created++;

    if (def.comments && def.comments.length) {
      // Comment authors rotate through the *other* discovered users for variety.
      for (let c = 0; c < def.comments.length; c++) {
        await Comment.create({
          postId: post.id,
          userId: authors[(i + c + 1) % authors.length],
          content: def.comments[c],
        });
      }
    }
  }

  console.log(`Created ${created} demo post(s) with media (images, gallery, video, live) + comments.`);
  console.log('They appear in the Global feed immediately; open one to see the full-content view.');
  await sequelize.close();
}

main().catch((err) => {
  console.error('timeline-demo seed failed:', err && err.message ? err.message : err);
  process.exit(1);
});
