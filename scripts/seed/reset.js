'use strict';

/**
 * Deletes all seeder-created data (rows marked seed / seed-* / @seed.test).
 * Real data (non-seed orgs/users/certs/tokens) is untouched.
 * Usage: node scripts/seed/reset.js
 */

require('./common');
const { sequelize: caSeq } = require('../../services/ca/models');
const { sequelize: authSeq } = require('../../services/auth/src/models');

async function main() {
  // CA schema: tokens -> entity certs -> intermediates -> roots (FK order).
  const [tok] = await caSeq.query(`DELETE FROM ca.tokens WHERE metadata->>'seed'='true'`);
  const [ent] = await caSeq.query(`DELETE FROM ca.certificates WHERE type IN ('client','server','code_signing') AND organization LIKE 'Seed Org%'`);
  const [inter] = await caSeq.query(`DELETE FROM ca.certificates WHERE type='intermediate' AND organization LIKE 'Seed Org%'`);
  const [root] = await caSeq.query(`DELETE FROM ca.certificates WHERE type='root' AND organization LIKE 'Seed Org%'`);

  // Auth schema uses quoted camelCase columns. Order: roles + members -> orgs -> users.
  await authSeq.query(`DELETE FROM auth.user_roles WHERE "organizationId" IN (SELECT id FROM auth.organizations WHERE slug LIKE 'seed-org-%')`);
  await authSeq.query(`DELETE FROM auth.organization_members WHERE "organizationId" IN (SELECT id FROM auth.organizations WHERE slug LIKE 'seed-org-%')`);
  await authSeq.query(`DELETE FROM auth.organizations WHERE slug LIKE 'seed-org-%'`);
  await authSeq.query(`DELETE FROM auth.users WHERE email LIKE 'seed-%@seed.test'`);

  console.log(`reset done. deleted ~ tokens, entity/intermediate/root certs, plus seed orgs/users/members/roles.`);
  process.exit(0);
}

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
