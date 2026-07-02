'use strict';

/**
 * ═══════════════════════════════════════════════════════════
 * Formula engine for computed entity fields.
 *
 * A small, safe expression language (no eval, no prototype access, no user JS):
 *
 *   price * quantity
 *   if(status == 'closed', 'done', 'open')
 *   upper(concat(first_name, ' ', last_name))
 *   round(total * 0.0825, 2)
 *
 * Grammar (recursive descent):
 *   or    := and (('||'|'or') and)*
 *   and   := not (('&&'|'and') not)*
 *   not   := ('!'|'not') not | cmp
 *   cmp   := add (('=='|'='|'!='|'<'|'<='|'>'|'>=') add)?
 *   add   := mul (('+'|'-'|'&') mul)*        & = string concat
 *   mul   := unary (('*'|'/'|'%') unary)*
 *   unary := '-' unary | primary
 *   primary := number | 'string' | "string" | true|false|null
 *            | ident['.'ident…]              (dot-path into the record data)
 *            | ident '(' args ')'            (whitelisted functions only)
 *            | '(' or ')'
 *
 * `parse()` returns { ok, ast|error } so the design API can reject a bad
 * formula at authoring time; `evaluate()` never throws — any runtime error
 * yields null (fail-soft, mirroring the condition evaluator's fail-closed).
 * ═══════════════════════════════════════════════════════════
 */

const MAX_LENGTH = 2000;

const FUNCTIONS = {
  if: (c, a, b) => (truthy(c) ? a : b !== undefined ? b : null),
  coalesce: (...args) => { for (const a of args) if (a !== null && a !== undefined && a !== '') return a; return null; },
  concat: (...args) => args.map(str).join(''),
  upper: (s) => str(s).toUpperCase(),
  lower: (s) => str(s).toLowerCase(),
  trim: (s) => str(s).trim(),
  length: (s) => (Array.isArray(s) ? s.length : str(s).length),
  contains: (s, sub) => str(s).toLowerCase().includes(str(sub).toLowerCase()),
  substring: (s, start, end) => str(s).substring(num(start), end === undefined ? undefined : num(end)),
  replace: (s, find, repl) => str(s).split(str(find)).join(str(repl)),
  round: (n, d) => { const p = 10 ** (num(d) || 0); return Math.round(num(n) * p) / p; },
  floor: (n) => Math.floor(num(n)),
  ceil: (n) => Math.ceil(num(n)),
  abs: (n) => Math.abs(num(n)),
  min: (...args) => Math.min(...args.map(num)),
  max: (...args) => Math.max(...args.map(num)),
  number: (v) => num(v),
  string: (v) => str(v),
  now: () => new Date().toISOString(),
  today: () => new Date().toISOString().slice(0, 10),
  year: (d) => datePart(d, 'y'),
  month: (d) => datePart(d, 'm'),
  day: (d) => datePart(d, 'd'),
  days_between: (a, b) => {
    const ms = Date.parse(str(b)) - Date.parse(str(a));
    return Number.isNaN(ms) ? null : Math.round(ms / 86400000);
  },
};

function str(v) { return v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function truthy(v) { return !(v === null || v === undefined || v === false || v === 0 || v === ''); }
function datePart(d, part) {
  const t = new Date(str(d));
  if (Number.isNaN(t.getTime())) return null;
  if (part === 'y') return t.getUTCFullYear();
  if (part === 'm') return t.getUTCMonth() + 1;
  return t.getUTCDate();
}

// ── Tokenizer ────────────────────────────────────────────────────────────────
const TWO_CHAR = new Set(['==', '!=', '<=', '>=', '&&', '||']);
const ONE_CHAR = new Set(['+', '-', '*', '/', '%', '(', ')', ',', '<', '>', '=', '!', '&']);

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      const raw = src.slice(i, j);
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`bad number "${raw}"`);
      tokens.push({ t: 'num', v: n }); i = j; continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1; let out = '';
      while (j < src.length && src[j] !== ch) { out += src[j]; j += 1; }
      if (j >= src.length) throw new Error('unterminated string');
      tokens.push({ t: 'str', v: out }); i = j + 1; continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[a-zA-Z0-9_.]/.test(src[j])) j += 1;
      tokens.push({ t: 'ident', v: src.slice(i, j) }); i = j; continue;
    }
    const two = src.slice(i, i + 2);
    if (TWO_CHAR.has(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if (ONE_CHAR.has(ch)) { tokens.push({ t: 'op', v: ch }); i += 1; continue; }
    throw new Error(`unexpected character "${ch}"`);
  }
  return tokens;
}

