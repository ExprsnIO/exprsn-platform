'use strict';

const { validateRecord, validateValue, validateFieldDef } = require('../src/services/typeSystem');

const fields = [
  { key: 'title', label: 'Title', type: 'string', required: true, max: 10 },
  { key: 'count', label: 'Count', type: 'integer', role: 'measure', aggregation: 'sum', min: 0 },
  { key: 'status', label: 'Status', type: 'enum', enumValues: ['open', 'closed'], role: 'dimension' },
  { key: 'ref', label: 'Ref', type: 'reference', refEntity: 'other' },
];

describe('typeSystem', () => {
  test('validates field definitions', () => {
    expect(validateFieldDef({ key: 'ok', type: 'string' })).toEqual([]);
    expect(validateFieldDef({ key: 'bad', type: 'nope' }).length).toBeGreaterThan(0);
    expect(validateFieldDef({ key: 'e', type: 'enum' }).join(' ')).toMatch(/enumValues or enumLookup/);
  });

  test('coerces and validates a good record', () => {
    const r = validateRecord(fields, { title: 'hi', count: '5', status: 'open', ref: '550e8400-e29b-41d4-a716-446655440000' });
    expect(r.valid).toBe(true);
    expect(r.data.count).toBe(5); // coerced to integer
  });

  test('rejects required-missing, over-max, bad enum, bad reference', () => {
    expect(validateRecord(fields, { count: 1 }).valid).toBe(false); // title required
    expect(validateValue(fields[0], 'waytoolong!!!').ok).toBe(false); // max 10
    expect(validateValue(fields[2], 'invalid').ok).toBe(false); // not in enum
    expect(validateValue(fields[3], 'not-a-uuid').ok).toBe(false); // bad reference id
  });

  test('enum can draw values from a resolved lookup list', () => {
    const f = { key: 'color', type: 'enum', enumLookup: 'colors' };
    const lookups = { colors: [{ value: 'red' }, { value: 'green' }] };
    expect(validateValue(f, 'red', lookups).ok).toBe(true);
    expect(validateValue(f, 'purple', lookups).ok).toBe(false);
  });
});
