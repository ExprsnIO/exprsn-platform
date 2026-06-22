/**
 * ═══════════════════════════════════════════════════════════════════════
 * ACME problem documents (RFC 7807 + RFC 8555 §6.7)
 * ═══════════════════════════════════════════════════════════════════════
 */

const ACME_ERROR_NS = 'urn:ietf:params:acme:error:';

class Problem extends Error {
  /**
   * @param {number} status - HTTP status
   * @param {string} type - ACME error type suffix (e.g. 'badNonce')
   * @param {string} detail - human-readable detail
   * @param {Object[]} [subproblems]
   */
  constructor(status, type, detail, subproblems) {
    super(detail);
    this.name = 'AcmeProblem';
    this.status = status;
    this.type = type;
    this.detail = detail;
    this.subproblems = subproblems;
  }

  toJSON() {
    const doc = {
      type: this.type.includes(':') ? this.type : `${ACME_ERROR_NS}${this.type}`,
      detail: this.detail,
      status: this.status
    };
    if (this.subproblems) {
      doc.subproblems = this.subproblems;
    }
    return doc;
  }
}

/**
 * Send a problem document response.
 */
function send(res, problem) {
  res.status(problem.status)
    .type('application/problem+json')
    .json(problem.toJSON());
}

const factories = {
  badNonce: (detail = 'Invalid or expired nonce') => new Problem(400, 'badNonce', detail),
  malformed: (detail = 'Malformed request') => new Problem(400, 'malformed', detail),
  unauthorized: (detail = 'Unauthorized') => new Problem(403, 'unauthorized', detail),
  accountDoesNotExist: (detail = 'Account does not exist') =>
    new Problem(400, 'accountDoesNotExist', detail),
  badPublicKey: (detail = 'Unsupported or invalid public key') =>
    new Problem(400, 'badPublicKey', detail),
  badSignatureAlgorithm: (detail = 'JWS signature algorithm not allowed (use RS256 or ES256)') =>
    new Problem(400, 'badSignatureAlgorithm', detail),
  badCSR: (detail = 'CSR is unacceptable') => new Problem(400, 'badCSR', detail),
  badRevocationReason: (detail = 'Revocation reason not allowed') =>
    new Problem(400, 'badRevocationReason', detail),
  alreadyRevoked: (detail = 'Certificate already revoked') =>
    new Problem(400, 'alreadyRevoked', detail),
  orderNotReady: (detail = 'Order is not in the "ready" state') =>
    new Problem(403, 'orderNotReady', detail),
  unsupportedIdentifier: (detail = 'Only dns identifiers are supported') =>
    new Problem(400, 'unsupportedIdentifier', detail),
  rejectedIdentifier: (detail = 'Identifier rejected by policy') =>
    new Problem(400, 'rejectedIdentifier', detail),
  userActionRequired: (detail = 'Terms of service must be agreed') =>
    new Problem(403, 'userActionRequired', detail),
  serverInternal: (detail = 'Internal server error') =>
    new Problem(500, 'serverInternal', detail),
  notFound: (detail = 'Resource not found') => new Problem(404, 'malformed', detail)
};

module.exports = {
  Problem,
  send,
  ...factories
};
