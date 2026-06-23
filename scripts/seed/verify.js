'use strict';

/**
 * Verifies seeded data: picks a seed token and runs the REAL
 * tokenService.validateToken (signature + checksum + cert chain), and prints
 * one org's settings + one user's settings to confirm they were populated.
 */

require('./common'); // sets env + loads .env
const { Op } = require('sequelize');
const { Token, Certificate } = require('../../services/ca/models');
const tokenService = require('../../services/ca/services/token');
const { Organization, User } = require('../../services/auth/src/models');

async function main() {
  // Pick a recent seed token (metadata.seed = true).
  const tok = await Token.findOne({
    where: { metadata: { seed: true } },
    order: [['createdAt', 'DESC']],
  });
  if (!tok) { console.log('no seed tokens found'); process.exit(1); }
  console.log(`verifying token ${tok.id} (cert ${tok.certificateId}, expiry ${tok.expiryType})`);

  const result = await tokenService.validateToken(tok.id);
  console.log('validateToken =>', JSON.stringify({ valid: result.valid, error: result.error, userId: result.userId, permissions: result.permissions }));

  const org = await Organization.findOne({ where: { slug: { [Op.like]: 'seed-org-%' } } });
  console.log('org settings =>', JSON.stringify(org && org.settings));
  const user = await User.findOne({ where: { email: { [Op.like]: `seed-%@seed.test` } } });
  console.log('user settings (metadata) =>', JSON.stringify(user && user.metadata));

  process.exit(result.valid ? 0 : 2);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
