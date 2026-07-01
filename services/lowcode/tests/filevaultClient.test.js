'use strict';

process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
process.env.FILEVAULT_SERVICE_URL = 'https://fv.test/filevault';

jest.mock('axios');
const axios = require('axios');
const client = require('../src/services/filevaultClient');

const entity = { appId: 'app-1', key: 'ticket', storage: { mode: 'mirror' } };
const record = { id: 'rec-1', data: { title: 'hi' }, state: 'open' };

beforeEach(() => jest.clearAllMocks());

describe('filevaultClient', () => {
  test('writeRecordFile POSTs JSON content and returns the fileId', async () => {
    axios.post.mockResolvedValue({ data: { file: { id: 'fv-1' } } });
    const out = await client.writeRecordFile(entity, record, { authorization: 'Bearer u' });
    expect(out).toEqual({ ok: true, fileId: 'fv-1' });
    const [url, body, opts] = axios.post.mock.calls[0];
    expect(url).toBe('https://fv.test/filevault/api/files/create');
    expect(body.name).toBe('lc_app-1_ticket_rec-1.json');
    expect(JSON.parse(body.content).data).toEqual({ title: 'hi' }); // record data serialized
    expect(opts.headers.Authorization).toBe('Bearer u');            // caller bearer forwarded
  });

  test('writeRecordFile degrades to {ok:false} on failure (never throws)', async () => {
    axios.post.mockRejectedValue(new Error('fv down'));
    const out = await client.writeRecordFile(entity, record);
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/fv down/);
  });

  test('deleteRecordFile skips cleanly when there is no fileId', async () => {
    const out = await client.deleteRecordFile(null);
    expect(out).toEqual({ ok: true, skipped: true });
    expect(axios.delete).not.toHaveBeenCalled();
  });

  test('exportEntityFile writes a collection file with every record', async () => {
    axios.post.mockResolvedValue({ data: { file: { id: 'fv-export' } } });
    const out = await client.exportEntityFile(entity, [record, { id: 'r2', data: {} }]);
    expect(out).toMatchObject({ ok: true, fileId: 'fv-export', count: 2 });
    const body = axios.post.mock.calls[0][1];
    expect(JSON.parse(body.content).records).toHaveLength(2);
  });
});
