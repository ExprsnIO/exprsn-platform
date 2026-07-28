/**
 * BUG-056 — fresh-bootstrap DBs could not register/login: every CA token mint
 * wrote `ca.audit_logs.user_id`, whose FK references `ca.users(id)`, but the
 * principal on platform mints is an AUTH user (auth.users) that is never
 * mirrored into ca.users. On a fresh DB (no legacy ca.users rows) the FK
 * violated and token issuance failed platform-wide.
 *
 * Fix under test: `AuditLog.log` writes the `user_id` FK column only when the
 * principal exists in ca.users; otherwise it writes NULL and preserves the
 * principal id in `details.principalUserId`, resolved BEFORE the entry hash is
 * computed so the tamper-evidence chain matches the stored row.
 *
 * Self-contained like cascade.test.js: the real AuditLog model file is loaded
 * on an UNCONNECTED Sequelize (definition never touches the DB) and the DB
 * touchpoints (transaction, findOne, create, User.findByPk) are stubbed.
 */

const { Sequelize } = require('sequelize');

const AUTH_USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const CA_USER_ID = '11111111-2222-4333-8444-555555555555';

function buildModels() {
  const sequelize = new Sequelize('ca_test', 'ca', 'ca', {
    host: 'localhost',
    dialect: 'postgres',
    logging: false
  });
  const AuditLog = require('../models/AuditLog')(sequelize, Sequelize.DataTypes);
  // Minimal stand-in so sequelize.models.User exists (the real model's shape
  // is irrelevant — findByPk is stubbed).
  const User = sequelize.define('User', { }, { tableName: 'users' });

  // Stub every DB touchpoint. `log` runs its principal lookup OUTSIDE the
  // chain transaction, then findOne (chain head) + create inside it.
  jest.spyOn(sequelize, 'transaction')
    .mockImplementation(async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }));
  jest.spyOn(AuditLog, 'findOne').mockResolvedValue(null);
  jest.spyOn(AuditLog, 'create').mockImplementation(async (entry) => entry);
  const findByPk = jest.spyOn(User, 'findByPk');

  return { AuditLog, findByPk };
}

afterEach(() => jest.restoreAllMocks());

describe('BUG-056 — AuditLog.log with non-CA-local principals', () => {
  test('auth-user principal (not in ca.users) writes NULL user_id and keeps the id in details', async () => {
    const { AuditLog, findByPk } = buildModels();
    findByPk.mockResolvedValue(null); // not a CA-local user

    const entry = await AuditLog.log({
      userId: AUTH_USER_ID,
      action: 'token.generate',
      resourceType: 'token',
      resourceId: CA_USER_ID,
      details: { tokenId: 'tok-1' }
    });

    expect(findByPk).toHaveBeenCalledWith(AUTH_USER_ID, expect.objectContaining({ attributes: ['id'] }));
    expect(entry.userId).toBeNull();
    expect(entry.details).toEqual({ tokenId: 'tok-1', principalUserId: AUTH_USER_ID });
    // Hash chain must be computed over the STORED shape (null userId).
    expect(entry.entryHash).toMatch(/^[0-9a-f]{64}$/);
  });

  test('CA-local principal keeps its user_id FK value', async () => {
    const { AuditLog, findByPk } = buildModels();
    findByPk.mockResolvedValue({ id: CA_USER_ID }); // exists in ca.users

    const entry = await AuditLog.log({
      userId: CA_USER_ID,
      action: 'user.login'
    });

    expect(entry.userId).toBe(CA_USER_ID);
    expect(entry.details).toEqual({});
    expect(entry.details.principalUserId).toBeUndefined();
  });

  test('malformed (non-UUID) principal never hits the DB and fails toward NULL', async () => {
    const { AuditLog, findByPk } = buildModels();

    const entry = await AuditLog.log({
      userId: 'system',
      action: 'token.generate'
    });

    expect(findByPk).not.toHaveBeenCalled();
    expect(entry.userId).toBeNull();
    expect(entry.details).toEqual({ principalUserId: 'system' });
  });

  test('principal lookup failure fails toward NULL, never toward an FK violation', async () => {
    const { AuditLog, findByPk } = buildModels();
    findByPk.mockRejectedValue(new Error('connection refused'));

    const entry = await AuditLog.log({
      userId: AUTH_USER_ID,
      action: 'token.generate'
    });

    expect(entry.userId).toBeNull();
    expect(entry.details).toEqual({ principalUserId: AUTH_USER_ID });
  });

  test('absent principal (system action) stays NULL with untouched details', async () => {
    const { AuditLog, findByPk } = buildModels();

    const entry = await AuditLog.log({ action: 'crl.generate' });

    expect(findByPk).not.toHaveBeenCalled();
    expect(entry.userId).toBeNull();
    expect(entry.details).toEqual({});
  });
});
