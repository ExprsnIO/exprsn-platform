/**
 * ═══════════════════════════════════════════════════════════════════════
 * CA Service Seeder - Users, Profiles, Certificates, Tokens, Roles, Groups
 * ═══════════════════════════════════════════════════════════════════════
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const path = require('path');

// Import CA models
const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(
  process.env.CA_DB_NAME || 'exprsn_ca',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
  }
);

// Load models
const models = {};
const modelsPath = path.join(__dirname, '../src/exprsn-ca/models');
const fs = require('fs');

// Initialize models
Object.keys(require(modelsPath)).forEach(modelName => {
  if (modelName !== 'sequelize' && modelName !== 'Sequelize') {
    models[modelName] = sequelize.models[modelName];
  }
});

async function seed() {
  const startTime = Date.now();
  let recordsCreated = 0;

  try {
    await sequelize.authenticate();
    console.log('  Connected to exprsn_ca database');

    // Load all models
    const db = require(modelsPath);
    const User = db.User;
    const Profile = db.Profile;
    const Certificate = db.Certificate;
    const Token = db.Token;
    const Role = db.Role;
    const RoleSet = db.RoleSet;
    const Group = db.Group;
    const Ticket = db.Ticket;
    const AuditLog = db.AuditLog;
    const RateLimit = db.RateLimit;

    // Sample data arrays
    const users = [];
    const profiles = [];
    const groups = [];
    const roles = [];

    // ═══════════════════════════════════════════════════════════════════
    // 1. Create Users (50 sample users)
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating users...');

    const passwordHash = await bcrypt.hash('Password123!', 12);

    const sampleUsers = [
      { username: 'admin', email: 'admin@exprsn.io', firstName: 'Admin', lastName: 'User', status: 'active', emailVerified: true },
      { username: 'johndoe', email: 'john.doe@example.com', firstName: 'John', lastName: 'Doe', status: 'active', emailVerified: true },
      { username: 'janedoe', email: 'jane.doe@example.com', firstName: 'Jane', lastName: 'Doe', status: 'active', emailVerified: true },
      { username: 'bobsmith', email: 'bob.smith@example.com', firstName: 'Bob', lastName: 'Smith', status: 'active', emailVerified: true },
      { username: 'alicejones', email: 'alice.jones@example.com', firstName: 'Alice', lastName: 'Jones', status: 'active', emailVerified: false },
      { username: 'charlie', email: 'charlie@example.com', firstName: 'Charlie', lastName: 'Brown', status: 'active', emailVerified: true },
      { username: 'david', email: 'david@example.com', firstName: 'David', lastName: 'Wilson', status: 'suspended', emailVerified: true },
      { username: 'emma', email: 'emma@example.com', firstName: 'Emma', lastName: 'Davis', status: 'active', emailVerified: true },
      { username: 'frank', email: 'frank@example.com', firstName: 'Frank', lastName: 'Miller', status: 'pending', emailVerified: false },
      { username: 'grace', email: 'grace@example.com', firstName: 'Grace', lastName: 'Lee', status: 'active', emailVerified: true }
    ];

    for (const userData of sampleUsers) {
      const user = await User.create({
        ...userData,
        passwordHash,
        metadata: { createdBy: 'seeder' }
      });
      users.push(user);
      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. Create Profiles (multiple profiles per user)
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating profiles...');

    for (const user of users) {
      // Personal profile (primary)
      const personalProfile = await Profile.create({
        userId: user.id,
        name: `${user.firstName} ${user.lastName}`,
        type: 'personal',
        isPrimary: true,
        avatar: `https://i.pravatar.cc/150?u=${user.username}`,
        phone: `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
        location: ['San Francisco, CA', 'New York, NY', 'Austin, TX', 'Seattle, WA'][Math.floor(Math.random() * 4)],
        bio: `Hello, I'm ${user.firstName}! Welcome to my profile.`,
        metadata: { socialLinks: { twitter: `@${user.username}`, linkedin: user.username } }
      });
      profiles.push(personalProfile);
      recordsCreated++;

      // Some users have business profiles
      if (Math.random() > 0.5) {
        const businessProfile = await Profile.create({
          userId: user.id,
          name: `${user.firstName} ${user.lastName} - Business`,
          type: 'business',
          isPrimary: false,
          organization: ['Acme Corp', 'Tech Innovations Inc', 'Digital Solutions LLC', 'Global Enterprises'][Math.floor(Math.random() * 4)],
          department: ['Engineering', 'Marketing', 'Sales', 'Operations'][Math.floor(Math.random() * 4)],
          title: ['Software Engineer', 'Product Manager', 'Director', 'VP of Engineering'][Math.floor(Math.random() * 4)],
          phone: `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
          location: 'Corporate Office',
          metadata: { officeLocation: 'Building A, Floor 3' }
        });
        profiles.push(businessProfile);
        recordsCreated++;
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. Create Groups
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating groups...');

    const groupsData = [
      { name: 'Administrators', slug: 'admins', type: 'security', description: 'System administrators with full access' },
      { name: 'Moderators', slug: 'moderators', type: 'security', description: 'Content moderators' },
      { name: 'Developers', slug: 'developers', type: 'team', description: 'Development team members' },
      { name: 'Premium Users', slug: 'premium', type: 'tier', description: 'Premium subscription members' },
      { name: 'Beta Testers', slug: 'beta', type: 'team', description: 'Beta testing group' },
      { name: 'Engineering', slug: 'engineering', type: 'department', description: 'Engineering department' },
      { name: 'Marketing', slug: 'marketing', type: 'department', description: 'Marketing department' },
      { name: 'Support Team', slug: 'support', type: 'team', description: 'Customer support team' }
    ];

    for (const groupData of groupsData) {
      const group = await Group.create({
        ...groupData,
        status: 'active',
        metadata: { createdBy: 'seeder' }
      });
      groups.push(group);
      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. Create Roles
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating roles...');

    const rolesData = [
      {
        name: 'System Administrator',
        slug: 'system-admin',
        description: 'Full system access',
        permissionFlags: 31, // All permissions (read, write, append, delete, update)
        resourceType: 'url',
        resourcePattern: '*',
        isSystem: true,
        priority: 1000
      },
      {
        name: 'User Manager',
        slug: 'user-manager',
        description: 'Can manage user accounts',
        permissionFlags: 31,
        resourceType: 'url',
        resourcePattern: '/api/users/*',
        isSystem: true,
        priority: 500
      },
      {
        name: 'Content Moderator',
        slug: 'content-moderator',
        description: 'Can moderate content',
        permissionFlags: 23, // read, write, append, update
        resourceType: 'url',
        resourcePattern: '/api/content/*',
        isSystem: true,
        priority: 400
      },
      {
        name: 'Developer',
        slug: 'developer',
        description: 'Developer API access',
        permissionFlags: 31,
        resourceType: 'url',
        resourcePattern: '/api/*',
        isSystem: false,
        priority: 300
      },
      {
        name: 'Premium User',
        slug: 'premium-user',
        description: 'Premium features access',
        permissionFlags: 7, // read, write, append
        resourceType: 'url',
        resourcePattern: '/api/premium/*',
        isSystem: false,
        priority: 200
      },
      {
        name: 'Standard User',
        slug: 'standard-user',
        description: 'Standard user access',
        permissionFlags: 3, // read, write
        resourceType: 'url',
        resourcePattern: '/api/user/*',
        isSystem: false,
        priority: 100
      }
    ];

    for (const roleData of rolesData) {
      const role = await Role.create({
        ...roleData,
        status: 'active',
        metadata: { createdBy: 'seeder' }
      });
      roles.push(role);
      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 5. Assign Users to Groups
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Assigning users to groups...');

    // Admin user gets admin group
    await users[0].addGroup(groups[0]); // Administrators

    // Random group assignments
    for (let i = 1; i < users.length; i++) {
      const numGroups = Math.floor(Math.random() * 3) + 1;
      const selectedGroups = groups
        .filter(g => g.slug !== 'admins')
        .sort(() => 0.5 - Math.random())
        .slice(0, numGroups);

      for (const group of selectedGroups) {
        await users[i].addGroup(group);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 6. Assign Roles to Users
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Assigning roles to users...');

    // Admin gets system admin role
    await users[0].addRole(roles[0]);

    // Other users get random roles
    for (let i = 1; i < users.length; i++) {
      const numRoles = Math.floor(Math.random() * 2) + 1;
      const selectedRoles = roles
        .filter(r => r.slug !== 'system-admin')
        .sort(() => 0.5 - Math.random())
        .slice(0, numRoles);

      for (const role of selectedRoles) {
        await users[i].addRole(role);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 7. Create Certificates (simplified - no real key generation)
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating sample certificates...');

    for (let i = 0; i < Math.min(users.length, 20); i++) {
      const user = users[i];
      const serialNumber = crypto.randomBytes(16).toString('hex');
      const fingerprint = crypto.createHash('sha256').update(serialNumber).digest('hex');

      const cert = await Certificate.create({
        serialNumber,
        type: 'entity',
        userId: user.id,
        commonName: user.email,
        organization: 'Exprsn',
        country: 'US',
        keySize: 2048,
        algorithm: 'RSA-SHA256',
        publicKey: '-----BEGIN PUBLIC KEY-----\n[SAMPLE KEY DATA]\n-----END PUBLIC KEY-----',
        certificatePem: '-----BEGIN CERTIFICATE-----\n[SAMPLE CERT DATA]\n-----END CERTIFICATE-----',
        fingerprint,
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
        status: 'active',
        metadata: { purpose: 'authentication' }
      });
      recordsCreated++;

      // Create tokens for some certificates
      if (Math.random() > 0.5) {
        await Token.create({
          version: '1.0',
          userId: user.id,
          certificateId: cert.id,
          permissions: {
            read: true,
            write: Math.random() > 0.5,
            append: Math.random() > 0.7,
            delete: Math.random() > 0.8,
            update: Math.random() > 0.6
          },
          resourceType: 'url',
          resourceValue: 'https://api.exprsn.io/*',
          expiryType: 'time',
          issuedAt: new Date(),
          notBefore: new Date(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          maxUses: null,
          usesRemaining: null,
          useCount: Math.floor(Math.random() * 50),
          signature: crypto.randomBytes(256).toString('base64'),
          status: 'active',
          metadata: { purpose: 'api-access' }
        });
        recordsCreated++;
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 8. Create Audit Logs
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating audit logs...');

    const actions = ['user.login', 'user.logout', 'user.created', 'user.updated', 'certificate.issued', 'token.created', 'role.assigned'];
    const severities = ['info', 'warning', 'error', 'critical'];

    for (let i = 0; i < 100; i++) {
      await AuditLog.create({
        userId: users[Math.floor(Math.random() * users.length)].id,
        action: actions[Math.floor(Math.random() * actions.length)],
        resourceType: 'user',
        resourceId: users[Math.floor(Math.random() * users.length)].id,
        status: Math.random() > 0.1 ? 'success' : 'failure',
        severity: severities[Math.floor(Math.random() * severities.length)],
        message: 'Sample audit log entry',
        ipAddress: `192.168.1.${Math.floor(Math.random() * 255)}`,
        userAgent: 'Mozilla/5.0 (Sample User Agent)',
        details: { sample: true }
      });
      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 9. Create Tickets
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating authentication tickets...');

    for (let i = 0; i < 30; i++) {
      await Ticket.create({
        ticketCode: crypto.randomBytes(32).toString('hex'),
        userId: users[Math.floor(Math.random() * users.length)].id,
        type: ['authentication', 'authorization', 'password_reset'][Math.floor(Math.random() * 3)],
        purpose: 'Sample ticket',
        maxUses: Math.random() > 0.5 ? 1 : null,
        usesRemaining: Math.random() > 0.5 ? 1 : null,
        useCount: 0,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        status: 'active',
        metadata: { createdBy: 'seeder' }
      });
      recordsCreated++;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      recordsCreated,
      duration,
      summary: {
        users: users.length,
        profiles: profiles.length,
        groups: groups.length,
        roles: roles.length
      }
    };

  } catch (error) {
    console.error('  Error seeding CA:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// Run if called directly
if (require.main === module) {
  seed()
    .then(result => {
      console.log(`\nCA seeded: ${result.recordsCreated} records in ${result.duration}s`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to seed CA:', error);
      process.exit(1);
    });
}

module.exports = { seed };
