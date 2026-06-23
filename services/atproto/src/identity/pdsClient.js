/**
 * ═══════════════════════════════════════════════════════════
 * Minimal PDS XRPC client (for did:plc labeler provisioning)
 *
 * A thin fetch wrapper over the AT-Protocol XRPC endpoints we need to stand up a
 * did:plc labeler: create a session, publish the app.bsky.labeler.service
 * record, and drive the PLC operation that adds our #atproto_label signing key +
 * #atproto_labeler service to the account's DID document.
 *
 * Kept dependency-free (no @atproto/api) — just JSON over HTTPS with the session
 * bearer token. The PLC update requires an email-delivered token
 * (requestPlcOperationSignature → signPlcOperation), so it's a guided 2-step.
 * ═══════════════════════════════════════════════════════════
 */

class PdsClient {
  constructor({ url, fetchImpl = fetch }) {
    if (!url) throw new Error('PDS url is required');
    this.url = url.replace(/\/+$/, '');
    this.fetch = fetchImpl;
    this.session = null;
  }

  async _xrpc(method, nsid, { body, query } = {}) {
    let path = `${this.url}/xrpc/${nsid}`;
    if (query) {
      const qs = new URLSearchParams(query).toString();
      if (qs) path += `?${qs}`;
    }
    const headers = { 'content-type': 'application/json' };
    if (this.session?.accessJwt) headers.authorization = `Bearer ${this.session.accessJwt}`;
    const res = await this.fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const err = new Error(json.message || json.error || `XRPC ${nsid} ${res.status}`);
      err.status = res.status;
      err.body = json;
      throw err;
    }
    return json;
  }

  /** com.atproto.server.createSession — log in, returns { did, handle, accessJwt }. */
  async login(identifier, password) {
    this.session = await this._xrpc('POST', 'com.atproto.server.createSession', {
      body: { identifier, password },
    });
    return this.session;
  }

  /** com.atproto.repo.putRecord — write a record (e.g. app.bsky.labeler.service / self). */
  async putRecord({ repo, collection, rkey, record }) {
    return this._xrpc('POST', 'com.atproto.repo.putRecord', {
      body: { repo, collection, rkey, record },
    });
  }

  /** com.atproto.identity.getRecommendedDidCredentials — current creds to merge into. */
  async getRecommendedDidCredentials() {
    return this._xrpc('GET', 'com.atproto.identity.getRecommendedDidCredentials');
  }

  /** Ask the PDS to email a token authorizing a PLC operation. */
  async requestPlcOperationSignature() {
    return this._xrpc('POST', 'com.atproto.identity.requestPlcOperationSignature');
  }

  /** com.atproto.identity.signPlcOperation — PDS signs the op (needs email token). */
  async signPlcOperation(operation) {
    return this._xrpc('POST', 'com.atproto.identity.signPlcOperation', { body: operation });
  }

  /** com.atproto.identity.submitPlcOperation — publish the signed op to the directory. */
  async submitPlcOperation(operation) {
    return this._xrpc('POST', 'com.atproto.identity.submitPlcOperation', { body: { operation } });
  }
}

module.exports = { PdsClient };
