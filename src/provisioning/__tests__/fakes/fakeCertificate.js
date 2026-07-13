/**
 * Fake for services/ca/services/certificate — the CA certificate façade the engine
 * (S0 preflight, S4 intermediate) and the member hook (S5 entity cert) call lazily.
 *
 * Real crypto is mocked out; state lives in caState so revoke-not-delete is
 * observable (the cert row stays present with status='revoked'). Every method is a
 * plain async function on a singleton object so tests can jest.spyOn(...) it to
 * inject a step failure and assert the compensators run.
 */

'use strict';

const { state, nextId } = require('./caState');

module.exports = {
  // ── S0 preflight façades ────────────────────────────────────────────────────
  async findActiveRoot() {
    return state.root && state.root.status === 'active' ? state.root : null;
  },

  async hasUsableSigningKey(/* certificateId */) {
    return !!state.keyUsable;
  },

  // ── S4 dedup + create ───────────────────────────────────────────────────────
  async findActiveOrgIntermediate(organizationalUnit) {
    for (const cert of state.certs.values()) {
      if (cert.type === 'intermediate' &&
          cert.status === 'active' &&
          cert.organizationalUnit === organizationalUnit) {
        return cert;
      }
    }
    return null;
  },

  async createIntermediateCertificate(options /* , userId */) {
    const cert = {
      id: nextId('int-cert'),
      type: 'intermediate',
      status: 'active',
      organizationalUnit: options.organizationalUnit,
      issuerId: options.rootCertificateId,
      commonName: options.commonName
    };
    state.certs.set(cert.id, cert);
    return cert;
  },

  // ── S5 entity cert ──────────────────────────────────────────────────────────
  async createEntityCertificate(options /* , userId */) {
    const cert = {
      id: nextId('ent-cert'),
      type: options.type || 'client',
      status: 'active',
      organizationalUnit: options.organizationalUnit,
      issuerId: options.issuerId,
      commonName: options.commonName
    };
    state.certs.set(cert.id, cert);
    return { certificate: cert, privateKey: 'FAKE-PRIVATE-KEY' };
  },

  // ── compensation: REVOKE (never delete). Already-revoked throws the same
  //    "already revoked" message the real service does, so the engine/hook's
  //    idempotent catch path is exercised. ──────────────────────────────────────
  async revokeCertificate(certificateId /* , reason, userId */) {
    const cert = state.certs.get(certificateId);
    if (!cert) {
      const err = new Error('Certificate not found');
      err.code = 'CERT_NOT_FOUND';
      throw err;
    }
    if (cert.status === 'revoked') {
      throw new Error('Certificate already revoked');
    }
    cert.status = 'revoked';
    return cert;
  }
};
