'use strict';

const { validateLayout, formFieldKeys, publicSpec } = require('../src/services/formLayout');

const entity = {
  appId: 'app-1',
  fields: [
    { key: 'name', label: 'Name', type: 'string', required: true },
    { key: 'email', label: 'Email', type: 'string' },
    { key: 'category', label: 'Category', type: 'enum', enumValues: ['bug', 'idea'] },
    { key: 'severity', label: 'Severity', type: 'enum', enumLookup: 'sev' },
    { key: 'internal_notes', label: 'Internal notes', type: 'text' },
    { key: 'score', label: 'Score', type: 'number', formula: '1 + 1' },
  ],
};

describe('validateLayout', () => {
  test('accepts string keys, objects with visibleWhen, and empty layouts', () => {
    expect(validateLayout(entity, null)).toEqual([]);
    expect(validateLayout(entity, {})).toEqual([]);
    expect(validateLayout(entity, {
      steps: true,
      sections: [
        { title: 'About you', fields: ['name', 'email'] },
        { fields: [{ key: 'category', visibleWhen: { field: 'name', op: 'exists' } }] },
      ],
    })).toEqual([]);
  });

  test('rejects unknown fields and malformed entries', () => {
    expect(validateLayout(entity, { sections: [{ fields: ['nope'] }] }).join(' ')).toMatch(/unknown field "nope"/);
    expect(validateLayout(entity, { sections: [{ fields: [42] }] }).join(' ')).toMatch(/must be a field key/);
    expect(validateLayout(entity, { sections: [{ fields: [{ key: 'name', visibleWhen: 'x' }] }] }).join(' ')).toMatch(/condition object/);
    expect(validateLayout(entity, { sections: 'x' })).toEqual(['layout.sections must be an array']);
  });
});

describe('formFieldKeys', () => {
  test('collects the exposed field whitelist', () => {
    const keys = formFieldKeys({ sections: [{ fields: ['name', { key: 'email' }] }, { fields: ['category'] }] });
    expect([...keys].sort()).toEqual(['category', 'email', 'name']);
  });
  test('empty layout exposes nothing', () => {
    expect(formFieldKeys({}).size).toBe(0);
  });
});

describe('publicSpec', () => {
  const form = {
    name: 'Feedback',
    entityKey: 'ticket',
    settings: { successMessage: 'ok' },
    layout: { sections: [{ fields: ['name', 'category', 'severity', 'score'] }] },
  };

  test('exposes only layout fields, resolves enums, and drops computed fields', () => {
    const spec = publicSpec(form, entity, { sev: [{ value: 'low' }, { value: 'high' }] });
    const keys = spec.fields.map((f) => f.key);
    expect(keys).toEqual(['name', 'category', 'severity']); // no internal_notes, no computed score
    expect(spec.fields.find((f) => f.key === 'category').options).toEqual(['bug', 'idea']);
    expect(spec.fields.find((f) => f.key === 'severity').options).toEqual(['low', 'high']);
    expect(spec.fields.find((f) => f.key === 'name').required).toBe(true);
    expect(spec.settings.successMessage).toBe('ok');
  });

  test('never leaks formulas or lookup wiring', () => {
    const spec = publicSpec(form, entity, {});
    const json = JSON.stringify(spec.fields);
    expect(json).not.toMatch(/formula/);
    expect(json).not.toMatch(/enumLookup/);
  });
});
