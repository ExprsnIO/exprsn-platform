'use strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.CLAUDE_API_KEY = 'sk-ant-test-dummy';

let mockResponse;
jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({
  messages: { create: jest.fn(async () => ({ content: [{ text: mockResponse }] })) },
})));
jest.mock('../src/models', () => ({ LcEntity: {}, LcRecord: {} })); // via flowActions

const aiAssist = require('../src/services/aiAssist');

describe('aiAssist.generate', () => {
  test('entity drafts validate fields and drop bad ones with warnings', async () => {
    mockResponse = JSON.stringify({
      key: 'Expense Report!',
      name: 'Expense Report',
      fields: [
        { key: 'title', label: 'Title', type: 'string', required: true },
        { key: 'amount', label: 'Amount', type: 'number', role: 'measure', aggregation: 'sum' },
        { key: 'bad', label: 'Bad', type: 'money' }, // unknown type → dropped
      ],
    });
    const { draft, warnings } = await aiAssist.generate('entity', 'track expense reports');
    expect(draft.key).toBe('expense_report_'); // sanitized identifier
    expect(draft.fields.map((f) => f.key)).toEqual(['title', 'amount']);
    expect(warnings.join(' ')).toMatch(/dropped field/);
  });

  test('flow drafts strip invalid actions, never arm themselves, and strip fences', async () => {
    mockResponse = '```json\n' + JSON.stringify({
      key: 'notify_on_post',
      name: 'Notify on post',
      trigger: { type: 'event' },
      event: 'timeline.post.created',
      actions: [
        { type: 'log', message: 'hello' },
        { type: 'launch_missiles' }, // unknown → dropped
      ],
    }) + '\n```';
    const { draft, warnings } = await aiAssist.generate('flow', 'notify me on new posts');
    expect(draft.enabled).toBe(false);
    expect(draft.actions).toHaveLength(1);
    expect(warnings.join(' ')).toMatch(/dropped action/);
  });

  test('unknown event yields a warning, bad kind and long prompts 400', async () => {
    mockResponse = JSON.stringify({ key: 'f', name: 'F', trigger: { type: 'event' }, event: 'made.up.event', actions: [] });
    const { warnings } = await aiAssist.generate('flow', 'x');
    expect(warnings.join(' ')).toMatch(/not a known hook-bus event/);
    await expect(aiAssist.generate('page', 'x')).rejects.toMatchObject({ status: 400 });
    await expect(aiAssist.generate('entity', 'y'.repeat(3000))).rejects.toMatchObject({ status: 400 });
  });

  test('503s when unconfigured', async () => {
    const key = process.env.CLAUDE_API_KEY;
    delete process.env.CLAUDE_API_KEY;
    await expect(aiAssist.generate('entity', 'x')).rejects.toMatchObject({ status: 503 });
    process.env.CLAUDE_API_KEY = key;
  });
});
