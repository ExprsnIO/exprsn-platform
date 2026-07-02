'use strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.MODERATOR_SERVICE_URL = 'https://svc.test/moderator';
process.env.TIMELINE_SERVICE_URL = 'https://svc.test/timeline';
process.env.FILEVAULT_SERVICE_URL = 'https://svc.test/filevault';

jest.mock('axios');
const axios = require('axios');
const providers = require('../src/services/lookupProviders');

beforeEach(() => { jest.clearAllMocks(); providers._cache.clear(); });

describe('cross-module lookup providers (HTTP, normalized)', () => {
  test('registry now includes the module read providers', () => {
    const keys = providers.listProviders().map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(['moderator.queues', 'timeline.topics', 'filevault.files']));
  });

  test('moderator.queues normalizes {queues:[{name}]} and string entries', async () => {
    axios.get.mockResolvedValue({ data: { queues: [{ name: 'ingest' }, 'review'] } });
    const values = await providers.resolveProvider({ provider: 'moderator.queues' }, {});
    expect(values).toEqual([{ value: 'ingest', label: 'ingest' }, { value: 'review', label: 'review' }]);
    expect(axios.get.mock.calls[0][0]).toBe('https://svc.test/moderator/api/queues');
  });

  test('timeline.topics labels include a trend score when present', async () => {
    axios.get.mockResolvedValue({ data: { topics: [{ topic: 'ai', trendScore: 42 }, 'news'] } });
    const values = await providers.resolveProvider({ provider: 'timeline.topics' }, {});
    expect(values).toEqual([{ value: 'ai', label: 'ai (42)' }, { value: 'news', label: 'news' }]);
  });

  test('filevault.files forwards the caller bearer when given', async () => {
    axios.get.mockResolvedValue({ data: { files: [{ id: 'f1', name: 'a.json' }] } });
    const values = await providers.resolveProvider({ provider: 'filevault.files' }, { authorization: 'Bearer u' });
    expect(values).toEqual([{ value: 'f1', label: 'a.json' }]);
    expect(axios.get.mock.calls[0][1].headers.Authorization).toBe('Bearer u');
  });

  test('a provider HTTP failure degrades to []', async () => {
    axios.get.mockRejectedValue(new Error('503'));
    expect(await providers.resolveProvider({ provider: 'moderator.queues' }, {})).toEqual([]);
  });
});
