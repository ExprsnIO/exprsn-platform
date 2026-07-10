/**
 * ═══════════════════════════════════════════════════════════════════════
 * Exprsn Certificate Authority - Database Models
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Sequelize } = require('sequelize');
const config = require('../config');

// Initialize Sequelize
const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: config.database.dialect,
    pool: config.database.pool,
    logging: config.database.logging,
    // platform: tables namespaced under 'ca' schema
    define: {
      schema: 'ca'
    },
    dialectOptions: config.database.ssl ? {
      // Verify the DB server cert by default; explicit opt-out only (matches the
      // platform convention in src/db/sequelize.js).
      ssl: {
        require: true,
        rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false'
      }
    } : {}
  }
);

// Import models
const User = require('./User')(sequelize, Sequelize.DataTypes);
const Profile = require('./Profile')(sequelize, Sequelize.DataTypes);
const Group = require('./Group')(sequelize, Sequelize.DataTypes);
const UserGroup = require('./UserGroup')(sequelize, Sequelize.DataTypes);
const Role = require('./Role')(sequelize, Sequelize.DataTypes);
const RoleSet = require('./RoleSet')(sequelize, Sequelize.DataTypes);
const Certificate = require('./Certificate')(sequelize, Sequelize.DataTypes);
const Token = require('./Token')(sequelize, Sequelize.DataTypes);
const Ticket = require('./Ticket')(sequelize, Sequelize.DataTypes);
const RevocationList = require('./RevocationList')(sequelize, Sequelize.DataTypes);
const AuditLog = require('./AuditLog')(sequelize, Sequelize.DataTypes);
const RateLimit = require('./RateLimit')(sequelize, Sequelize.DataTypes);
const PasswordReset = require('./PasswordReset')(sequelize, Sequelize.DataTypes);
const CrlCounter = require('./CrlCounter')(sequelize, Sequelize.DataTypes);
const AcmeAccount = require('./AcmeAccount')(sequelize, Sequelize.DataTypes);
const AcmeOrder = require('./AcmeOrder')(sequelize, Sequelize.DataTypes);
const AcmeAuthorization = require('./AcmeAuthorization')(sequelize, Sequelize.DataTypes);
const AcmeChallenge = require('./AcmeChallenge')(sequelize, Sequelize.DataTypes);
const AcmeNonce = require('./AcmeNonce')(sequelize, Sequelize.DataTypes);

// ═══════════════════════════════════════════════════════════════════════
// Model Associations
// ═══════════════════════════════════════════════════════════════════════

// User <-> Profile (One-to-Many)
User.hasMany(Profile, { foreignKey: 'userId', as: 'profiles', onDelete: 'CASCADE' });
Profile.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// User <-> Group (Many-to-Many, through UserGroup which carries the membership role)
User.belongsToMany(Group, { through: UserGroup, as: 'groups', foreignKey: 'userId' });
Group.belongsToMany(User, { through: UserGroup, as: 'users', foreignKey: 'groupId' });

// User <-> Role (Many-to-Many)
User.belongsToMany(Role, { through: 'UserRoles', as: 'roles', foreignKey: 'userId' });
Role.belongsToMany(User, { through: 'UserRoles', as: 'users', foreignKey: 'roleId' });

// Role <-> RoleSet (Many-to-Many)
Role.belongsToMany(RoleSet, { through: 'RoleSetRoles', as: 'roleSets', foreignKey: 'roleId' });
RoleSet.belongsToMany(Role, { through: 'RoleSetRoles', as: 'roles', foreignKey: 'roleSetId' });

// Group <-> RoleSet (Many-to-Many)
Group.belongsToMany(RoleSet, { through: 'GroupRoleSets', as: 'roleSets', foreignKey: 'groupId' });
RoleSet.belongsToMany(Group, { through: 'GroupRoleSets', as: 'groups', foreignKey: 'roleSetId' });

// Certificate <-> User (Many-to-One)
Certificate.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Certificate, { foreignKey: 'userId', as: 'certificates' });

// Certificate <-> Certificate (Self-referential for CA hierarchy)
Certificate.belongsTo(Certificate, { foreignKey: 'issuerId', as: 'issuer' });
Certificate.hasMany(Certificate, { foreignKey: 'issuerId', as: 'issued' });

// Token <-> Certificate (Many-to-One)
Token.belongsTo(Certificate, { foreignKey: 'certificateId', as: 'certificate' });
Certificate.hasMany(Token, { foreignKey: 'certificateId', as: 'tokens' });

// Token <-> User (Many-to-One)
Token.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Token, { foreignKey: 'userId', as: 'tokens' });

// Token <-> Group scoping (spec v1.1): optional group / organization the token
// was issued for; admins of either may invalidate the token.
Token.belongsTo(Group, { foreignKey: 'groupId', as: 'group' });
Token.belongsTo(Group, { foreignKey: 'organizationId', as: 'organization' });

// Ticket <-> User (Many-to-One)
Ticket.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Ticket, { foreignKey: 'userId', as: 'tickets' });

// RevocationList <-> Certificate (Many-to-One)
RevocationList.belongsTo(Certificate, { foreignKey: 'certificateId', as: 'certificate' });
Certificate.hasMany(RevocationList, { foreignKey: 'certificateId', as: 'revocations' });

// AuditLog <-> User (Many-to-One)
AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });

// Group <-> Group (Self-referential for group nesting)
Group.belongsTo(Group, { foreignKey: 'parentId', as: 'parent' });
Group.hasMany(Group, { foreignKey: 'parentId', as: 'children' });

// RateLimit <-> User (Many-to-One)
RateLimit.belongsTo(User, { foreignKey: 'targetId', as: 'user', constraints: false });
User.hasMany(RateLimit, { foreignKey: 'targetId', as: 'rateLimits', constraints: false });

// RateLimit <-> Group (Many-to-One)
RateLimit.belongsTo(Group, { foreignKey: 'targetId', as: 'group', constraints: false });
Group.hasMany(RateLimit, { foreignKey: 'targetId', as: 'rateLimits', constraints: false });

// PasswordReset <-> User (Many-to-One)
PasswordReset.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(PasswordReset, { foreignKey: 'userId', as: 'passwordResets' });

// PasswordReset <-> User (initiatedBy)
PasswordReset.belongsTo(User, { foreignKey: 'initiatedBy', as: 'initiator' });
User.hasMany(PasswordReset, { foreignKey: 'initiatedBy', as: 'initiatedResets' });

// CrlCounter <-> Certificate (issuing CA)
// BUG-025: a crl_counter is a strict dependent of its issuing certificate; it
// dies with the issuer. Explicit CASCADE (was the hasOne default, now stated) +
// live migration 20260710000001 to match.
CrlCounter.belongsTo(Certificate, {
  foreignKey: { name: 'issuerId', allowNull: false }, as: 'issuer',
  onDelete: 'CASCADE', onUpdate: 'CASCADE',
});
Certificate.hasOne(CrlCounter, {
  foreignKey: { name: 'issuerId', allowNull: false }, as: 'crlCounter',
  onDelete: 'CASCADE', onUpdate: 'CASCADE',
});

// AcmeAccount <-> AcmeOrder (One-to-Many)
AcmeAccount.hasMany(AcmeOrder, { foreignKey: 'accountId', as: 'orders', onDelete: 'CASCADE' });
AcmeOrder.belongsTo(AcmeAccount, { foreignKey: 'accountId', as: 'account' });

// AcmeOrder <-> AcmeAuthorization (One-to-Many)
AcmeOrder.hasMany(AcmeAuthorization, { foreignKey: 'orderId', as: 'authorizations', onDelete: 'CASCADE' });
AcmeAuthorization.belongsTo(AcmeOrder, { foreignKey: 'orderId', as: 'order' });

// AcmeAccount <-> AcmeAuthorization (One-to-Many)
AcmeAccount.hasMany(AcmeAuthorization, { foreignKey: 'accountId', as: 'authorizations', onDelete: 'CASCADE' });
AcmeAuthorization.belongsTo(AcmeAccount, { foreignKey: 'accountId', as: 'account' });

// AcmeAuthorization <-> AcmeChallenge (One-to-Many)
AcmeAuthorization.hasMany(AcmeChallenge, { foreignKey: 'authorizationId', as: 'challenges', onDelete: 'CASCADE' });
AcmeChallenge.belongsTo(AcmeAuthorization, { foreignKey: 'authorizationId', as: 'authorization' });

// AcmeOrder <-> Certificate (issued certificate)
AcmeOrder.belongsTo(Certificate, { foreignKey: 'certificateId', as: 'certificate' });
Certificate.hasMany(AcmeOrder, { foreignKey: 'certificateId', as: 'acmeOrders' });

const db = {
  sequelize,
  Sequelize,
  User,
  Profile,
  Group,
  UserGroup,
  Role,
  RoleSet,
  Certificate,
  Token,
  Ticket,
  RevocationList,
  AuditLog,
  RateLimit,
  PasswordReset,
  CrlCounter,
  AcmeAccount,
  AcmeOrder,
  AcmeAuthorization,
  AcmeChallenge,
  AcmeNonce
};

module.exports = db;
