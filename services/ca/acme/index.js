/**
 * ═══════════════════════════════════════════════════════════════════════
 * ACME v2 Server (RFC 8555) — Express router
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Mounted at /acme by the CA orchestrator. External URLs are built from
 * `${CA_BASE_URL}/acme`, so CA_BASE_URL must match the externally
 * reachable base URL of the CA application.
 *
 * Endpoints:
 *   GET  /directory
 *   HEAD|GET /new-nonce
 *   POST /new-account
 *   POST /new-order
 *   POST /authz/:id
 *   POST /chall/:id
 *   POST /order/:id
 *   POST /order/:id/finalize
 *   POST /cert/:id
 *   POST /revoke-cert
 *   POST /key-change            (501 — not implemented)
 *   POST /acct/:id
 *   POST /acct/:id/orders
 */

const express = require('express');
const nodeCrypto = require('node:crypto');
const forge = require('node-forge');
const { Op } = require('sequelize');

const {
  AcmeAccount,
  AcmeOrder,
  AcmeAuthorization,
  AcmeChallenge,
  Certificate
} = require('../models');
const cryptoUtils = require('../crypto');
const certificateService = require('../services/certificate');
const { getStorage } = require('../storage');
const logger = require('../utils/logger');

const nonces = require('./nonce');
const problems = require('./problems');
const validation = require('./validation');
const { verifyJwsRequest, jwkThumbprint } = require('./jws');

const ORDER_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const AUTHZ_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const DNS_NAME_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

const REASON_CODE_TO_NAME = {
  0: 'unspecified',
  1: 'keyCompromise',
  2: 'caCompromise',
  3: 'affiliationChanged',
  4: 'superseded',
  5: 'cessationOfOperation',
  6: 'certificateHold',
  8: 'removeFromCRL',
  9: 'privilegeWithdrawn',
  10: 'aaCompromise'
};

// ─────────────────────────────────────────────────────────────────────────
// URL helpers
// ─────────────────────────────────────────────────────────────────────────

function acmeBase() {
  return `${cryptoUtils.getCaBaseUrl()}/acme`;
}

const urls = {
  directory: () => `${acmeBase()}/directory`,
  newNonce: () => `${acmeBase()}/new-nonce`,
  newAccount: () => `${acmeBase()}/new-account`,
  newOrder: () => `${acmeBase()}/new-order`,
  revokeCert: () => `${acmeBase()}/revoke-cert`,
  keyChange: () => `${acmeBase()}/key-change`,
  account: id => `${acmeBase()}/acct/${id}`,
  accountOrders: id => `${acmeBase()}/acct/${id}/orders`,
  order: id => `${acmeBase()}/order/${id}`,
  finalize: id => `${acmeBase()}/order/${id}/finalize`,
  authz: id => `${acmeBase()}/authz/${id}`,
  challenge: id => `${acmeBase()}/chall/${id}`,
  certificate: id => `${acmeBase()}/cert/${id}`
};

// ─────────────────────────────────────────────────────────────────────────
// JSON serializers (RFC 8555 §7.1 object shapes)
// ─────────────────────────────────────────────────────────────────────────

function accountToJson(account) {
  return {
    status: account.status,
    contact: account.contact || [],
    termsOfServiceAgreed: account.termsOfServiceAgreed,
    orders: urls.accountOrders(account.id)
  };
}

function orderToJson(order, authorizations) {
  const json = {
    status: order.status,
    expires: new Date(order.expires).toISOString(),
    identifiers: order.identifiers,
    authorizations: authorizations.map(authz => urls.authz(authz.id)),
    finalize: urls.finalize(order.id)
  };

  if (order.notBefore) json.notBefore = new Date(order.notBefore).toISOString();
  if (order.notAfter) json.notAfter = new Date(order.notAfter).toISOString();
  if (order.error) json.error = order.error;
  if (order.status === 'valid' && order.certificateId) {
    json.certificate = urls.certificate(order.certificateId);
  }

  return json;
}

function challengeToJson(challenge) {
  const json = {
    type: challenge.type,
    url: urls.challenge(challenge.id),
    status: challenge.status,
    token: challenge.token
  };

  if (challenge.validated) json.validated = new Date(challenge.validated).toISOString();
  if (challenge.error) json.error = challenge.error;

  return json;
}

