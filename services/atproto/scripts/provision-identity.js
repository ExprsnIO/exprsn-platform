/**
 * ═══════════════════════════════════════════════════════════
 * Provision the labeler identity  (npm run atproto:provision)
 *
 * Generates a k256 signing keypair, derives the DID (did:web by default),
 * persists a LabelerIdentity row, and prints:
 *   - the private key (hex) → store it as the env var named by
 *     ATPROTO_SIGNING_KEY_REF (default ATPROTO_SIGNING_KEY); NEVER commit it.
 *   - the DID document to serve at /.well-known/did.json (already served live).
 *   - the app.bsky.labeler.service record to publish.
 *
 * Run once per environment. Re-running rotates the key (old rows go inactive).
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();

const config = require('../config');
const logger = require('../utils/logger');
const models = require('../models');
const identityService = require('../src/labeler/identityService');

async function main() {
  await models.sequelize.authenticate();
  await models.sequelize.sync(); // ensure atproto tables exist (idempotent)

  const result = await identityService.provision({ models });
  const { identity, privateKeyHex, didKey, needsToken } = result;
  const didDoc = identityService.buildDidDocument({
    did: identity.did,
    publicKeyMultibase: identity.publicKeyMultibase,
    host: config.labeler.host,
  });
  const serviceRecord = identityService.buildServiceRecord(config.labeler.labelValues);

  /* eslint-disable no-console */
  console.log('\n════════════════════════════════════════════════════════');
  console.log(' Labeler identity provisioned');
  console.log('════════════════════════════════════════════════════════');
  console.log(`DID:            ${identity.did}`);
  console.log(`DID method:     ${identity.didMethod}`);
  console.log(`Signing did:key ${didKey}`);
  console.log(`Public key:     ${identity.publicKeyMultibase}`);
  if (privateKeyHex) {
    console.log('\n── SECRET — store securely, do NOT commit ──');
    console.log(`${config.labeler.signingKeyRef}=${privateKeyHex}`);
  } else {
    console.log('\n(reused existing signing key from ' + config.labeler.signingKeyRef + ')');
  }
  console.log('\n── /.well-known/did.json (served live by the gateway) ──');
  console.log(JSON.stringify(didDoc, null, 2));
  console.log('\n── app.bsky.labeler.service record (rkey: self) ──');
  console.log(JSON.stringify(serviceRecord, null, 2));

  if (identity.didMethod === 'plc' && needsToken) {
    console.log('\n⚠ did:plc — the service record is PUBLISHED, but the DID document still');
    console.log('  needs the label key + labeler service. A PLC signature token was emailed');
    console.log('  to the PDS account. Set the secret above, then re-run with:');
    console.log('    ATPROTO_PLC_TOKEN=<token-from-email> npm run atproto:provision');
  } else if (identity.didMethod === 'plc') {
    console.log('\n✓ did:plc — PLC operation submitted; the DID document now advertises the');
    console.log('  label key + labeler service. Bluesky AppViews can subscribe via your DID.');
  } else {
    console.log('\nNext: set the secret env var above. For did:web/did:exprsn nothing else is');
    console.log('needed — /.well-known/did.json (web) and resolveDid (exprsn) are served live.');
  }
  /* eslint-enable no-console */

  await models.sequelize.close();
  process.exit(0);
}

main().catch((err) => {
  logger.error('Provisioning failed', { error: err.message, stack: err.stack });
  process.exit(1);
});
