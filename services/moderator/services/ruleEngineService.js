/**
 * ═══════════════════════════════════════════════════════════
 * Rule Engine Service
 * Evaluates moderation rules and applies custom policies.
 * ═══════════════════════════════════════════════════════════
 *
 * Supports:
 *  - Nested boolean condition trees per rule — { all:[…] } (AND), { any:[…] }
 *    (OR), { none:[…] } (NOR/NOT), nestable to any depth. A node may also carry
 *    leaf conditions which are ANDed with its groups. A flat conditions object
 *    (the legacy shape) is treated as a single leaf, so old rules keep working.
 *  - Leaf conditions: per-category score min/max (incl. sentiment), overall
 *    risk min/max, keyword match (inline or via a named word list), regex,
 *    DID-method match (did:web/plc/exprsn), and content length.
 *  - Rule chaining — a child rule (parentRuleId) is only evaluated when its
 *    parent matched in the same pass. A parent flagged metadata.gate takes no
 *    terminal action itself, it only unlocks its children.
 *  - Safeguard rules — metadata.safeguard rules run first; a match EXEMPTS the
 *    content (force-approve, short-circuits everything) to guard against
 *    over-moderation / false positives.
 */

const logger = require('../src/utils/logger');

const SCORE_TYPES = ['toxicity', 'nsfw', 'spam', 'violence', 'hateSpeech', 'sentiment'];

// Small TTL cache for named word lists (stored in moderator_config as
// `wordlist:<name>` → { words: string[], mode: 'deny'|'allow' }).
const WORDLIST_TTL_MS = 30_000;
const wordlistCache = new Map(); // name → { at, words }

class RuleEngineService {
  /**
   * Evaluate all enabled rules against content + AI scores.
   * @returns {Promise<{matched, action, rule, reason, safeguard}>}
   */
  async evaluateRules(content, scores) {
    try {
      const { ModerationRule } = require('../models/sequelize-index');
      const rules = await ModerationRule.findAll({
        where: { enabled: true },
        order: [['priority', 'DESC'], ['created_at', 'ASC']]
      });

      const meta = (r) => r.metadata || {};

      // 1) Safeguard pre-pass — a matching safeguard exempts the content.
      for (const r of rules.filter((x) => meta(x).safeguard)) {
        if (await this._ruleApplies(r, content, scores)) {
          logger.info('Safeguard rule matched (content exempted)', { ruleName: r.name, contentId: content.contentId });
          return {
            matched: true,
            safeguard: true,
            action: r.action || 'approve',
            rule: this._ruleSummary(r),
            reason: `Safeguard: ${r.name}`
          };
        }
      }

      // 2) Normal walk — top-level rules (no parent), children refine.
      const normal = rules.filter((x) => !meta(x).safeguard);
      const byParent = new Map();
      for (const r of normal) {
        const key = r.parentRuleId || null;
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(r);
      }

      const winner = await this._walk(byParent.get(null) || [], byParent, content, scores);
      if (winner) {
        logger.info('Rule matched', { ruleName: winner.rule.name, action: winner.action, contentId: content.contentId });
        return { matched: true, safeguard: false, action: winner.action, rule: winner.rule, reason: `Rule: ${winner.rule.name}` };
      }

      return { matched: false, safeguard: false, rule: null, action: null, reason: null };
    } catch (error) {
      logger.error('Rule evaluation failed', { error: error.message, contentId: content && content.contentId });
      throw error;
    }
  }

  /**
   * Evaluate one rule's scope + conditions in isolation (ignores chaining and
   * other rules). Used by the rule-builder "test" affordance.
   */
  async evaluateSingleRule(rule, content, scores) {
    return this._ruleApplies(rule, content, scores);
  }

  /** Depth-first walk of a sibling set (priority order); deepest match wins. */
  async _walk(siblings, byParent, content, scores) {
    for (const r of siblings) {
      if (!(await this._ruleApplies(r, content, scores))) continue;

      const children = byParent.get(r.id);
      if (children && children.length) {
        const childWin = await this._walk(children, byParent, content, scores);
        if (childWin) return childWin;
      }

      // A gate matched but no child took over → unlock done, keep looking.
      if ((r.metadata || {}).gate) continue;

      return { action: r.action, rule: this._ruleSummary(r) };
    }
    return null;
  }

  _ruleSummary(r) {
    return { id: r.id, name: r.name, action: r.action, priority: r.priority };
  }

  /** Scope filters (appliesTo / sourceServices / thresholdScore) + condition tree. */
  async _ruleApplies(rule, content, scores) {
    if (rule.appliesTo && rule.appliesTo.length > 0 && !rule.appliesTo.includes(content.contentType)) {
      return false;
    }
    if (rule.sourceServices && rule.sourceServices.length > 0 && !rule.sourceServices.includes(content.sourceService)) {
      return false;
    }
    if (rule.thresholdScore !== null && rule.thresholdScore !== undefined) {
      if ((scores.riskScore ?? 0) < rule.thresholdScore) return false;
    }
    if (rule.conditions) {
      return this._evaluateNode(rule.conditions, content, scores);
    }
    return true;
  }

