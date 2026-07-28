/**
 * BUG-056 (structural guard) — no ca model may declare a database FK onto a
 * "user id" column: those columns hold PLATFORM (auth.users) ids, ca.users is
 * a separate vestigial identity store, and model sync turns any declaration
 * into a real FK on fresh installs — which broke register/login platform-wide
 * (tokens_user_id_fkey) and would break org provisioning (UserGroups.user_id,
 * written with auth ids by services/directory.js).
 *
 * Two declaration channels are guarded:
 *   1. attribute-level `references: { model: 'users' }` on the model files,
 *   2. association-level constraints — every association touching User must
 *      carry `constraints: false` (the RateLimit pattern).
 *
 * Loads the REAL ../models index (association wiring included; requiring it
 * never connects). Intra-ca FKs must survive — they are correct and wanted.
 */

const models = require('../models');

// (model, attribute) pairs that hold platform/auth user ids. Mirrors the
// drift-allow.json "ca cross-schema user refs" set + the UserGroups junction.
const AUTH_ID_ATTRIBUTES = [
  ['Profile', 'userId'],
  ['Certificate', 'userId'],
  ['Token', 'userId'],
  ['Ticket', 'userId'],
  ['AuditLog', 'userId'],
  ['PasswordReset', 'userId'],
  ['PasswordReset', 'initiatedBy'],
  ['RateLimit', 'targetId'],
  ['UserGroup', 'userId'],
];

describe('BUG-056 — ca models declare no FK onto auth-user id columns', () => {
  test.each(AUTH_ID_ATTRIBUTES)(
    '%s.%s carries no attribute-level references',
    (modelName, attr) => {
      const attribute = models[modelName].rawAttributes[attr];
      expect(attribute).toBeDefined();
      expect(attribute.references).toBeUndefined();
    }
  );

  test('every association touching User carries constraints: false', () => {
    // Exception: User<->Role through UserRoles is CA-LOCAL — user_roles rows
    // are written via `user.addRole(...)` on ca User instances (setup.js), so
    // its FK to ca.users is correct and stays.
    const CA_LOCAL_OK = new Set(['User.roles', 'Role.users']);
    const offenders = [];
    for (const model of Object.values(models.sequelize.models)) {
      for (const assoc of Object.values(model.associations || {})) {
        const touchesUser =
          (assoc.target && assoc.target.name === 'User') ||
          (assoc.source && assoc.source.name === 'User');
        if (!touchesUser) continue;
        if (CA_LOCAL_OK.has(`${model.name}.${assoc.as}`)) continue;
        if (assoc.options && assoc.options.constraints === false) continue;
        offenders.push(`${model.name}.${assoc.as} (${assoc.associationType})`);
      }
    }
    // Pre-fix this listed Token.user/User.tokens (the register/login breaker),
    // Certificate/Ticket/AuditLog/Profile/PasswordReset pairs, and the
    // User<->Group belongsToMany whose junction sync FK'd UserGroups.user_id.
    expect(offenders).toEqual([]);
  });

  test('intra-ca FKs are untouched (still declared)', () => {
    expect(models.Token.rawAttributes.certificateId.references).toMatchObject({ model: 'certificates' });
    expect(models.UserGroup.rawAttributes.groupId.references).toMatchObject({ model: 'groups' });
    expect(models.Certificate.rawAttributes.issuerId.references).toMatchObject({ model: 'certificates' });
    expect(models.RevocationList.rawAttributes.certificateId.references).toMatchObject({ model: 'certificates' });
    // Association-level constraints stay ON for intra-ca relations.
    expect(models.Token.associations.certificate.options.constraints).not.toBe(false);
  });
});
