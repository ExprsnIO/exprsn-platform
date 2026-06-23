/**
 * ═══════════════════════════════════════════════════════════
 * Labeler identity service
 *
 * Provisions and serves the labeler's AT-Protocol identity:
 *   - generate a k256 signing keypair (keyManager)
 *   - derive the DID (did:web from our host; did:plc deferred)
 *   - build the DID document (#atproto_label key + #atproto_labeler service)
 *   - build the app.bsky.labeler.service declaration (labelValueDefinitions)
 *   - persist a LabelerIdentity row
 *
 * did:web is the MVP path — self-host /.well-known/did.json, no PDS/PLC
 * dependency. did:plc requires a PDS repo to hold the service record and a PLC
 * directory operation; provisioning that is left as a follow-up.
 * ═══════════════════════════════════════════════════════════
 */

const config = require('../../config');
const logger = require('../../utils/logger');
const { generateKeypair, getKeypair, resolvePrivateKeyHex } = require('./keyManager');
const didResolver = require('../identity/didResolver');
const { PdsClient } = require('../identity/pdsClient');

/**
 * Encode a host (may include :port) as the did:web identifier suffix.
 * labeler.exprsn.io        → did:web:labeler.exprsn.io
 * localhost:8443           → did:web:localhost%3A8443
 */
function didWebFromHost(host) {
  const encoded = String(host).replace(/:(\d+)$/, '%3A$1');
  return `did:web:${encoded}`;
}

/** Build the verificationMethod + service entries of the DID document. */
function buildDidDocument({ did, publicKeyMultibase, host }) {
  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      'https://w3id.org/security/multikey/v1',
    ],
    id: did,
    verificationMethod: [
      {
        id: `${did}#atproto_label`,
        type: 'Multikey',
        controller: did,
        publicKeyMultibase,
      },
    ],
    service: [
      {
        id: '#atproto_labeler',
        type: 'AtprotoLabeler',
        serviceEndpoint: `https://${host}`,
      },
      {
        id: '#bsky_fg',
        type: 'BskyFeedGenerator',
        serviceEndpoint: `https://${host}`,
      },
    ],
  };
}

/**
 * Build the app.bsky.labeler.service record (rkey `self`). `labelValues` are the
 * values this labeler may apply; `labelValueDefinitions` give clients severity +
 * blur behaviour + localized strings. We derive sane defaults per value.
 */
function buildServiceRecord(labelValues, createdAt) {
  const SEVERITY = { '!hide': 'alert', '!warn': 'inform' };
  const BLURS = { nsfw: 'media', violence: 'media' };
  const definitions = labelValues
    // System values (!hide / !warn) are built-in; don't redefine them.
    .filter((v) => !v.startsWith('!'))
    .map((identifier) => ({
      identifier,
      severity: SEVERITY[identifier] || 'inform',
      blurs: BLURS[identifier] || 'none',
      defaultSetting: 'warn',
      adultOnly: identifier === 'nsfw',
      locales: [
        {
          lang: 'en',
          name: identifier,
          description: `Content labeled "${identifier}" by the Exprsn moderation service.`,
        },
      ],
    }));

  return {
    $type: 'app.bsky.labeler.service',
    policies: {
      labelValues,
      labelValueDefinitions: definitions,
    },
    createdAt: createdAt || new Date().toISOString(),
  };
}

/**
 * Provision a new labeler identity. Generates a keypair, derives the DID, and
 * persists a LabelerIdentity row (marking older rows inactive). Returns the new
 * row plus the freshly generated privateKeyHex — the CALLER must store the key
 * securely and must not persist it to the DB.
 */
async function provision({ models, didMethod = config.labeler.didMethod, host = config.labeler.host }) {
  // did:plc against a real PDS is its own flow (publish record + PLC op).
  if (didMethod === 'plc' && config.labeler.pds.url) {
    return provisionPlc({ models });
  }

  const { LabelerIdentity } = models;
  const { did: didKey, privateKeyHex, publicKeyMultibase } = await generateKeypair();

  let did;
  if (didMethod === 'exprsn') {
    // Self-certifying: the DID embeds the public key, so it's resolvable offline.
    did = didResolver.didExprsnFromKey(publicKeyMultibase);
  } else if (didMethod === 'web') {
    did = config.labeler.did || didWebFromHost(host);
  } else if (didMethod === 'plc') {
    // did:plc requires creating a PDS repo + PLC directory op to hold the
    // service record. Not automated yet — require an externally provisioned DID.
    if (!config.labeler.did) {
      throw new Error('did:plc provisioning is not automated; set ATPROTO_DID to a pre-created did:plc.');
    }
    did = config.labeler.did;
  } else {
    throw new Error(`Unsupported ATPROTO_DID_METHOD: ${didMethod}`);
  }

  await LabelerIdentity.update({ active: false }, { where: { active: true } });
  // did:web/did:plc DIDs are stable across key rotations (host/PLC-derived), so a
  // re-provision must UPDATE the existing row rather than insert a duplicate
  // (unique `did`). Self-certifying methods (did:exprsn/did:key) get a fresh did.
  const fields = {
    did,
    didMethod,
    signingKeyId: 'atproto_label',
    publicKeyMultibase,
    privateKeyRef: config.labeler.signingKeyRef,
    active: true,
  };
  const existing = await LabelerIdentity.findOne({ where: { did } });
  let row;
  if (existing) {
    row = await existing.update(fields);
  } else {
    row = await LabelerIdentity.create(fields);
  }

  logger.info('Provisioned labeler identity', { did, didKey, didMethod });
  return { identity: row, privateKeyHex, publicKeyMultibase, didKey };
}