  /**
   * Recursively evaluate a condition node. Groups (all/any/none) are combined
   * with the node's own leaf conditions via AND.
   */
  async _evaluateNode(node, content, scores) {
    if (Array.isArray(node)) {
      // Bare array ⇒ AND.
      for (const n of node) if (!(await this._evaluateNode(n, content, scores))) return false;
      return true;
    }
    if (!node || typeof node !== 'object') return true;

    // Leaf part: any keys other than the group operators.
    const leafKeys = Object.keys(node).filter((k) => !['all', 'any', 'none'].includes(k));
    if (leafKeys.length > 0) {
      if (!(await this._evaluateLeaf(node, content, scores))) return false;
    }

    if (Array.isArray(node.all)) {
      for (const n of node.all) if (!(await this._evaluateNode(n, content, scores))) return false;
    }
    if (Array.isArray(node.any)) {
      let ok = node.any.length === 0;
      for (const n of node.any) { if (await this._evaluateNode(n, content, scores)) { ok = true; break; } }
      if (!ok) return false;
    }
    if (Array.isArray(node.none)) {
      for (const n of node.none) if (await this._evaluateNode(n, content, scores)) return false;
    }
    return true;
  }

  /** Evaluate a single leaf condition object (all present checks ANDed). */
  async _evaluateLeaf(c, content, scores) {
    const text = content.contentText || '';

    // Overall risk min/max
    if (c.min_risk_score !== undefined && (scores.riskScore ?? 0) < c.min_risk_score) return false;
    if (c.max_risk_score !== undefined && (scores.riskScore ?? 0) > c.max_risk_score) return false;

    // Per-category score min/max (toxicity, nsfw, spam, violence, hateSpeech, sentiment)
    for (const t of SCORE_TYPES) {
      const v = this._score(scores, t);
      if (c[`min_${t}_score`] !== undefined && v < c[`min_${t}_score`]) return false;
      if (c[`max_${t}_score`] !== undefined && v > c[`max_${t}_score`]) return false;
    }

    // Keyword match — inline list and/or named word list(s).
    if (c.keywords || c.keywords_list) {
      const inline = Array.isArray(c.keywords) ? c.keywords : c.keywords ? [c.keywords] : [];
      const fromLists = await this._loadWordLists(c.keywords_list);
      const keywords = [...inline, ...fromLists].filter(Boolean);
      if (keywords.length > 0) {
        const lower = text.toLowerCase();
        const hit = (k) => lower.includes(String(k).toLowerCase());
        const mode = c.keyword_match || 'any';
        const ok = mode === 'all' ? keywords.every(hit) : keywords.some(hit);
        if (!ok) return false;
      }
    }

    // Regex match
    if (c.regex) {
      try {
        if (!new RegExp(c.regex, c.regex_flags || 'i').test(text)) return false;
      } catch (e) {
        logger.warn('Invalid rule regex; treating as non-match', { regex: c.regex, error: e.message });
        return false;
      }
    }

    // DID-method match (did:web / did:plc / did:exprsn) for atproto-sourced content.
    if (c.did_method) {
      const want = (Array.isArray(c.did_method) ? c.did_method : [c.did_method]).map((m) => String(m).toLowerCase());
      const did = content.authorDid || (content.contentMetadata && content.contentMetadata.authorDid);
      const m = this._didMethod(did);
      if (!m || !want.includes(m)) return false;
    }

    // Content length
    if (c.min_length !== undefined && text.length < c.min_length) return false;
    if (c.max_length !== undefined && text.length > c.max_length) return false;

    return true;
  }

  _score(scores, t) {
    // Accept both `${t}Score` and `${t}` shapes.
    return scores[`${t}Score`] ?? scores[t] ?? 0;
  }

  _didMethod(did) {
    if (!did || typeof did !== 'string') return null;
    const m = /^did:([a-z0-9]+):/i.exec(did);
    return m ? m[1].toLowerCase() : null;
  }

  /** Resolve named word lists from moderator_config (cached). */
  async _loadWordLists(names) {
    if (!names) return [];
    const list = Array.isArray(names) ? names : [names];
    const out = [];
    for (const name of list) {
      const cached = wordlistCache.get(name);
      if (cached && Date.now() - cached.at < WORDLIST_TTL_MS) {
        out.push(...cached.words);
        continue;
      }
      let words = [];
      try {
        const { ModeratorConfig } = require('../models/sequelize-index');
        // Config keys must match ^[a-z_][a-z0-9_]*$ — namespace word lists as
        // `wordlist_<sanitized-name>`.
        const key = `wordlist_${String(name).replace(/[^a-z0-9_]/gi, '_')}`;
        const val = await ModeratorConfig.getConfig(key, null);
        if (val && Array.isArray(val.words)) words = val.words;
      } catch (e) {
        logger.warn('Failed to load word list', { name, error: e.message });
      }
      wordlistCache.set(name, { at: Date.now(), words });
      out.push(...words);
    }
    return out;
  }

  /** Clear the word-list cache (call after editing lists). */
  clearWordListCache() {
    wordlistCache.clear();
  }

  // ── Standalone filter helpers (used by tests / ad-hoc checks) ──────────────
  async applyKeywordFilters(text, keywords = []) {
    if (!text || keywords.length === 0) return { matched: false, keywords: [], count: 0 };
    const lower = text.toLowerCase();
    const matched = keywords.filter((k) => lower.includes(String(k).toLowerCase()));
    return { matched: matched.length > 0, keywords: matched, count: matched.length };
  }

  async applyRegexFilters(text, patterns = []) {
    if (!text || patterns.length === 0) return { matched: false, patterns: [], count: 0 };
    const matched = [];
    for (const p of patterns) {
      try {
        const re = new RegExp(p.pattern, p.flags || 'i');
        if (re.test(text)) matched.push({ pattern: p.pattern, name: p.name, matches: text.match(re) });
      } catch (e) {
        logger.error('Invalid regex pattern', { pattern: p.pattern, error: e.message });
      }
    }
    return { matched: matched.length > 0, patterns: matched, count: matched.length };
  }
}

module.exports = new RuleEngineService();
