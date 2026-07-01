'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Condition-tree evaluator for declarative plugins (and low-code flows).
 *
 * Generalizes the moderator rule engine's nested boolean tree
 * (services/moderator/services/ruleEngineService.js) to evaluate against an
 * arbitrary event context instead of fixed AI scores:
 *
 *   { all:[…] } (AND) · { any:[…] } (OR) · { none:[…] } (NOR), nestable; a node
 *   may also carry leaf conditions which are ANDed with its groups.
 *
 * A leaf is `{ field, op, value }` where `field` is a dot-path into the context
 * (e.g. "post.content", "user.id"). Pure, synchronous, side-effect free, and it
 * never throws — a malformed node evaluates to `false` (fail-closed) so a bad
 * manifest can't crash dispatch.
 * ═══════════════════════════════════════════════════════════
 */

const GROUP_KEYS = ['all', 'any', 'none'];

/** Resolve a dot-path against the context, returning undefined if absent. */
function resolvePath(ctx, path) {
  if (!path) return undefined;
  return String(path).split('.').reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return acc[key];
  }, ctx);
}

function asString(v) {
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v : String(v);
}

function evalLeaf(leaf, ctx) {
  const actual = resolvePath(ctx, leaf.field);
  const expected = leaf.value;
  switch (leaf.op) {
    case 'exists': return actual !== undefined && actual !== null;
    case 'not_exists': return actual === undefined || actual === null;
    case 'equals': return actual === expected;
    case 'not_equals': return actual !== expected;
    case 'contains': return asString(actual).toLowerCase().includes(asString(expected).toLowerCase());
    case 'not_contains': return !asString(actual).toLowerCase().includes(asString(expected).toLowerCase());
    case 'in': return Array.isArray(expected) && expected.includes(actual);
    case 'not_in': return Array.isArray(expected) && !expected.includes(actual);
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'length_gt': return asString(actual).length > Number(expected);
    case 'length_lt': return asString(actual).length < Number(expected);
    case 'matches':
      try { return new RegExp(expected, leaf.flags || 'i').test(asString(actual)); }
      catch { return false; }
    case 'keywords_any': {
      const list = Array.isArray(expected) ? expected : [expected];
      const hay = asString(actual).toLowerCase();
      return list.some((k) => hay.includes(asString(k).toLowerCase()));
    }
    case 'keywords_all': {
      const list = Array.isArray(expected) ? expected : [expected];
      const hay = asString(actual).toLowerCase();
      return list.every((k) => hay.includes(asString(k).toLowerCase()));
    }
    default:
      return false; // unknown operator ⇒ fail-closed
  }
}

/** Recursively evaluate a node. Empty/missing node ⇒ matches (no constraint). */
function evaluateNode(node, ctx) {
  if (node === undefined || node === null) return true;
  if (Array.isArray(node)) {
    // Bare array ⇒ AND.
    return node.every((n) => evaluateNode(n, ctx));
  }
  if (typeof node !== 'object') return true;

  // Leaf part: a node with `op` is itself a leaf.
  if (node.op || node.field) {
    if (!evalLeaf(node, ctx)) return false;
  }

  if (Array.isArray(node.all)) {
    if (!node.all.every((n) => evaluateNode(n, ctx))) return false;
  }
  if (Array.isArray(node.any)) {
    if (node.any.length > 0 && !node.any.some((n) => evaluateNode(n, ctx))) return false;
  }
  if (Array.isArray(node.none)) {
    if (node.none.some((n) => evaluateNode(n, ctx))) return false;
  }
  // A node with none of the recognised keys is treated as "no constraint".
  void GROUP_KEYS;
  return true;
}

/**
 * Evaluate a behavior `match` tree against an event context.
 * @returns {boolean} whether the plugin should act on this event.
 */
function matches(matchTree, ctx) {
  try {
    return evaluateNode(matchTree, ctx);
  } catch {
    return false; // never throw into the hook bus
  }
}

module.exports = { matches, evaluateNode, evalLeaf, resolvePath };