function authzToJson(authz, challenges) {
  const json = {
    identifier: authz.identifier,
    status: authz.status,
    expires: new Date(authz.expires).toISOString(),
    challenges: challenges.map(challengeToJson)
  };

  if (authz.wildcard) json.wildcard = true;

  return json;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function wrap(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof problems.Problem) {
        return problems.send(res, error);
      }
      logger.error('ACME internal error:', error);
      return problems.send(res, problems.serverInternal());
    }
  };
}

function serialCandidates(hex) {
  const candidates = new Set();
  const lower = (hex || '').toLowerCase();
  candidates.add(lower);

  const stripped = lower.replace(/^0+/, '') || '0';
  candidates.add(stripped);
  if (stripped.length % 2 !== 0) {
    candidates.add('0' + stripped);
  }
  candidates.add(stripped.padStart(32, '0'));

  return Array.from(candidates);
}

/**
 * Recompute order status from its authorizations / expiry.
 */
async function refreshOrder(order) {
  if (['valid', 'invalid'].includes(order.status)) {
    return order;
  }

  if (new Date(order.expires) < new Date()) {
    order.status = 'invalid';
    order.error = problems.malformed('Order has expired').toJSON();
    await order.save();
    return order;
  }

  if (order.status === 'pending') {
    const authorizations = await AcmeAuthorization.findAll({ where: { orderId: order.id } });
    if (authorizations.some(a => ['invalid', 'deactivated', 'expired', 'revoked'].includes(a.status))) {
      order.status = 'invalid';
      await order.save();
    } else if (authorizations.length > 0 && authorizations.every(a => a.status === 'valid')) {
      order.status = 'ready';
      await order.save();
    }
  }

  return order;
}

/**
 * Pick the issuing CA: ACME_ISSUER_CERT_ID override, else the newest
 * active intermediate, else the active root.
 */
async function getIssuerCertificate() {
  if (process.env.ACME_ISSUER_CERT_ID) {
    const override = await Certificate.findByPk(process.env.ACME_ISSUER_CERT_ID);
    if (override && override.isValid()) {
      return override;
    }
    logger.warn('ACME_ISSUER_CERT_ID is set but the certificate is missing or invalid');
  }

  const intermediate = await Certificate.findOne({
    where: { type: 'intermediate', status: 'active' },
    order: [['createdAt', 'DESC']]
  });
  if (intermediate && intermediate.isValid()) {
    return intermediate;
  }

  const root = await Certificate.findOne({
    where: { type: 'root', status: 'active' }
  });
  if (root && root.isValid()) {
    return root;
  }

  throw problems.serverInternal('No active issuing CA certificate available');
}

/**
 * Extract the DNS names from a forge CSR (CN + SAN dNSNames), lowercased.
 */
function csrDnsNames(csr) {
  const names = new Set();

  const cnAttr = csr.subject.getField('CN');
  if (cnAttr && cnAttr.value) {
    names.add(String(cnAttr.value).toLowerCase());
  }

  const extensionRequest = csr.getAttribute({ name: 'extensionRequest' });
  if (extensionRequest && Array.isArray(extensionRequest.extensions)) {
    const sanExt = extensionRequest.extensions.find(
      ext => ext.name === 'subjectAltName' || ext.id === '2.5.29.17'
    );
    if (sanExt && Array.isArray(sanExt.altNames)) {
      for (const altName of sanExt.altNames) {
        if (altName.type === 2 && altName.value) {
          names.add(String(altName.value).toLowerCase());
        }
      }
    }
  }

  return names;
}

// ─────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────

const router = express.Router();

// ACME POST bodies are application/jose+json flattened JWS
router.use(express.json({ type: ['application/jose+json', 'application/json'], limit: '1mb' }));

// Every response carries a fresh Replay-Nonce and an index link
router.use(async (req, res, next) => {
  res.set('Link', `<${urls.directory()}>;rel="index"`);
  try {
    res.set('Replay-Nonce', await nonces.issue());
  } catch (error) {
    logger.error('Failed to issue ACME nonce:', error);
  }
  next();
});

// ── Directory ──────────────────────────────────────────────────────────

router.get('/directory', wrap(async (req, res) => {
  const meta = {
    website: cryptoUtils.getCaBaseUrl(),
    externalAccountRequired: false
  };
  if (process.env.ACME_TOS_URL) {
    meta.termsOfService = process.env.ACME_TOS_URL;
  }

  res.json({
    newNonce: urls.newNonce(),
    newAccount: urls.newAccount(),
    newOrder: urls.newOrder(),
    revokeCert: urls.revokeCert(),
    keyChange: urls.keyChange(),
    meta
  });
}));

