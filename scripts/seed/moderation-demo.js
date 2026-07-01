'use strict';

/**
 * Moderation demo-data seeder.
 *
 * Populates the moderator schema with realistic demo content so the admin
 * Moderation console (Rules, AI Agents, Word Lists, Reports, Queue, Workflows)
 * has something to show:
 *   - word lists (deny/allow) in moderator_config
 *   - moderation rules incl. a safeguard, a gate + chained children, a nested
 *     boolean tree, sentiment/regex/did-method/word-list conditions
 *   - dummy AI agents (text/image/video/spam/rate-limit)
 *   - content reports (varied reasons/statuses)
 *   - moderation cases + review-queue items (pending review)
 *   - workflows (stored in moderator_config; surfaced via the local fallback in
 *     workflowIntegration.listActiveWorkflows since no external Workflow service
 *     is deployed)
 *
 * Idempotent: rules are tagged metadata.seedDemo=true; reports/cases use a
 * `demo-` contentId prefix; word lists + workflows use fixed keys. Each run
 * deletes prior demo rows then re-inserts.
 *
 * Usage:
 *   node scripts/seed/moderation-demo.js
 *   SEED_DEMO_RESET=1 node scripts/seed/moderation-demo.js   # delete only
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_seed_dummy';
require('dotenv').config({ path: path.join(ROOT, '.env') });

const models = require(path.join(ROOT, 'services/moderator/models/sequelize-index'));
const { ModerationRule, Report, AIAgent, ModerationCase, ReviewQueue, ModeratorConfig } = models;
const sequelize = models.sequelize;
const { Op } = require('sequelize');
let ruleEngine;
try {
  ruleEngine = require(path.join(ROOT, 'services/moderator/services/ruleEngineService'));
} catch (_) { /* optional */ }

// Stable demo actor ids (real tester/sparkverify ids + fixed demo uuids).
const U = {
  tester: '3182a6c6-dcbb-49bf-8773-9f6e6c4fae72',
  sv: 'f089f956-e08d-4ffa-be0b-9b0083e45c16',
  a: '00000000-0000-4000-8000-00000000d0a1',
  b: '00000000-0000-4000-8000-00000000d0b2',
  c: '00000000-0000-4000-8000-00000000d0c3'
};

const now = Date.now();
const ago = (mins) => now - mins * 60_000;

// ── Word lists (moderator_config: wordlist_<name>) ───────────────────────────
const WORD_LISTS = [
  { name: 'slurs', mode: 'deny', words: ['slur_placeholder_1', 'slur_placeholder_2', 'badword'] },
  { name: 'spam_phrases', mode: 'deny', words: ['free money', 'click here', 'buy now', 'crypto giveaway', 'dm me to earn'] },
  { name: 'brand_safe', mode: 'allow', words: ['exprsn', 'official', 'verified-partner'] }
];

// ── Workflows (moderator_config category 'workflows') ────────────────────────
const WORKFLOWS = [
  { id: 'wf-auto-moderate', name: 'Auto-moderate new posts', description: 'AI-analyze → apply rules → route to queue on new content.', enabled: true, trigger: 'event: content_submitted', steps: ['ai_analyze', 'apply_rules', 'route_to_queue'], tags: ['moderation'] },
  { id: 'wf-report-triage', name: 'Report triage', description: 'When a user report arrives, score it and open a case for senior review.', enabled: true, trigger: 'event: report_created', steps: ['score_report', 'open_case', 'notify_moderators'], tags: ['moderation', 'reports'] },
  { id: 'wf-appeal-review', name: 'Appeal review', description: 'Route appeals to a moderator and negate atproto labels on approval.', enabled: false, trigger: 'event: appeal_submitted', steps: ['assign_moderator', 'review', 'negate_labels_if_approved'], tags: ['moderation', 'appeals'] }
];

