'use strict';

const { toCsv, parseCsv } = require('../src/services/csv');

describe('csv', () => {
  test('round-trips plain rows', () => {
    const columns = [{ key: 'name' }, { key: 'qty' }];
    const out = toCsv(columns, [{ name: 'apple', qty: 3 }, { name: 'pear', qty: 5 }]);
    const back = parseCsv(out);
    expect(back.headers).toEqual(['name', 'qty']);
    expect(back.rows).toEqual([{ name: 'apple', qty: '3' }, { name: 'pear', qty: '5' }]);
  });

  test('quotes commas, quotes and newlines', () => {
    const out = toCsv([{ key: 'a' }, { key: 'b' }], [{ a: 'x,y', b: 'he said "hi"\nbye' }]);
    const back = parseCsv(out);
    expect(back.rows[0]).toEqual({ a: 'x,y', b: 'he said "hi"\nbye' });
  });

  test('serializes objects as JSON and empty for null', () => {
    const out = toCsv([{ key: 'a' }, { key: 'b' }], [{ a: { x: 1 }, b: null }]);
    expect(out.split('\r\n')[1]).toBe('"{""x"":1}",');
  });

  test('uses labels for headers when provided', () => {
    const out = toCsv([{ key: 'name', label: 'Full Name' }], [{ name: 'ann' }]);
    expect(out.startsWith('Full Name')).toBe(true);
  });

  test('parses CRLF and skips blank trailing lines', () => {
    const back = parseCsv('a,b\r\n1,2\r\n\r\n');
    expect(back.rows).toEqual([{ a: '1', b: '2' }]);
  });

  test('empty input yields no rows', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });
});
