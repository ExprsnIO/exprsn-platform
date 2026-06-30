'use strict';

const { matches, evalLeaf, resolvePath } = require('../src/services/conditionEvaluator');

describe('conditionEvaluator', () => {
  const ctx = { post: { content: 'Buy NOW free crypto', userId: 'u1' }, score: 0.8, tags: ['a', 'b'] };

  test('resolvePath walks dot-paths and returns undefined for missing', () => {
    expect(resolvePath(ctx, 'post.content')).toBe('Buy NOW free crypto');
    expect(resolvePath(ctx, 'post.missing.deep')).toBeUndefined();
  });

  test('leaf operators', () => {
    expect(evalLeaf({ field: 'post.content', op: 'contains', value: 'free' }, ctx)).toBe(true);
    expect(evalLeaf({ field: 'post.content', op: 'keywords_any', value: ['crypto', 'nope'] }, ctx)).toBe(true);
    expect(evalLeaf({ field: 'score', op: 'gt', value: 0.5 }, ctx)).toBe(true);
    expect(evalLeaf({ field: 'score', op: 'lt', value: 0.5 }, ctx)).toBe(false);
    expect(evalLeaf({ field: 'tags', op: 'exists' }, ctx)).toBe(true);
    expect(evalLeaf({ field: 'post.content', op: 'matches', value: 'buy', flags: 'i' }, ctx)).toBe(true);
  });

  test('unknown operator fails closed', () => {
    expect(evalLeaf({ field: 'score', op: 'wat', value: 1 }, ctx)).toBe(false);
  });

  test('nested all/any/none trees', () => {
    expect(matches({ all: [{ field: 'score', op: 'gt', value: 0.5 }, { field: 'post.content', op: 'contains', value: 'crypto' }] }, ctx)).toBe(true);
    expect(matches({ any: [{ field: 'score', op: 'lt', value: 0.1 }, { field: 'post.content', op: 'contains', value: 'crypto' }] }, ctx)).toBe(true);
    expect(matches({ none: [{ field: 'post.content', op: 'contains', value: 'crypto' }] }, ctx)).toBe(false);
  });

  test('empty/absent match is treated as "no constraint" (matches)', () => {
    expect(matches(undefined, ctx)).toBe(true);
    expect(matches({}, ctx)).toBe(true);
  });

  test('malformed node never throws — fails closed via try/catch', () => {
    expect(() => matches({ all: 'not-an-array' }, ctx)).not.toThrow();
  });
});
