'use strict';

/**
 * BUG-015 regression — the 'llm_message' content_type must be accepted
 * end-to-end so Cortex's moderatorScreen (services/cortex/src/engine/jobs.js)
 * stops being a silent no-op:
 *   1. the moderateContent Joi schema must accept contentType: 'llm_message',
 *      and
 *   2. every Sequelize model whose content_type enum is written on the cortex
 *      screen path (ModerationCase = moderation_items, plus the downstream
 *      ModerationAction / AgentExecution / Report which share the enum) must
 *      declare 'llm_message' — the live DB enum only accepts what the model
 *      declares, and the live columns were widened by migration
 *      20260713000001-add-llm-message-content-type. If a future edit drops the
 *      value from a model, this fails BEFORE the enum drift can silently disable
 *      the cortex screen again.
 *
 * Pure unit tests: Joi is exercised directly and the model ENUM values are read
 * from the model definition, so no DB / Redis is needed.
 */

const { DataTypes } = require('sequelize');
const { schemas } = require('../../middleware/validation');

function loadModelAttributes(modelPath) {
  let captured = null;
  const sequelizeStub = {
    define: (_name, attributes) => {
      captured = attributes;
      return { addHook: () => {}, prototype: {}, associate: () => {} };
    }
  };
  jest.isolateModules(() => {
    require(modelPath)(sequelizeStub, DataTypes);
  });
  return captured;
}

describe('BUG-015 — llm_message accepted across the moderation content_type path', () => {
  test('moderateContent Joi schema accepts contentType: "llm_message"', () => {
    const { error, value } = schemas.moderateContentSchema.validate({
      contentType: 'llm_message',
      contentId: 'llm-abc-123',
      sourceService: 'cortex',
      userId: '11111111-1111-1111-1111-111111111111',
      contentText: 'hello'
    });
    expect(error).toBeUndefined();
    expect(value.contentType).toBe('llm_message');
  });

  test('moderateContent Joi schema still rejects an unknown content_type', () => {
    const { error } = schemas.moderateContentSchema.validate({
      contentType: 'not-a-type',
      contentId: 'abc-123',
      sourceService: 'cortex',
      userId: '11111111-1111-1111-1111-111111111111',
      contentText: 'hello'
    });
    expect(error).toBeDefined();
  });

  test.each([
    ['ModerationCase', '../../models/ModerationCase', 'contentType'],
    ['ModerationAction', '../../models/ModerationAction', 'contentType'],
    ['AgentExecution', '../../models/AgentExecution', 'contentType'],
    ['Report', '../../models/Report', 'contentType']
  ])('%s.contentType ENUM includes llm_message', (_name, modelPath, attr) => {
    const attrs = loadModelAttributes(modelPath);
    expect(attrs[attr].type.values).toContain('llm_message');
  });
});
