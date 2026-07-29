/**
 * Single fetch wrapper for all backend calls.
 *
 *  - same-origin base (config.apiBase = '') with credentials included
 *  - injects the bearer token from tokenStore
 *  - parses the gateway error envelope ({ error, message, correlationId }) and
 *    throws a typed ApiError that surfaces the correlationId for support
 */
import { config } from './config';
import { tokenStore } from './token';

export interface ApiErrorBody {
  error?: string;
  message?: string;
  correlationId?: string;
  details?: unknown;
}

/**
 * Coerce an error envelope's `message`/`error` field to a readable string. Some
 * upstreams hand back an object (validation maps, nested `{ message: {...} }`),
 * which `Error`/JSX would otherwise turn into the literal "[object Object]".
 */
function stringifyMessage(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  try {
    return JSON.stringify(v);
  } catch {
    return '';
  }
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly correlationId?: string;
  readonly details?: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(stringifyMessage(body.message) || stringifyMessage(body.error) || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.error;
    this.correlationId = body.correlationId;
    this.details = body.details;
  }
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  /** JSON body — serialized automatically. Use `rawBody` for FormData/streams. */
  body?: unknown;
  rawBody?: BodyInit;
  /**
   * Don't fire the global unauthorized handler on a 401. Use for calls where a
   * 401 means "wrong credential just entered" (e.g. MFA disable/regenerate send
   * the account password and 401 on mismatch) rather than "session expired" —
   * we want an inline form error, not a forced logout.
   */
  skipAuthHandler?: boolean;
}

// Global hook fired when a non-auth call returns 401 (token missing/expired) so
// the app can drop the session and route to login. Registered by the app layer
// to avoid http.ts depending on the store.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, rawBody, headers, skipAuthHandler, ...rest } = opts;

  const finalHeaders = new Headers(headers);
  const token = tokenStore.get();
  if (token) finalHeaders.set('Authorization', `Bearer ${token}`);

  let payload: BodyInit | undefined = rawBody;
  if (body !== undefined && rawBody === undefined) {
    finalHeaders.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }

  const res = await fetch(`${config.apiBase}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: payload,
    credentials: 'include',
  });

  if (res.status === 204) return undefined as T;

  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : await res.text();

  if (!res.ok) {
    // 401 on a normal API call means our bearer is gone/expired — drop session.
    // Skip the auth endpoints themselves (login/mfa/remint/me) so a failed
    // login attempt doesn't recurse into the logout path.
    if (res.status === 401 && !skipAuthHandler && !path.startsWith('/auth/api/auth/')) {
      onUnauthorized?.();
    }
    throw new ApiError(res.status, (isJson ? data : { message: String(data) }) as ApiErrorBody);
  }
  return data as T;
}

/**
 * POST a JSON body and consume a Server-Sent Events response (FEAT-090).
 *
 * `EventSource` can't be used here: it is GET-only and cannot carry the bearer
 * header, so the stream is read off `fetch`'s body reader instead. Frames are
 * reassembled across network chunks — a frame is not guaranteed to arrive whole.
 *
 * Resolves with the payload of the terminal `done` event; rejects on `error`,
 * and on `cancelled` (as an AbortError) so callers can tell a user-cancelled
 * stream from a failed one.
 */
export async function streamSSE<T>(
  path: string,
  body: unknown,
  opts: {
    onEvent?: (event: string, data: unknown) => void;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' });
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${config.apiBase}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    credentials: 'include',
    signal: opts.signal,
  });

  if (!res.ok || !res.body) {
    const isJson = res.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await res.json().catch(() => ({})) : { message: await res.text() };
    if (res.status === 401 && !path.startsWith('/auth/api/auth/')) onUnauthorized?.();
    throw new ApiError(res.status, data as ApiErrorBody);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result: T | undefined;
  let failure: ApiError | Error | null = null;

  const handleBlock = (block: string) => {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const raw = /^data: (.+)$/m.exec(block)?.[1];
    if (!event) return;
    let data: unknown = {};
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return;
    }
    if (event === 'done') result = data as T;
    else if (event === 'error') {
      const d = data as ApiErrorBody;
      failure = new ApiError(500, d);
    } else if (event === 'cancelled') {
      failure = Object.assign(new Error('cancelled'), { name: 'AbortError' });
    } else opts.onEvent?.(event, data);
  };

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf('\n\n');
    while (sep !== -1) {
      handleBlock(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) handleBlock(buffer);

  if (failure) throw failure;
  if (result === undefined) throw new Error('stream ended without a result');
  return result;
}

export const http = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'GET' }),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: 'PATCH', body }),
  del: <T>(path: string, opts?: RequestOptions) => request<T>(path, { ...opts, method: 'DELETE' }),
};
