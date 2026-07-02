/**
 * Client-side mirror of the backend condition evaluator (plugins
 * conditionEvaluator) — used to evaluate a form field's `visibleWhen` against
 * the in-progress record values as the user types. Same semantics: groups
 * all/any/none (nestable), leaf { field, op, value }, fail-closed on malformed
 * nodes, empty/missing tree = true. The backend remains authoritative — this
 * only drives UX (show/hide), never security.
 */

type Ctx = Record<string, unknown>;

function resolvePath(ctx: Ctx, path: string): unknown {
  return String(path).split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return (acc as Ctx)[key];
  }, ctx);
}

const asString = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

interface Leaf { field?: string; op?: string; value?: unknown }

function evalLeaf(leaf: Leaf, ctx: Ctx): boolean {
  const actual = leaf.field !== undefined ? resolvePath(ctx, leaf.field) : undefined;
  const expected = leaf.value;
  switch (leaf.op) {
    case 'exists': return actual !== undefined && actual !== null && actual !== '';
    case 'not_exists': return actual === undefined || actual === null || actual === '';
    case 'equals': return actual === expected || asString(actual) === asString(expected);
    case 'not_equals': return !(actual === expected || asString(actual) === asString(expected));
    case 'contains': return asString(actual).toLowerCase().includes(asString(expected).toLowerCase());
    case 'not_contains': return !asString(actual).toLowerCase().includes(asString(expected).toLowerCase());
    case 'in': return Array.isArray(expected) && (expected.includes(actual) || expected.map(asString).includes(asString(actual)));
    case 'not_in': return Array.isArray(expected) && !(expected.includes(actual) || expected.map(asString).includes(asString(actual)));
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
    case 'length_gt': return asString(actual).length > Number(expected);
    case 'length_lt': return asString(actual).length < Number(expected);
    case 'matches':
      try { return new RegExp(asString(expected), 'i').test(asString(actual)); } catch { return false; }
    default: return false;
  }
}

export function evaluateCondition(node: unknown, ctx: Ctx): boolean {
  if (node === undefined || node === null) return true;
  if (Array.isArray(node)) return node.every((n) => evaluateCondition(n, ctx));
  if (typeof node !== 'object') return true;
  const obj = node as Record<string, unknown>;

  const results: boolean[] = [];
  if (Array.isArray(obj.all)) results.push((obj.all as unknown[]).every((n) => evaluateCondition(n, ctx)));
  if (Array.isArray(obj.any)) results.push((obj.any as unknown[]).some((n) => evaluateCondition(n, ctx)));
  if (Array.isArray(obj.none)) results.push(!(obj.none as unknown[]).some((n) => evaluateCondition(n, ctx)));
  if (obj.field !== undefined || obj.op !== undefined) results.push(evalLeaf(obj as Leaf, ctx));
  if (!results.length) return true;
  return results.every(Boolean);
}
