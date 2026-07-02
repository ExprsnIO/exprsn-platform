'use strict';

const { validateRecord, validateFieldDef, validateValue } = require('../src/services/typeSystem');

describe('computed (formula) fields', () => {
  const fields = [
    { key: 'price', type: 'number', required: true },
    { key: 'quantity', type: 'integer', required: true },
    { key: 'total', type: 'number', formula: 'price * quantity' },
    { key: 'label', type: 'string', formula: "'x' & quantity" },
  ];

  test('field defs validate the formula at design time', () => {
    expect(validateFieldDef({ key: 'total', type: 'number', formula: 'a * b' })).toEqual([]);
    expect(validateFieldDef({ key: 'total', type: 'number', formula: 'a *' }).join(' ')).toMatch(/invalid formula/);
    expect(validateFieldDef({ key: 'r', type: 'reference', refEntity: 'x', formula: 'a' }).join(' ')).toMatch(/cannot be computed/);
  });

  test('computed values derive from sibling fields and ignore input', () => {
    const r = validateRecord(fields, { price: '2.5', quantity: 4, total: 999, label: 'ignored' });
    expect(r.valid).toBe(true);
    expect(r.data.total).toBe(10);
    expect(r.data.label).toBe('x4');
  });

  test('missing operands coerce to 0 (spreadsheet-style)', () => {
    const f = [{ key: 'a', type: 'number' }, { key: 'c', type: 'number', formula: 'a * 2' }];
    expect(validateRecord(f, {}).data.c).toBe(0);
  });

  test('a required computed field that produces nothing errors', () => {
    const f = [{ key: 'a', type: 'string' }, { key: 'c', type: 'string', required: true, formula: 'coalesce(a)' }];
    const r = validateRecord(f, {});
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/formula produced no value/);
  });

  test('computed result must satisfy the declared type', () => {
    const f = [{ key: 's', type: 'string' }, { key: 'n', type: 'integer', formula: "'not a number'" }];
    const r = validateRecord(f, { s: 'x' });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(/computed/);
  });
});

describe('file fields', () => {
  const field = { key: 'doc', type: 'file' };
  const uuid = '550e8400-e29b-41d4-a716-446655440000';

  test('accepts { fileId } objects and normalizes bare uuid strings', () => {
    expect(validateValue(field, { fileId: uuid, name: 'a.pdf', size: 10 }).value).toEqual({ fileId: uuid, name: 'a.pdf', size: 10 });
    expect(validateValue(field, uuid).value).toEqual({ fileId: uuid });
  });

  test('rejects junk', () => {
    expect(validateValue(field, 'not-a-uuid').ok).toBe(false);
    expect(validateValue(field, { name: 'no-id.pdf' }).ok).toBe(false);
    expect(validateValue(field, 42).ok).toBe(false);
  });

  test('strips unknown keys from the stored pointer', () => {
    const v = validateValue(field, { fileId: uuid, evil: 'x' }).value;
    expect(v).toEqual({ fileId: uuid });
  });
});
