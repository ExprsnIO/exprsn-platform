/**
 * Fake for services/ca/services/platformSigning — only getSigningCertificateId is
 * used by the member hook (S6) to pick the CA signing cert for the org-scoped token.
 */

'use strict';

module.exports = {
  async getSigningCertificateId() {
    return 'signing-cert-1';
  }
};