// ── Nonce ──────────────────────────────────────────────────────────────

router.head('/new-nonce', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(200).end();
});

router.get('/new-nonce', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(204).end();
});

// ── Account management ─────────────────────────────────────────────────

router.post('/new-account', wrap(async (req, res) => {
  const { header, payload } = await verifyJwsRequest(req, { acmeBase: acmeBase(), mode: 'jwk' });
  const body = payload || {};

  const thumbprint = jwkThumbprint(header.jwk);

  const existing = await AcmeAccount.findOne({ where: { keyThumbprint: thumbprint } });
  if (existing) {
    res.set('Location', urls.account(existing.id));
    return res.status(200).json(accountToJson(existing));
  }

  if (body.onlyReturnExisting) {
    throw problems.accountDoesNotExist();
  }

  if (process.env.ACME_TOS_URL && body.termsOfServiceAgreed !== true) {
    const problem = problems.userActionRequired(
      `Terms of service must be agreed: ${process.env.ACME_TOS_URL}`
    );
    res.set('Link', `<${process.env.ACME_TOS_URL}>;rel="terms-of-service", <${urls.directory()}>;rel="index"`);
    throw problem;
  }

  const contact = Array.isArray(body.contact) ? body.contact.map(String) : [];

  const account = await AcmeAccount.create({
    keyThumbprint: thumbprint,
    jwk: header.jwk,
    status: 'valid',
    contact,
    termsOfServiceAgreed: body.termsOfServiceAgreed === true
  });

  logger.info('ACME account created', { accountId: account.id });

  res.set('Location', urls.account(account.id));
  res.status(201).json(accountToJson(account));
}));

router.post('/acct/:id', wrap(async (req, res) => {
  const { payload, account, isPostAsGet } = await verifyJwsRequest(req, {
    acmeBase: acmeBase(),
    mode: 'kid'
  });

  if (account.id !== req.params.id) {
    throw problems.unauthorized('JWS account key does not match the requested account');
  }

  if (!isPostAsGet && payload) {
    if (payload.status === 'deactivated') {
      account.status = 'deactivated';
      await account.save();
    } else if (Array.isArray(payload.contact)) {
      account.contact = payload.contact.map(String);
      await account.save();
    }
  }

  res.set('Location', urls.account(account.id));
  res.status(200).json(accountToJson(account));
}));

router.post('/acct/:id/orders', wrap(async (req, res) => {
  const { account } = await verifyJwsRequest(req, { acmeBase: acmeBase(), mode: 'kid' });

  if (account.id !== req.params.id) {
    throw problems.unauthorized('JWS account key does not match the requested account');
  }

  const orders = await AcmeOrder.findAll({
    where: { accountId: account.id },
    order: [['createdAt', 'DESC']],
    limit: 100
  });

  res.status(200).json({
    orders: orders.map(order => urls.order(order.id))
  });
}));

// ── Orders ─────────────────────────────────────────────────────────────

