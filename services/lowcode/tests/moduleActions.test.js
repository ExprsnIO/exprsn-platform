'use strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.TIMELINE_SERVICE_URL = 'https://svc.test/timeline';
process.env.MODERATOR_SERVICE_URL = 'https://svc.test/moderator';

jest.mock('axios');
const axios = require('axios');
const moduleActions = require('../src/services/moduleActions');

beforeEach(() => jest.clearAllMocks());

describe('moduleActions capability gating', () => {
  test('exposes the write action types + their required capabilities', () => {
    expect(moduleActions.actionTypes()).toEqual(expect.arrayContaining(['post_timeline', 'send_spark', 'post_nexus', 'enqueue_job', 'write_file', 'read_secret']));
    expect(moduleActions.requiredCapability('post_timeline')).toBe('write:timeline.posts');
    expect(moduleActions.requiredCapability('enqueue_job')).toBe('call:queues.enqueue');
  });

  test('DENIES an action when the app lacks the capability (no HTTP call)', async () => {
    const out = await moduleActions.run('post_timeline', { content: 'hi' }, {}, []); // no caps
    expect(out.error).toMatch(/missing capability write:timeline.posts/);
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('ALLOWS + performs the call when the app declares the capability', async () => {
    axios.post.mockResolvedValue({ data: { id: 'post-1' } });
    const out = await moduleActions.run('post_timeline', { content: 'hi' }, { authorization: 'Bearer u' }, ['write:timeline.posts']);
    expect(out).toEqual({ type: 'post_timeline', postId: 'post-1' });
    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toBe('https://svc.test/timeline/api/posts');
    expect(body.content).toBe('hi');
    expect(opts.headers.Authorization).toBe('Bearer u');
  });

  test('enqueue_job posts to the named queue when granted', async () => {
    axios.post.mockResolvedValue({ data: {} });
    const out = await moduleActions.run('enqueue_job', { queue: 'ingest', payload: { x: 1 } }, {}, ['call:queues.enqueue']);
    expect(out).toEqual({ type: 'enqueue_job', queue: 'ingest' });
    expect(axios.post.mock.calls[0][0]).toBe('https://svc.test/moderator/api/queues/ingest/jobs');
  });

  test('a downstream HTTP failure is contained as an error result', async () => {
    axios.post.mockRejectedValue(new Error('502'));
    const out = await moduleActions.run('post_timeline', { content: 'x' }, {}, ['write:timeline.posts']);
    expect(out.error).toMatch(/502/);
  });
});
