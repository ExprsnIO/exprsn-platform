import { describe, it, expect, vi, afterEach } from 'vitest';
import { http } from './http';
import { tokenStore } from './token';

afterEach(() => {
  vi.restoreAllMocks();
  tokenStore.clear();
});

describe('http wrapper', () => {
  it('injects the bearer token and parses JSON', async () => {
    tokenStore.set('abc');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const data = await http.get<{ ok: boolean }>('/health');
    expect(data.ok).toBe(true);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer abc');
    expect(init.credentials).toBe('include');
  });

  it('throws ApiError carrying the correlationId from the gateway envelope', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'BOOM', message: 'nope', correlationId: 'cid-1' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await expect(http.get('/health')).rejects.toMatchObject({
      status: 500,
      code: 'BOOM',
      correlationId: 'cid-1',
    });
  });
});