router.post('/new-order', wrap(async (req, res) => {
  const { payload, account } = await verifyJwsRequest(req, { acmeBase: acmeBase(), mode: 'kid' });

  if (!payload || !Array.isArray(payload.identifiers) || payload.identifiers.length === 0) {
    throw problems.malformed('Order must include at least one identifier');
  }

  const identifiers = [];
  for (const identifier of payload.identifiers) {
    if (!identifier || identifier.type !== 'dns' || typeof identifier.value !== 'string') {
      throw problems.unsupportedIdentifier('Only identifiers of type "dns" are supported');
    }

    const value = identifier.value.toLowerCase().trim();
    const baseName = value.startsWith('*.') ? value.slice(2) : value;
    if (!DNS_NAME_RE.test(baseName)) {
      throw problems.rejectedIdentifier(`Invalid DNS identifier: ${identifier.value}`);
    }

    identifiers.push({ type: 'dns', value });
  }

  const now = Date.now();
  const order = await AcmeOrder.create({
    accountId: account.id,
    status: 'pending',
    expires: new Date(now + ORDER_LIFETIME_MS),
    identifiers,
    notBefore: payload.notBefore ? new Date(payload.notBefore) : null,
    notAfter: payload.notAfter ? new Date(payload.notAfter) : null
  });

  const authorizations = [];
  for (const identifier of identifiers) {
    const wildcard = identifier.value.startsWith('*.');
    const authzValue = wildcard ? identifier.value.slice(2) : identifier.value;

    const authz = await AcmeAuthorization.create({
      orderId: order.id,
      accountId: account.id,
      identifier: { type: 'dns', value: authzValue },
      wildcard,
      status: 'pending',
      expires: new Date(now + AUTHZ_LIFETIME_MS)
    });

    // Wildcards can only be validated via dns-01 (RFC 8555 §7.1.3)
    const challengeTypes = wildcard ? ['dns-01'] : ['http-01', 'dns-01'];
    for (const type of challengeTypes) {
      await AcmeChallenge.create({
        authorizationId: authz.id,
        type,
        token: nodeCrypto.randomBytes(32).toString('base64url'),
        status: 'pending'
      });
    }

    authorizations.push(authz);
  }

  logger.info('ACME order created', { orderId: order.id, accountId: account.id });

  res.set('Location', urls.order(order.id));
  res.status(201).json(orderToJson(order, authorizations));
}));

router.post('/order/:id', wrap(async (req, res) => {
  const { account } = await verifyJwsRequest(req, { acmeBase: acmeBase(), mode: 'kid' });

  const order = await AcmeOrder.findByPk(req.params.id);
  if (!order || order.accountId !== account.id) {
    throw problems.notFound('Order not found');
  }

  await refreshOrder(order);
  const authorizations = await AcmeAuthorization.findAll({ where: { orderId: order.id } });

  res.set('Location', urls.order(order.id));
  res.status(200).json(orderToJson(order, authorizations));
}));

// ── Authorizations & challenges ────────────────────────────────────────

router.post('/authz/:id', wrap(async (req, res) => {
  const { payload, account, isPostAsGet } = await verifyJwsRequest(req, {
    acmeBase: acmeBase(),
    mode: 'kid'
  });

  const authz = await AcmeAuthorization.findByPk(req.params.id);
  if (!authz || authz.accountId !== account.id) {
    throw problems.notFound('Authorization not found');
  }

  if (authz.status === 'pending' && new Date(authz.expires) < new Date()) {
    authz.status = 'expired';
    await authz.save();
  }

  if (!isPostAsGet && payload && payload.status === 'deactivated') {
    authz.status = 'deactivated';
    await authz.save();
  }

  const challenges = await AcmeChallenge.findAll({ where: { authorizationId: authz.id } });

  res.status(200).json(authzToJson(authz, challenges));
}));

router.post('/chall/:id', wrap(async (req, res) => {
  const { account } = await verifyJwsRequest(req, { acmeBase: acmeBase(), mode: 'kid' });

  const challenge = await AcmeChallenge.findByPk(req.params.id);
  if (!challenge) {
    throw problems.notFound('Challenge not found');
  }

  const authz = await AcmeAuthorization.findByPk(challenge.authorizationId);
  if (!authz || authz.accountId !== account.id) {
    throw problems.notFound('Challenge not found');
  }

  res.set('Link', `<${urls.authz(authz.id)}>;rel="up", <${urls.directory()}>;rel="index"`);

  // Already settled — return current state (idempotent polling)
  if (challenge.status === 'valid' || challenge.status === 'invalid') {
    return res.status(200).json(challengeToJson(challenge));
  }

  if (authz.status !== 'pending' || new Date(authz.expires) < new Date()) {
    throw problems.malformed('Authorization is no longer pending');
  }

  challenge.status = 'processing';
  await challenge.save();

  const keyAuth = validation.keyAuthorization(challenge.token, account.keyThumbprint);
  const identifierValue = authz.identifier.value;

  let result;
  if (challenge.type === 'http-01') {
    result = await validation.validateHttp01(identifierValue, challenge.token, keyAuth);
  } else {
    result = await validation.validateDns01(identifierValue, keyAuth);
  }

  if (result.ok) {
    challenge.status = 'valid';
    challenge.validated = new Date();
    challenge.error = null;
    await challenge.save();

    authz.status = 'valid';
    await authz.save();

    const order = await AcmeOrder.findByPk(authz.orderId);
    if (order) {
      await refreshOrder(order);
    }

    logger.info('ACME challenge validated', {
      challengeId: challenge.id,
      type: challenge.type,
      identifier: identifierValue
    });
  } else {
    challenge.status = 'invalid';
    challenge.error = problems.unauthorized(result.detail || 'Challenge validation failed').toJSON();
    await challenge.save();

    authz.status = 'invalid';
    await authz.save();

    const order = await AcmeOrder.findByPk(authz.orderId);
    if (order && !['valid', 'invalid'].includes(order.status)) {
      order.status = 'invalid';
      await order.save();
    }

    logger.warn('ACME challenge validation failed', {
      challengeId: challenge.id,
      type: challenge.type,
      identifier: identifierValue,
      detail: result.detail
    });
  }

  res.status(200).json(challengeToJson(challenge));
}));

