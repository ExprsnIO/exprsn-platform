'use strict';

/**
 * Minimal DigitalOcean API v2 client (zero dependencies, Node >= 18 fetch).
 *
 * - Bearer auth from DIGITALOCEAN_TOKEN (or DIGITALOCEAN_ACCESS_TOKEN / DO_TOKEN).
 * - Follows `links.pages.next` for list endpoints (bounded by maxPages).
 * - Retries 429 / 5xx with backoff, honouring Retry-After / ratelimit-reset.
 * - Never echoes the token in errors.
 */

const DEFAULT_BASE_URL = 'https://api.digitalocean.com/v2';

class DOApiError extends Error {
  constructor(status, body, method, path) {
    const detail = body && (body.message || body.id) ? `${body.id || ''} ${body.message || ''}`.trim() : '';
    super(`DigitalOcean API ${method} ${path} failed: HTTP ${status}${detail ? ` — ${detail}` : ''}`);
    this.name = 'DOApiError';
    this.status = status;
    this.body = body;
  }
}

function resolveToken(env = process.env) {
  return env.DIGITALOCEAN_TOKEN || env.DIGITALOCEAN_ACCESS_TOKEN || env.DO_TOKEN || '';
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class DOClient {
  constructor({ token, baseUrl, fetchImpl, maxRetries = 3, userAgent } = {}) {
    this.token = token;
    this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.fetch = fetchImpl || globalThis.fetch;
    this.maxRetries = maxRetries;
    this.userAgent = userAgent || 'exprsn-claude-digitalocean-plugin/0.1';
    this.lastRateLimit = null;
  }

  buildUrl(path, query) {
    // Accept absolute next-page links returned by the API itself, but only for
    // the configured API origin — never let a tool argument redirect the token.
    let url;
    if (/^https?:\/\//i.test(path)) {
      url = new URL(path);
      if (url.origin !== new URL(this.baseUrl).origin) {
        throw new Error(`Refusing to send DigitalOcean credentials to foreign origin ${url.origin}`);
      }
    } else {
      const clean = path.startsWith('/') ? path : `/${path}`;
      const rel = clean.replace(/^\/v2(?=\/|$)/, '');
      url = new URL(this.baseUrl + rel);
    }
    for (const [k, v] of Object.entries(query || {})) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
    return url;
  }

  async request(method, path, { query, body } = {}) {
    if (!this.token) {
      throw new Error('DIGITALOCEAN_TOKEN is not set. Export a DigitalOcean personal access token before starting Claude Code.');
    }
    const url = this.buildUrl(path, query);
    const init = {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/json',
        'User-Agent': this.userAgent,
      },
    };
    if (body !== undefined && body !== null) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    for (let attempt = 0; ; attempt++) {
      const res = await this.fetch(url, init);
      this.lastRateLimit = {
        limit: res.headers.get('ratelimit-limit'),
        remaining: res.headers.get('ratelimit-remaining'),
        reset: res.headers.get('ratelimit-reset'),
      };
      const text = res.status === 204 ? '' : await res.text();
      let data = null;
      if (text) {
        try { data = JSON.parse(text); } catch { data = { raw: text }; }
      }
      if (res.ok) return { status: res.status, data };

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await sleep(this.retryDelay(res, attempt));
        continue;
      }
      throw new DOApiError(res.status, data, method, url.pathname);
    }
  }

  retryDelay(res, attempt) {
    const retryAfter = Number(res.headers.get('retry-after'));
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 30000);
    const reset = Number(res.headers.get('ratelimit-reset'));
    if (res.status === 429 && Number.isFinite(reset) && reset > 0) {
      const ms = reset * 1000 - Date.now();
      if (ms > 0) return Math.min(ms, 30000);
    }
    return Math.min(500 * 2 ** attempt, 8000);
  }

  get(path, query) {
    return this.request('GET', path, { query });
  }

  /**
   * GET a paginated collection and merge `key` across pages.
   * Returns { items, total, truncated }.
   */
  async list(path, key, { query, perPage = 200, maxPages = 10 } = {}) {
    const items = [];
    let next = this.buildUrl(path, { ...query, per_page: perPage }).toString();
    let pages = 0;
    let total;
    while (next && pages < maxPages) {
      const { data } = await this.request('GET', next);
      pages++;
      items.push(...((data && data[key]) || []));
      total = data && data.meta && data.meta.total;
      next = data && data.links && data.links.pages && data.links.pages.next;
    }
    return { items, total: total ?? items.length, truncated: Boolean(next) };
  }
}

module.exports = { DOClient, DOApiError, resolveToken, DEFAULT_BASE_URL };