// ── Parser ───────────────────────────────────────────────────────────────────
function parseTokens(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const eatOp = (v) => { const t = peek(); if (t && t.t === 'op' && t.v === v) { pos += 1; return true; } return false; };
  const isIdent = (t, v) => t && t.t === 'ident' && t.v === v;

  function parseOr() {
    let left = parseAnd();
    while ((peek() && peek().t === 'op' && peek().v === '||') || isIdent(peek(), 'or')) {
      next(); left = { k: 'or', l: left, r: parseAnd() };
    }
    return left;
  }
  function parseAnd() {
    let left = parseNot();
    while ((peek() && peek().t === 'op' && peek().v === '&&') || isIdent(peek(), 'and')) {
      next(); left = { k: 'and', l: left, r: parseNot() };
    }
    return left;
  }
  function parseNot() {
    if ((peek() && peek().t === 'op' && peek().v === '!') || isIdent(peek(), 'not')) {
      next(); return { k: 'not', v: parseNot() };
    }
    return parseCmp();
  }
  function parseCmp() {
    const left = parseAdd();
    const t = peek();
    if (t && t.t === 'op' && ['==', '=', '!=', '<', '<=', '>', '>='].includes(t.v)) {
      next(); return { k: 'cmp', op: t.v === '=' ? '==' : t.v, l: left, r: parseAdd() };
    }
    return left;
  }
  function parseAdd() {
    let left = parseMul();
    for (;;) {
      const t = peek();
      if (t && t.t === 'op' && ['+', '-', '&'].includes(t.v)) { next(); left = { k: 'bin', op: t.v, l: left, r: parseMul() }; }
      else return left;
    }
  }
  function parseMul() {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (t && t.t === 'op' && ['*', '/', '%'].includes(t.v)) { next(); left = { k: 'bin', op: t.v, l: left, r: parseUnary() }; }
      else return left;
    }
  }
  function parseUnary() {
    if (eatOp('-')) return { k: 'neg', v: parseUnary() };
    return parsePrimary();
  }
  function parsePrimary() {
    const t = next();
    if (!t) throw new Error('unexpected end of formula');
    if (t.t === 'num') return { k: 'lit', v: t.v };
    if (t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'op' && t.v === '(') {
      const inner = parseOr();
      if (!eatOp(')')) throw new Error('missing )');
      return inner;
    }
    if (t.t === 'ident') {
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (t.v === 'null') return { k: 'lit', v: null };
      if (eatOp('(')) {
        const name = t.v.toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(FUNCTIONS, name)) throw new Error(`unknown function "${t.v}"`);
        const args = [];
        if (!eatOp(')')) {
          for (;;) {
            args.push(parseOr());
            if (eatOp(',')) continue;
            if (eatOp(')')) break;
            throw new Error('missing ) in function call');
          }
        }
        return { k: 'call', name, args };
      }
      return { k: 'ref', path: t.v };
    }
    throw new Error(`unexpected token "${t.v}"`);
  }

  const ast = parseOr();
  if (pos < tokens.length) throw new Error(`unexpected trailing "${tokens[pos].v}"`);
  return ast;
}

/** Parse a formula. Returns { ok:true, ast } or { ok:false, error }. */
function parse(src) {
  try {
    if (typeof src !== 'string' || !src.trim()) return { ok: false, error: 'formula is empty' };
    if (src.length > MAX_LENGTH) return { ok: false, error: `formula exceeds ${MAX_LENGTH} chars` };
    return { ok: true, ast: parseTokens(tokenize(src)) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ── Evaluator ────────────────────────────────────────────────────────────────
function resolvePath(ctx, path) {
  return String(path).split('.').reduce((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
    return acc[key];
  }, ctx);
}

function evalNode(node, ctx) {
  switch (node.k) {
    case 'lit': return node.v;
    case 'ref': { const v = resolvePath(ctx, node.path); return v === undefined ? null : v; }
    case 'neg': return -num(evalNode(node.v, ctx));
    case 'not': return !truthy(evalNode(node.v, ctx));
    case 'and': return truthy(evalNode(node.l, ctx)) ? evalNode(node.r, ctx) : false;
    case 'or': { const l = evalNode(node.l, ctx); return truthy(l) ? l : evalNode(node.r, ctx); }
    case 'cmp': {
      let l = evalNode(node.l, ctx);
      let r = evalNode(node.r, ctx);
      // Compare numerically when both sides look numeric, else as strings.
      const ln = Number(l); const rn = Number(r);
      const numeric = l !== null && r !== null && l !== '' && r !== '' && Number.isFinite(ln) && Number.isFinite(rn) && typeof l !== 'boolean' && typeof r !== 'boolean';
      if (numeric) { l = ln; r = rn; }
      else if (node.op === '==' || node.op === '!=') { /* raw compare below */ }
      else { l = str(l); r = str(r); }
      switch (node.op) {
        case '==': return l === r;
        case '!=': return l !== r;
        case '<': return l < r;
        case '<=': return l <= r;
        case '>': return l > r;
        case '>=': return l >= r;
        default: return false;
      }
    }
    case 'bin': {
      const l = evalNode(node.l, ctx);
      const r = evalNode(node.r, ctx);
      switch (node.op) {
        case '&': return str(l) + str(r);
        case '+': return typeof l === 'string' || typeof r === 'string' ? str(l) + str(r) : num(l) + num(r);
        case '-': return num(l) - num(r);
        case '*': return num(l) * num(r);
        case '/': { const d = num(r); return d === 0 ? null : num(l) / d; }
        case '%': { const d = num(r); return d === 0 ? null : num(l) % d; }
        default: return null;
      }
    }
    case 'call': return FUNCTIONS[node.name](...node.args.map((a) => evalNode(a, ctx)));
    default: return null;
  }
}

/**
 * Evaluate a formula (source string or pre-parsed AST) against a context of
 * field values. Never throws — errors evaluate to null.
 */
function evaluate(srcOrAst, ctx = {}) {
  try {
    const ast = typeof srcOrAst === 'string'
      ? (() => { const p = parse(srcOrAst); if (!p.ok) return null; return p.ast; })()
      : srcOrAst;
    if (!ast) return null;
    const out = evalNode(ast, ctx);
    return out === undefined ? null : out;
  } catch {
    return null;
  }
}

module.exports = { parse, evaluate, FUNCTIONS: Object.keys(FUNCTIONS) };
