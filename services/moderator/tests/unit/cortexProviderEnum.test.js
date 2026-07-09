'use strict';

/**
 * BUG-011 regression — the 'cortex' provider must be accepted end-to-end:
 *   1. the moderateContent Joi schema must accept aiProvider: 'cortex'
 *      (otherwise an explicit per-request override 400s at the edge), and
 *   2. the Sequelize models that persist a verdict (ModerationCase.aiProvider,
 *      AIAgent.provider) must declare 'cortex' in their ENUM — the DB enum
 *      only accepts what the model declares, and the live column enum was
 *      widened by migration 20260709000001-add-cortex-ai-provider.
 *
 * Pure unit tests: Joi is exercised directly and the model ENUM values are read
 * from the model definition, so no DB / Redis is needed.
 */

const { DataTypes } = require('sequelize');
const { schemas } = require('../../middleware/validation');

// A Sequelize stub that records the attribute definitions each model declares,
// so we can assert on the ENUM without a live connection.
function loadModelAttributes(modelPath) {
  let captured = null;
  const sequelizeStub = {
    define: (_name, attributes) => {
      captured = attributes;
      // Return a minimal model-like object; the model files call a few methods
      // after define() that we don't exercise here.
      return { addHook: () => {}, prototype: {}, associate: () => {} };
    }
  };
  jest.isolateModules(() => {
    require(modelPath)(sequelizeStub, DataTypes);
  });
  return captured;
}

describe('BUG-011 — cortex accepted across the moderation write path', () => {
  test('moderateContent Joi schema accepts aiProvider: "cortex"', () => {
    const { error, value } = schemas.moderateContentSchema.validate({
      contentType: 'text',
      contentId: 'abc-123',
      sourceService: 'timeline',
      userId: '11111111-1111-1111-1111-111111111111',
      contentText: 'hello',
      aiProvider: 'cortex'
    });
    expect(error).toBeUndefined();
    expect(value.aiProvider).toBe('cortex');
  });

  test('moderateContent Joi schema still rejects an unknown provider', () => {
    const { error } = schemas.moderateContentSchema.validate({
      contentType: 'text',
      contentId: 'abc-123',
      sourceService: 'timeline',
      userId: '11111111-1111-1111-1111-111111111111',
      contentText: 'hello',
      aiProvider: 'not-a-provider'
    });
    expect(error).toBeDefined();
  });

  test('ModerationCase.aiProvider ENUM includes cortex', () => {
    const attrs = loadModelAttributes('../../models/ModerationCase');
    expect(attrs.aiProvider.type.values).toContain('cortex');
  });

  test('AIAgent.provider ENUM includes cortex', () => {
    const attrs = loadModelAttributes('../../models/AIAgent');
    expect(attrs.provider.type.values).toContain('cortex');
  });
});