/**
 * Provision a PUBLIC did:plc labeler against a PDS account. Two phases, because
 * the PLC operation needs an email-delivered token:
 *
 *   Phase 1 (no token): log in, PUBLISH the app.bsky.labeler.service record, and
 *     request a PLC signature token (emailed to the account). Returns
 *     `{ needsToken: true }` — re-run with ATPROTO_PLC_TOKEN to finish.
 *   Phase 2 (token present): sign + submit the PLC op that adds our
 *     #atproto_label key + #atproto_labeler service to the DID document.
 *
 * Reuses the configured signing key if present, else generates one. Persists the
 * LabelerIdentity row using the PDS account's did:plc.
 */
async function provisionPlc({ models, fetchImpl = fetch }) {
  const { url, handle, password, plcToken } = config.labeler.pds;
  if (!url || !handle || !password) {
    throw new Error('did:plc provisioning needs ATPROTO_PDS_URL, ATPROTO_PDS_HANDLE, ATPROTO_PDS_PASSWORD.');
  }

  const pds = new PdsClient({ url, fetchImpl });
  const session = await pds.login(handle, password);
  const did = session.did; // the account's did:plc
  if (!did.startsWith('did:plc:')) {
    logger.warn('PDS account DID is not did:plc', { did });
  }

  // Signing key: reuse the configured one (stable across phases) or mint a new one.
  let didKey;
  let publicKeyMultibase;
  let privateKeyHex = null;
  if (resolvePrivateKeyHex()) {
    const kp = await getKeypair();
    didKey = kp.did();
    publicKeyMultibase = didKey.replace(/^did:key:/, '');
  } else {
    ({ did: didKey, publicKeyMultibase, privateKeyHex } = await generateKeypair());
  }

  // Publish the labeler service declaration (works without the PLC op).
  const serviceRecord = buildServiceRecord(config.labeler.labelValues);
  const put = await pds.putRecord({
    repo: did,
    collection: 'app.bsky.labeler.service',
    rkey: 'self',
    record: serviceRecord,
  });
  logger.info('Published app.bsky.labeler.service', { did, cid: put.cid });

  // Persist/refresh the identity row now (service record is live).
  await models.LabelerIdentity.update({ active: false }, { where: { active: true } });
  const existing = await models.LabelerIdentity.findOne({ where: { did } });
  const fields = {
    did,
    didMethod: 'plc',
    signingKeyId: 'atproto_label',
    publicKeyMultibase,
    privateKeyRef: config.labeler.signingKeyRef,
    serviceRecordCid: put.cid || null,
    publishedAt: new Date(),
    active: true,
  };
  const identity = existing ? await existing.update(fields) : await models.LabelerIdentity.create(fields);

  // PLC operation: add our label key + labeler service to the DID document.
  if (!plcToken) {
    await pds.requestPlcOperationSignature().catch((err) =>
      logger.warn('requestPlcOperationSignature failed', { error: err.message })
    );
    return { identity, didKey, publicKeyMultibase, privateKeyHex, needsToken: true };
  }

  const recommended = await pds.getRecommendedDidCredentials();
  const operation = await pds.signPlcOperation({
    token: plcToken,
    rotationKeys: recommended.rotationKeys,
    alsoKnownAs: recommended.alsoKnownAs,
    verificationMethods: { ...(recommended.verificationMethods || {}), atproto_label: didKey },
    services: {
      ...(recommended.services || {}),
      atproto_labeler: { type: 'AtprotoLabeler', endpoint: `https://${config.labeler.host}` },
    },
  });
  await pds.submitPlcOperation(operation.operation || operation);
  logger.info('Submitted PLC operation (label key + labeler service added)', { did });

  return { identity, didKey, publicKeyMultibase, privateKeyHex, needsToken: false };
}

/** Load the active labeler identity row (or null). */
async function loadActive(models) {
  return models.LabelerIdentity.findOne({ where: { active: true } });
}

/**
 * Resolve the served DID document, preferring the active DB identity and
 * falling back to config (so /.well-known works before a row exists).
 */
async function getDidDocument(models) {
  const active = await loadActive(models);
  const host = config.labeler.host;
  if (active) {
    if (active.didMethod === 'exprsn' || active.didMethod === 'key') {
      return didResolver.buildSelfCertifyingDoc(active.did, active.publicKeyMultibase, host);
    }
    return buildDidDocument({
      did: active.did,
      publicKeyMultibase: active.publicKeyMultibase,
      host,
    });
  }
  if (config.labeler.did) {
    return buildDidDocument({
      did: config.labeler.did,
      publicKeyMultibase: 'z0000000000000000000000000000000000000000000000000',
      host,
    });
  }
  return null;
}

module.exports = {
  provision,
  provisionPlc,
  loadActive,
  getDidDocument,
  buildDidDocument,
  buildServiceRecord,
  didWebFromHost,
};