// ── AI agents (ai_agents) ────────────────────────────────────────────────────
const AGENTS = [
  { name: 'Text Toxicity (Claude)', description: 'Primary text moderation — toxicity, hate, sentiment.', type: 'text_moderation', status: 'active', provider: 'claude', model: 'claude-sonnet-4-6', promptTemplate: 'Analyze content for toxicity, hate speech, violence, NSFW, spam and sentiment (0-100 each).', config: { temperature: 0.3 }, thresholdScores: { toxicity: 70, hateSpeech: 65, sentiment: 80 }, appliesTo: ['text', 'post', 'comment', 'message'], priority: 90, enabled: true, autoAction: true },
  { name: 'Image Safety (OpenAI)', description: 'Vision moderation for NSFW/violence in images.', type: 'image_moderation', status: 'active', provider: 'openai', model: 'gpt-4o', config: {}, thresholdScores: { nsfw: 60, violence: 70 }, appliesTo: ['image', 'post'], priority: 80, enabled: true, autoAction: false },
  { name: 'Video Scan (DeepSeek)', description: 'Frame + transcript scan for video.', type: 'video_moderation', status: 'inactive', provider: 'deepseek', model: 'deepseek-chat', config: {}, thresholdScores: { nsfw: 65, violence: 70 }, appliesTo: ['video'], priority: 60, enabled: false, autoAction: false },
  { name: 'Spam Detector (local)', description: 'Heuristic spam scoring.', type: 'spam_detection', status: 'active', provider: 'local', model: null, config: {}, thresholdScores: { spam: 70 }, appliesTo: ['post', 'comment', 'message'], priority: 70, enabled: true, autoAction: true },
  { name: 'Rate-limit Guard', description: 'Flags burst posting per user.', type: 'rate_limit_detection', status: 'active', provider: 'local', model: null, config: { limits: { posts_per_minute: 5, comments_per_minute: 10, messages_per_minute: 20 } }, thresholdScores: {}, appliesTo: ['post', 'comment', 'message'], priority: 50, enabled: true, autoAction: false }
];

// ── Reports (reports) — contentId prefixed `demo-` ───────────────────────────
const REPORTS = [
  { contentType: 'post', sourceService: 'timeline', contentId: 'demo-rep-1', reportedBy: U.a, reason: 'spam', details: 'Repeated crypto giveaway spam.', status: 'open' },
  { contentType: 'comment', sourceService: 'timeline', contentId: 'demo-rep-2', reportedBy: U.b, reason: 'harassment', details: 'Targeted insults in replies.', status: 'investigating' },
  { contentType: 'message', sourceService: 'spark', contentId: 'demo-rep-3', reportedBy: U.tester, reason: 'hate_speech', details: 'Slur directed at a group.', status: 'open' },
  { contentType: 'post', sourceService: 'bluesky', contentId: 'demo-rep-4', reportedBy: U.c, reason: 'misinformation', details: 'False medical claims.', status: 'escalated' },
  { contentType: 'image', sourceService: 'timeline', contentId: 'demo-rep-5', reportedBy: U.a, reason: 'nsfw', details: 'Explicit image on a public post.', status: 'resolved' },
  { contentType: 'profile', sourceService: 'auth', contentId: 'demo-rep-6', reportedBy: U.b, reason: 'personal_info', details: 'Doxxing in bio.', status: 'dismissed' }
];

