'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Built-in example plugins (net-new — decisions ledger §First plugins).
 *
 * These prove the framework end-to-end without touching the moderator engines.
 * They are registered (source: 'builtin') at init when PLUGINS_ENABLED=true, but
 * are NOT auto-installed — a platform admin installs/enables them explicitly.
 *
 * One per execution kind so each path has a live demo:
 *  · welcome-flow   — declarative: greet a user's first post.
 *  · keyword-flag   — declarative: advisory flag on banned keywords.
 *  · spam-shield    — webhook:     signed outbound delivery to an external scorer.
 *  · enrich-script  — script:      sandboxed native JS, all I/O via the gateway.
 * ═══════════════════════════════════════════════════════════
 */

const WELCOME_FLOW = {
  key: 'welcome-flow',
  name: 'Welcome Flow',
  description: 'Sends an in-app welcome notification when a user creates a post.',
  version: '1.0.0',
  publisher: 'exprsn',
  kind: 'declarative',
  appliesTo: ['timeline'],
  events: ['timeline.post.created'],
  scopes: ['platform', 'user'],
  capabilities: ['read:timeline.posts', 'emit:notifications', 'emit:audit'],
  behavior: {
    match: { field: 'post.content', op: 'exists' },
    actions: [
      { type: 'notify', title: 'Thanks for posting!', body: 'Your post is live on Exprsn.', notificationType: 'info' },
      { type: 'audit', note: 'welcome notification emitted' },
    ],
  },
  surfaces: [{ type: 'admin-section', id: 'welcome-flow', title: 'Welcome Flow', path: '/admin/plugins/welcome-flow' }],
};

const KEYWORD_FLAG = {
  key: 'keyword-flag',
  name: 'Keyword Flagger',
  description: 'Advisory flag when a post contains configured banned keywords.',
  version: '1.0.0',
  publisher: 'exprsn',
  kind: 'declarative',
  appliesTo: ['timeline', 'spark'],
  events: ['timeline.post.created', 'spark.message.created'],
  scopes: ['platform'],
  capabilities: ['read:timeline.posts', 'read:spark.messages', 'emit:moderator.flag', 'emit:audit'],
  configSchema: {
    type: 'object',
    properties: { keywords: { type: 'array', items: { type: 'string' } } },
  },
  behavior: {
    match: { field: 'post.content', op: 'keywords_any', value: ['spammyword', 'buy-now', 'free-crypto'] },
    actions: [{ type: 'flag', reason: 'matched banned keyword list' }],
  },
};

const SPAM_SHIELD = {
  key: 'spam-shield',
  name: 'Spam Shield (webhook)',
  description: 'Posts content to an external spam scorer over a signed webhook.',
  version: '1.0.0',
  publisher: 'exprsn',
  kind: 'webhook',
  appliesTo: ['timeline'],
  events: ['timeline.post.created'],
  scopes: ['platform'],
  capabilities: ['read:timeline.posts', 'call:webhook'],
  endpoint: { url: 'https://hooks.example.com/spam-shield', timeoutMs: 4000 },
  surfaces: [{ type: 'admin-section', id: 'spam-shield', title: 'Spam Shield', path: '/admin/plugins/spam-shield' }],
};

const ENRICH_SCRIPT = {
  key: 'enrich-script',
  name: 'Post Enricher (sandboxed script)',
  description: 'Runs sandboxed JS to derive tags from a post; all I/O via the gateway.',
  version: '1.0.0',
  publisher: 'exprsn',
  kind: 'script',
  appliesTo: ['timeline'],
  events: ['timeline.post.created'],
  scopes: ['platform'],
  capabilities: ['read:timeline.posts', 'emit:notifications', 'call:webhook'],
  script: {
    // Untrusted JS executed in a worker-thread sandbox (no require/fs/net).
    // `ctx` is the frozen event payload; `platform` is the capability-gated host
    // API whose calls are signed + routed through the token/CA gateway.
    source: [
      'const text = (ctx.post && ctx.post.content) || "";',
      'const tags = (text.match(/#[a-z0-9_]+/gi) || []).map(t => t.toLowerCase());',
      'platform.log("derived tags: " + tags.join(", "));',
      'return { tags };',
    ].join('\n'),
    timeoutMs: 1500,
  },
};

const BUILTINS = [WELCOME_FLOW, KEYWORD_FLAG, SPAM_SHIELD, ENRICH_SCRIPT];

module.exports = { BUILTINS, WELCOME_FLOW, KEYWORD_FLAG, SPAM_SHIELD, ENRICH_SCRIPT };
