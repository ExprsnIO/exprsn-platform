'use strict';

/**
 * ───────────────────────────────────────────────────────────────────────────
 * Test-data seeder for the unified Exprsn platform.
 *
 * Creates (all rows marked seed=true / seed-* / @seed.test so they never
 * collide with real data and can be removed):
 *   - ORGS organizations            (+ full organization settings)
 *   - 1 root CA per org             (real node-forge RSA certs)
 *   - 1 intermediate CA per org     (signed by the org root)
 *   - USERS_PER_ORG users per org   (+ full user settings in metadata)
 *   - 1 entity cert per user        (signed by the org intermediate)
 *   - TOKENS_PER_USER CA tokens per user (real RSA-SHA256-PSS signed)
 *
 * Config (env): ORGS, USERS_PER_ORG, TOKENS_PER_USER, CONCURRENCY,
 *               SEED_SCRATCH, SEED_PASSWORD.
 *
 * Idempotent / resumable: identities are deterministic and a manifest under
 * SEED_SCRATCH records progress, so re-running tops up missing rows.
 * ───────────────────────────────────────────────────────────────────────────
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const {
  config, SCRATCH, MANIFEST, ensureScratch, loadManifest, saveManifest,
  orgSlug, orgName, userEmail, orgSettings, userMetadata, forkPhase,
} = require('./common');

// Auth models + service (orchestrator only touches the auth schema directly).
const {
  Organization, User, OrganizationMember, Role, UserRole,
} = require('../../services/auth/src/models');
const organizationService = require('../../services/auth/src/services/organizationService');

const ORG_TYPES = ['enterprise', 'team', 'personal'];
const PLANS = ['free', 'starter', 'professional', 'enterprise'];

function log(...a) { console.log(`[seed ${new Date().toISOString()}]`, ...a); }

async function main() {
  const t0 = Date.now();
  ensureScratch();
  const manifest = loadManifest();
  log(`config: orgs=${config.orgs} usersPerOrg=${config.usersPerOrg} tokensPerUser=${config.tokensPerUser} concurrency=${config.concurrency}`);
  log(`scratch=${SCRATCH}`);
  log(`manifest=${MANIFEST}`);

  // Precompute a single bcrypt hash (every seed user shares one password).
  const passwordHash = bcrypt.hashSync(config.password, 12);
  log(`seed login password: "${config.password}" (all seed users)`);

  // ── Preload reference data ────────────────────────────────────────────────
  const ownerRole = await Role.findOne({ where: { slug: 'org-owner', type: 'system' } });
  const memberRole = await Role.findOne({ where: { slug: 'org-member', type: 'system' } });

  // Existing seed users (resume): email -> id
  const existingUsers = new Map();
  const prior = await User.findAll({
    where: { email: { [require('sequelize').Op.like]: `seed-%@${config.emailDomain}` } },
    attributes: ['id', 'email'], raw: true,
  });
  for (const u of prior) existingUsers.set(u.email, u.id);
  log(`found ${existingUsers.size} pre-existing seed users`);

  // ── Phase 1: organizations + users + members + settings ───────────────────
  log('phase 1/5: organizations, users, members, settings');
  const orgRecords = [];
  for (let i = 0; i < config.orgs; i++) {
    const slug = orgSlug(i);
    const name = orgName(i);

    // Build the 100 user rows for this org.
    const userIds = [];
    const newUsers = [];
    for (let j = 0; j < config.usersPerOrg; j++) {
      const email = userEmail(i, j);
      let id = existingUsers.get(email);
      if (!id) {
        id = crypto.randomUUID();
        existingUsers.set(email, id);
        newUsers.push({
          id, email, passwordHash,
          displayName: `Seed User ${i}-${j}`,
          firstName: 'Seed', lastName: `U${i}-${j}`,
          emailVerified: true, status: 'active',
          metadata: userMetadata(i, j),
        });
      }
      userIds.push(id);
    }
    if (newUsers.length) await User.bulkCreate(newUsers, { validate: false });
    const ownerId = userIds[0];

    // Organization (reuse if it already exists).
    let org = await Organization.findOne({ where: { slug } });
    if (!org) {
      org = await organizationService.createOrganization({
        name, slug,
        description: `Seed organization #${i}`,
        type: ORG_TYPES[i % ORG_TYPES.length],
        plan: PLANS[i % PLANS.length],
        email: `org${i}@${config.emailDomain}`,
        settings: orgSettings(i),
        metadata: { seed: true, index: i },
      }, ownerId);
    } else if (!org.settings || !org.settings.seed) {
      await org.update({ settings: orgSettings(i), metadata: { seed: true, index: i } });
    }

    // Memberships + member roles for the remaining users (owner handled by service).
    const memberCount = await OrganizationMember.count({ where: { organizationId: org.id } });
    if (memberCount < config.usersPerOrg) {
      const existingMembers = new Set(
        (await OrganizationMember.findAll({ where: { organizationId: org.id }, attributes: ['userId'], raw: true }))
          .map((m) => m.userId)
      );
      const memberRows = [];
      const roleRows = [];
      for (let j = 1; j < userIds.length; j++) {
        const uid = userIds[j];
        if (existingMembers.has(uid)) continue;
        memberRows.push({
          id: crypto.randomUUID(), organizationId: org.id, userId: uid,
          role: 'member', status: 'active', joinedAt: new Date(),
        });
        if (memberRole) {
          roleRows.push({
            id: crypto.randomUUID(), userId: uid, roleId: memberRole.id,
            scope: 'organization', organizationId: org.id, status: 'active',
          });
        }
      }
      if (memberRows.length) await OrganizationMember.bulkCreate(memberRows, { ignoreDuplicates: true });
      if (roleRows.length) await UserRole.bulkCreate(roleRows, { ignoreDuplicates: true });
    }

    const existing = manifest.orgs[i] || {};
    orgRecords[i] = {
      idx: i, slug, name, orgId: org.id, ownerId, userIds,
      rootCertId: existing.rootCertId || null,
      rootSerial: existing.rootSerial || null,
      intermediateCertId: existing.intermediateCertId || null,
      intermediateSerial: existing.intermediateSerial || null,
    };
    if ((i + 1) % 10 === 0 || i === config.orgs - 1) log(`  orgs ${i + 1}/${config.orgs}`);
  }
  manifest.orgs = orgRecords;
  saveManifest(manifest);
  const totalUsers = orgRecords.reduce((s, o) => s + o.userIds.length, 0);
  log(`phase 1 done: ${orgRecords.length} orgs, ${totalUsers} users`);

  // ── Phase 2: root CA per org ──────────────────────────────────────────────
  log('phase 2/5: root CA certificates');
  const rootItems = [];
  const rootIdx = [];
  orgRecords.forEach((o) => {
    if (o.rootCertId) return;
    rootIdx.push(o.idx);
    rootItems.push({ commonName: `Seed Root CA ${o.slug}`, orgName: o.name, email: `ca${o.idx}@${config.emailDomain}`, ownerId: o.ownerId });
  });
  if (rootItems.length) {
    const res = await forkPhase('cert-worker.js', 'root', rootItems, config.concurrency,
      (p, t, f) => process.stdout.write(`\r  roots ${p}/${t} (failed ${f})   `));
    process.stdout.write('\n');
    res.forEach((r, k) => {
      if (r && r.ok) { const o = orgRecords[rootIdx[k]]; o.rootCertId = r.id; o.rootSerial = r.serial; }
    });
    saveManifest(manifest);
  }
  const rootsDone = orgRecords.filter((o) => o.rootCertId).length;
  log(`phase 2 done: ${rootsDone}/${orgRecords.length} roots`);

  // ── Phase 3: intermediate CA per org ──────────────────────────────────────
  log('phase 3/5: intermediate CA certificates');
  const intItems = [];
  const intIdx = [];
  orgRecords.forEach((o) => {
    if (!o.rootCertId || o.intermediateCertId) return;
    intIdx.push(o.idx);
    intItems.push({ rootCertId: o.rootCertId, commonName: `Seed Intermediate CA ${o.slug}`, orgName: o.name, ownerId: o.ownerId });
  });
  if (intItems.length) {
    const res = await forkPhase('cert-worker.js', 'intermediate', intItems, config.concurrency,
      (p, t, f) => process.stdout.write(`\r  intermediates ${p}/${t} (failed ${f})   `));
    process.stdout.write('\n');
    res.forEach((r, k) => {
      if (r && r.ok) { const o = orgRecords[intIdx[k]]; o.intermediateCertId = r.id; o.intermediateSerial = r.serial; }
    });
    saveManifest(manifest);
  }
  const intsDone = orgRecords.filter((o) => o.intermediateCertId).length;
  log(`phase 3 done: ${intsDone}/${orgRecords.length} intermediates`);

  // ── Phase 4: entity cert per user ─────────────────────────────────────────
  log('phase 4/5: entity certificates (1 per user)');
  manifest.entityCerts = manifest.entityCerts || {};
  const entItems = [];
  let g = 0;
  orgRecords.forEach((o) => {
    o.userIds.forEach((uid) => {
      const gi = g++;
      if (!o.intermediateCertId) return;
      if (manifest.entityCerts[uid]) return;
      entItems.push({
        userId: uid, issuerId: o.intermediateCertId,
        commonName: userEmailFor(o, uid), orgName: o.name,
        email: userEmailFor(o, uid),
        type: config.entityTypes[gi % config.entityTypes.length],
      });
    });
  });
  if (entItems.length) {
    const res = await forkPhase('cert-worker.js', 'entity', entItems, config.concurrency,
      (p, t, f) => process.stdout.write(`\r  entity certs ${p}/${t} (failed ${f})   `));
    process.stdout.write('\n');
    res.forEach((r, k) => {
      if (r && r.ok) manifest.entityCerts[entItems[k].userId] = { certId: r.id, serial: r.serial };
    });
    saveManifest(manifest);
  }
  const entDone = Object.keys(manifest.entityCerts).length;
  log(`phase 4 done: ${entDone} entity certs`);

  // ── Phase 5: CA tokens per user ───────────────────────────────────────────
  log('phase 5/5: CA tokens');
  manifest.tokensDone = manifest.tokensDone || {};
  const tokItems = [];
  orgRecords.forEach((o) => {
    o.userIds.forEach((uid) => {
      const ec = manifest.entityCerts[uid];
      if (!ec) return;
      const already = manifest.tokensDone[uid] || 0;
      const count = config.tokensPerUser - already;
      if (count <= 0) return;
      tokItems.push({ userId: uid, certId: ec.certId, serial: ec.serial, email: emailForUser(o, uid), count });
    });
  });
  const plannedTokens = tokItems.reduce((s, t) => s + t.count, 0);
  log(`  generating ${plannedTokens} tokens across ${tokItems.length} users`);
  if (tokItems.length) {
    const res = await forkPhase('token-worker.js', 'token', tokItems, config.concurrency,
      (p, t, f) => process.stdout.write(`\r  users with tokens ${p}/${t} (failed ${f})   `));
    process.stdout.write('\n');
    res.forEach((r, k) => {
      if (r && r.ok) {
        const uid = tokItems[k].userId;
        manifest.tokensDone[uid] = (manifest.tokensDone[uid] || 0) + (r.created || 0);
      }
    });
    saveManifest(manifest);
  }
  const tokTotal = Object.values(manifest.tokensDone).reduce((s, n) => s + n, 0);
  log(`phase 5 done: ${tokTotal} tokens recorded`);

  log(`ALL DONE in ${((Date.now() - t0) / 1000 / 60).toFixed(1)} min`);
  process.exit(0);
}

// Resolve a user's email from its org record (userIds are positional).
function userEmailFor(orgRec, uid) {
  const j = orgRec.userIds.indexOf(uid);
  return userEmail(orgRec.idx, j);
}
const emailForUser = userEmailFor;

main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