// ── Moderation cases + review queue (moderation_items / review_queue) ────────
const CASES = [
  { contentType: 'post', sourceService: 'bluesky', contentId: 'demo-case-1', userId: U.a, contentText: 'You people are the worst, get out.', scores: { toxicityScore: 88, hateSpeechScore: 72, sentimentScore: 90 }, riskScore: 84, riskLevel: 'high', status: 'reviewing', action: 'require_review', requiresReview: true, priority: 84, escalated: false },
  { contentType: 'comment', sourceService: 'timeline', contentId: 'demo-case-2', userId: U.b, contentText: 'free money click here buy now', scores: { spamScore: 92, sentimentScore: 40 }, riskScore: 70, riskLevel: 'medium', status: 'flagged', action: 'flag', requiresReview: true, priority: 70, escalated: false },
  { contentType: 'image', sourceService: 'timeline', contentId: 'demo-case-3', userId: U.c, contentText: null, scores: { nsfwScore: 95, violenceScore: 20 }, riskScore: 90, riskLevel: 'critical', status: 'escalated', action: 'hide', requiresReview: true, priority: 95, escalated: true },
  { contentType: 'message', sourceService: 'spark', contentId: 'demo-case-4', userId: U.a, contentText: 'meet me later', scores: { toxicityScore: 8, sentimentScore: 35 }, riskScore: 12, riskLevel: 'low', status: 'approved', action: 'approve', requiresReview: false, priority: 12, escalated: false },
  { contentType: 'post', sourceService: 'bluesky', contentId: 'demo-case-5', userId: U.b, contentText: 'Threats of violence against the event.', scores: { violenceScore: 86, toxicityScore: 64, sentimentScore: 80 }, riskScore: 82, riskLevel: 'high', status: 'reviewing', action: 'require_review', requiresReview: true, priority: 82, escalated: false },
  { contentType: 'comment', sourceService: 'timeline', contentId: 'demo-case-6', userId: U.c, contentText: 'mildly negative but fine', scores: { sentimentScore: 78, toxicityScore: 30 }, riskScore: 45, riskLevel: 'medium', status: 'pending', action: 'approve', requiresReview: false, priority: 45, escalated: false }
];

async function clean() {
  // review_queue rows for demo cases, then the cases
  const demoCases = await ModerationCase.findAll({ where: { contentId: { [Op.like]: 'demo-%' } }, attributes: ['id'] });
  const caseIds = demoCases.map((c) => c.id);
  if (caseIds.length) await ReviewQueue.destroy({ where: { moderationItemId: caseIds } });
  await ModerationCase.destroy({ where: { contentId: { [Op.like]: 'demo-%' } } });
  await Report.destroy({ where: { contentId: { [Op.like]: 'demo-%' } } });
  await ModerationRule.destroy({ where: sequelize.literal("metadata->>'seedDemo' = 'true'") });
  await AIAgent.destroy({ where: { name: AGENTS.map((a) => a.name) } });
  await ModeratorConfig.destroy({ where: { key: WORD_LISTS.map((w) => `wordlist_${w.name}`) } });
  await ModeratorConfig.destroy({ where: { category: 'workflows' } });
}