// ── Finalize & certificate retrieval ───────────────────────────────────

router.post('/order/:id/finalize', wrap(async (req, res) => {
  const { payload, account } = await verifyJwsRequest(req, { acmeBase: acmeBase(), mode: 'kid' });

  const order = await AcmeOrder.findByPk(req.params.id);
  if (!order || order.accountId !== account.id) {
    throw problems.notFound('Order not found');
  }

  await refreshOrder(order);

  if (order.status !== 'ready') {
    throw problems.orderNotReady(`Order status is "${order.status}", expected "ready"`);
  }

  if (!payload || typeof payload.csr !== 'string') {
    throw problems.badCSR('Finalize payload must include a base64url DER CSR');
  }

  // Parse and verify the CSR
  let csr;
  let csrPem;
  try {
    const csrDer = Buffer.from(payload.csr, 'base64url');
    const csrAsn1 = forge.asn1.fromDer(forge.util.createBuffer(csrDer.toString('binary')));
    csr = forge.pki.certificationRequestFromAsn1(csrAsn1, true);
    if (!csr.verify()) {
      throw new Error('CSR self-signature is invalid');
    }
    csrPem = forge.pki.certificationRequestToPem(csr);
  } catch (error) {
    throw problems.badCSR(`Could not parse CSR: ${error.message}`);
  }

  // CSR names must exactly match the order identifiers
  const requestedNames = csrDnsNames(csr);
  const orderNames = new Set(order.identifiers.map(i => i.value.toLowerCase()));

  if (requestedNames.size === 0) {
    throw problems.badCSR('CSR contains no DNS names');
  }
  for (const name of requestedNames) {
    if (!orderNames.has(name)) {
      throw problems.badCSR(`CSR name "${name}" is not in the order identifiers`);
    }
  }
  for (const name of orderNames) {
    if (!requestedNames.has(name)) {
      throw problems.badCSR(`Order identifier "${name}" is missing from the CSR`);
    }
  }

  order.status = 'processing';
  await order.save();

  try {
    const issuer = await getIssuerCertificate();
    const storage = getStorage();
    const issuerKey = await storage.getPrivateKey(issuer.id);

    const validityDays = parseInt(process.env.ACME_CERT_VALIDITY_DAYS, 10) || 90;

    const certData = await cryptoUtils.signCertificateRequest({
      csrPem,
      type: 'server',
      validityDays,
      issuerCert: issuer.certificatePem,
      issuerKey
    });

    const certificate = await Certificate.create({
      serialNumber: certData.serialNumber,
      type: 'server',
      userId: null,
      issuerId: issuer.id,
      commonName: certData.subject.commonName || order.identifiers[0].value,
      subjectAlternativeNames: certData.subjectAlternativeNames || [],
      organization: certData.subject.organization,
      organizationalUnit: certData.subject.organizationalUnit,
      country: certData.subject.country,
      state: certData.subject.state,
      locality: certData.subject.locality,
      email: certData.subject.email,
      keySize: certData.keySize || 0,
      algorithm: 'RSA-SHA256',
      publicKey: certData.publicKey,
      certificatePem: certData.certificate,
      fingerprint: certData.fingerprint,
      notBefore: certData.notBefore,
      notAfter: certData.notAfter,
      status: 'active',
      metadata: { acmeOrderId: order.id, acmeAccountId: account.id }
    });

    await storage.saveCertificate(certificate.id, certData.certificate);

    order.certificateId = certificate.id;
    order.status = 'valid';
    await order.save();

    logger.info('ACME order finalized', {
      orderId: order.id,
      certificateId: certificate.id,
      serialNumber: certificate.serialNumber
    });
  } catch (error) {
    order.status = 'invalid';
    order.error = (error instanceof problems.Problem
      ? error
      : problems.serverInternal(`Issuance failed: ${error.message}`)
    ).toJSON();
    await order.save();

    if (error instanceof problems.Problem) {
      throw error;
    }
    logger.error('ACME finalize issuance failed:', error);
    throw problems.serverInternal('Certificate issuance failed');
  }

  const authorizations = await AcmeAuthorization.findAll({ where: { orderId: order.id } });

  res.set('Location', urls.order(order.id));
  res.status(200).json(orderToJson(order, authorizations));
}));

