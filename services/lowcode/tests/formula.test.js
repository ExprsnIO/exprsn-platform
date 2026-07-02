'use strict';

const { parse, evaluate } = require('../src/services/formula');

describe('formula.parse', () => {
  test('accepts valid expressions', () => {
    expect(parse('price * quantity').ok).toBe(true);
    expect(parse("if(status == 'closed', 'done', 'open')").ok).toBe(true);
    expect(parse("upper(concat(first, ' ', last))").ok).toBe(true);
    expect(parse('round(total * 0.0825, 2)').ok).toBe(true);
    expect(parse('a >= 1 and b < 2 or not c').ok).toBe(true);
  });

  test('rejects malformed expressions', () => {
    expect(parse('').ok).toBe(false);
    expect(parse('1 +').ok).toBe(false);
    expect(parse('foo(').ok).toBe(false);
    expect(parse('unknownfn(1)').ok).toBe(false);
    expect(parse("'unterminated").ok).toBe(false);
    expect(parse('a ; b').ok).toBe(false);
  });
});

describe('formula.evaluate', () => {
  test('arithmetic and precedence', () => {
    expect(evaluate('1 + 2 * 3')).toBe(7);
    expect(evaluate('(1 + 2) * 3')).toBe(9);
    expect(evaluate('10 / 4')).toBe(2.5);
    expect(evaluate('10 / 0')).toBe(null); // fail-soft, no Infinity
    expect(evaluate('-x + 5', { x: 2 })).toBe(3);
  });

  test('field references and dot paths', () => {
    expect(evaluate('price * quantity', { price: 2.5, quantity: 4 })).toBe(10);
    expect(evaluate('missing')).toBe(null);
    expect(evaluate('a.b', { a: { b: 7 } })).toBe(7);
    expect(evaluate('a.__proto__.polluted', { a: {} })).toBe(null);
  });

  test('strings: concat via & and +', () => {
    expect(evaluate("first & ' ' & last", { first: 'Ada', last: 'Lovelace' })).toBe('Ada Lovelace');
    expect(evaluate("'v' + 1")).toBe('v1');
  });

  test('comparisons and logic', () => {
    expect(evaluate('qty > 3', { qty: 5 })).toBe(true);
    expect(evaluate("status == 'open'", { status: 'open' })).toBe(true);
    expect(evaluate("'10' == 10")).toBe(true); // numeric-looking sides compare numerically
    expect(evaluate('a and b', { a: true, b: false })).toBe(false);
    expect(evaluate('a or b', { a: '', b: 'x' })).toBe('x');
    expect(evaluate('not a', { a: 0 })).toBe(true);
  });

  test('functions', () => {
    expect(evaluate("if(qty > 3, 'big', 'small')", { qty: 5 })).toBe('big');
    expect(evaluate("coalesce(missing, '', 'fallback')")).toBe('fallback');
    expect(evaluate("upper('abc')")).toBe('ABC');
    expect(evaluate('round(2.345, 2)')).toBe(2.35);
    expect(evaluate('min(3, 1, 2)')).toBe(1);
    expect(evaluate("length('abcd')")).toBe(4);
    expect(evaluate("contains('Hello World', 'world')")).toBe(true);
    expect(evaluate("year('2026-07-02')")).toBe(2026);
    expect(evaluate("days_between('2026-01-01', '2026-01-11')")).toBe(10);
  });

  test('never throws on junk', () => {
    expect(evaluate('this is (not valid')).toBe(null);
    expect(evaluate(null)).toBe(null);
  });
});