async function main() {
  await sequelize.authenticate();
  await clean();

  if (process.env.SEED_DEMO_RESET) {
    console.log('SEED_DEMO_RESET set — demo moderation data removed; skipping insert.');
    await sequelize.close();
    return;
  }

  // Word lists
  for (const w of WORD_LISTS) await ModeratorConfig.setConfig(`wordlist_${w.name}`, { words: w.words, mode: w.mode }, 'advanced', null);
  if (ruleEngine && ruleEngine.clearWordListCache) ruleEngine.clearWordListCache();

  // Workflows
  for (const wf of WORKFLOWS) await ModeratorConfig.setConfig(`workflow_${wf.id.replace(/[^a-z0-9_]/gi, '_')}`, wf, 'workflows', null);

  // Agents
  for (const a of AGENTS) await AIAgent.create(a);

  // Reports
  for (let i = 0; i < REPORTS.length; i++) {
    await Report.create({ ...REPORTS[i], submittedAt: ago(20 + i * 15) });
  }

  // Rules (safeguard, gate+children, nested, sentiment, regex, did-method, word lists)
  const mk = (r) => ModerationRule.create({ enabled: true, ...r, metadata: { ...(r.metadata || {}), seedDemo: true } });
  await mk({ name: 'demo:Slur filter → remove', description: 'Any listed slur removes the content.', action: 'remove', priority: 95, conditions: { keywords_list: 'slurs' }, appliesTo: ['post', 'comment', 'message'] });
  await mk({ name: 'demo:Trusted partners exempt', description: 'Verified partners are never auto-actioned.', action: 'approve', priority: 100, conditions: { keywords_list: 'brand_safe' }, metadata: { safeguard: true } });
  const gate = await mk({ name: 'demo:Bluesky firehose gate', description: 'Gate: only evaluate children for bluesky posts.', action: 'flag', priority: 80, sourceServices: ['bluesky'], appliesTo: ['post'], conditions: {}, metadata: { gate: true } });
  await mk({ name: 'demo:↳ Bluesky high toxicity → hide', description: 'Child of the bluesky gate.', action: 'hide', priority: 70, parentRuleId: gate.id, conditions: { min_toxicity_score: 80 } });
  await mk({ name: 'demo:↳ Bluesky spam phrases → warn', description: 'Child of the bluesky gate.', action: 'warn', priority: 60, parentRuleId: gate.id, conditions: { keywords_list: 'spam_phrases' } });
  await mk({ name: 'demo:Harsh but not satire', description: 'Nested: (toxicity≥70 OR hate≥60) AND NOT satire.', action: 'flag', priority: 55, conditions: { all: [{ any: [{ min_toxicity_score: 70 }, { min_hateSpeech_score: 60 }] }, { none: [{ keywords: ['satire', '/s'] }] }] } });
  await mk({ name: 'demo:Very negative sentiment → review', description: 'Sentiment ≥ 85 (very negative) goes to review.', action: 'require_review', priority: 40, conditions: { min_sentiment_score: 85 } });
  await mk({ name: 'demo:Contact-info leak → flag', description: 'Phone-number regex in comments/messages.', action: 'flag', priority: 45, appliesTo: ['comment', 'message'], conditions: { regex: '\\b\\d{3}[- .]?\\d{3}[- .]?\\d{4}\\b' } });
  await mk({ name: 'demo:Untrusted did:web spam → review', description: 'did:web authors with spam signal.', action: 'require_review', priority: 30, sourceServices: ['bluesky'], conditions: { did_method: ['web'], min_spam_score: 50 } });
  await mk({ name: 'demo:High NSFW → hide', description: 'NSFW ≥ 80 on visual content.', action: 'hide', priority: 50, appliesTo: ['image', 'video', 'post'], conditions: { min_nsfw_score: 80 } });

  // Cases + review queue
  for (const c of CASES) {
    const item = await ModerationCase.create({
      contentType: c.contentType,
      contentId: c.contentId,
      sourceService: c.sourceService,
      userId: c.userId,
      contentText: c.contentText,
      riskScore: c.riskScore,
      riskLevel: c.riskLevel,
      toxicityScore: c.scores.toxicityScore ?? 0,
      nsfwScore: c.scores.nsfwScore ?? 0,
      spamScore: c.scores.spamScore ?? 0,
      violenceScore: c.scores.violenceScore ?? 0,
      hateSpeechScore: c.scores.hateSpeechScore ?? 0,
      sentimentScore: c.scores.sentimentScore ?? 50,
      aiProvider: 'claude',
      aiModel: 'claude-sonnet-4-6',
      status: c.status,
      action: c.action,
      requiresReview: c.requiresReview,
      submittedAt: ago(60),
      processedAt: ago(59)
    });
    if (c.requiresReview) {
      await ReviewQueue.create({
        moderationItemId: item.id,
        priority: c.priority,
        escalated: c.escalated,
        escalatedReason: c.escalated ? 'High risk score' : null,
        status: 'pending',
        queuedAt: ago(58)
      });
    }
  }

  console.log(`Seeded: ${WORD_LISTS.length} word lists, ${WORKFLOWS.length} workflows, ${AGENTS.length} agents, ${REPORTS.length} reports, 10 rules, ${CASES.length} cases (${CASES.filter((c) => c.requiresReview).length} queued).`);
  await sequelize.close();
}

main().catch((err) => {
  console.error('moderation-demo seed failed:', err && err.message ? err.message : err);
  if (err && err.errors) console.error(err.errors.map((e) => e.message));
  process.exit(1);
});