router.post('/cert/:id', wrap(async (req, res) => {
  const { account } = await verifyJwsRequest(req, { acmeBase: acmeBase(), mode: 'kid' });

  const order = await AcmeOrder.findOne({
    where: { certificateId: req.params.id, accountId: account.id }
  });
  if (!order) {
    throw problems.notFound('Certificate not found');
  }

  const chain = await certificateService.getCertificateChain(req.params.id);
  if (!chain || chain.length === 0) {
    throw problems.notFound('Certificate not found');
  }

  const pemChain = chain
    .map(entry => String(entry.pem).trim())
    .join('\n') + '\n';

  res.status(200)
    .type('application/pem-certificate-chain')
    .send(pemChain);
}));

// ── Revocation ─────────────────────────────────────────────────────────

router.post('/revoke-cert', wrap(async (req, res) => {
  const { header, payload, account } = await verifyJwsRequest(req, {
    acmeBase: acmeBase(),
    mode: 'either'
  });

  if (!payload || typeof payload.certificate !== 'string') {
    throw problems.malformed('Revocation payload must include a base64url DER certificate');
  }

  let forgeCert;
  try {
    const certDer = Buffer.from(payload.certificate, 'base64url');
    forgeCert = forge.pki.certificateFromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(certDer.toString('binary')))
    );
  } catch (error) {
    throw problems.malformed(`Could not parse certificate: ${error.message}`);
  }

  const certificate = await Certificate.findOne({
    where: { serialNumber: { [Op.in]: serialCandidates(forgeCert.serialNumber) } }
  });
  if (!certificate) {
    throw problems.notFound('Certificate is not known to this CA');
  }

  if (certificate.status === 'revoked') {
    throw problems.alreadyRevoked();
  }

  // Authorization: account of record, or possession of the certificate key
  if (account) {
    const issuedToAccount = await AcmeOrder.findOne({
      where: { certificateId: certificate.id, accountId: account.id }
    });
    if (!issuedToAccount) {
      throw problems.unauthorized('Account did not issue this certificate');
    }
  } else {
    // JWS was signed with the certificate's own key (header.jwk path)
    let jwkSpki;
    let certSpki;
    try {
      jwkSpki = nodeCrypto
        .createPublicKey({ key: header.jwk, format: 'jwk' })
        .export({ type: 'spki', format: 'der' });
      certSpki = nodeCrypto
        .createPublicKey(forge.pki.publicKeyToPem(forgeCert.publicKey))
        .export({ type: 'spki', format: 'der' });
    } catch (error) {
      throw problems.badPublicKey(`Could not compare keys: ${error.message}`);
    }

    if (!jwkSpki.equals(certSpki)) {
      throw problems.unauthorized('JWS key does not match the certificate public key');
    }
  }

  let reason = 'unspecified';
  if (payload.reason !== undefined && payload.reason !== null) {
    reason = REASON_CODE_TO_NAME[payload.reason];
    if (!reason) {
      throw problems.badRevocationReason(`Unsupported revocation reason code: ${payload.reason}`);
    }
  }

  // Reuses the platform revocation path so CRL + OCSP pick it up
  await certificateService.revokeCertificate(certificate.id, reason, null);

  logger.info('ACME certificate revoked', {
    certificateId: certificate.id,
    serialNumber: certificate.serialNumber,
    reason
  });

  res.status(200).end();
}));

// ── Key change (not implemented) ───────────────────────────────────────

router.post('/key-change', wrap(async (req, res) => {
  await verifyJwsRequest(req, { acmeBase: acmeBase(), mode: 'kid' });
  throw new problems.Problem(
    501,
    'malformed',
    'Account key change is not implemented by this server'
  );
}));

module.exports = router;
