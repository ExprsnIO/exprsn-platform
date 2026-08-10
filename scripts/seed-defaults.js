#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Exprsn Default Data Seeding Script
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Creates default data for all Exprsn services:
 * - Default users (admin, moderator, test users)
 * - Roles and permissions
 * - Default groups and organizations
 * - Sample workflows
 * - Notification templates
 * - Default content moderation rules
 *
 * Usage:
 *   node scripts/seed-defaults.js [--environment=<env>] [--service=<name>]
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

const { Client } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ENVIRONMENT = process.argv.find(arg => arg.startsWith('--environment='))?.split('=')[1] || 'development';
const TARGET_SERVICE = process.argv.find(arg => arg.startsWith('--service='))?.split('=')[1] || 'all';

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m'
};

function log(message) {
  console.log(`${colors.green}[SEED]${colors.reset} ${message}`);
}

function section(title) {
  console.log(`\n${colors.cyan}${'═'.repeat(75)}${colors.reset}`);
  console.log(`${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.cyan}${'═'.repeat(75)}${colors.reset}\n`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Database Connection Helper
// ═══════════════════════════════════════════════════════════════════════════

function getDbConfig(service) {
  const suffix = ENVIRONMENT === 'development' ? '_dev' : '';
  const serviceUpper = service.toUpperCase();

  return {
    host: process.env[`${serviceUpper}_DB_HOST`] || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env[`${serviceUpper}_DB_PORT`] || process.env.DB_PORT || 5432),
    database: process.env[`${serviceUpper}_DB_NAME`] || `exprsn_${service}${suffix}`,
    user: process.env[`${serviceUpper}_DB_USER`] || process.env.DB_USER || 'postgres',
    password: process.env[`${serviceUpper}_DB_PASSWORD`] || process.env.DB_PASSWORD || ''
  };
}

async function connectToService(service) {
  const config = getDbConfig(service);
  const client = new Client(config);

  try {
    await client.connect();
    log(`Connected to ${service} database`);
    return client;
  } catch (err) {
    console.warn(`${colors.yellow}[SKIP]${colors.reset} ${service}: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Default Users
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_USERS = [
  {
    email: 'admin@exprsn.local',
    username: 'admin',
    password: 'admin123',
    role: 'admin',
    emailVerified: true
  },
  {
    email: 'moderator@exprsn.local',
    username: 'moderator',
    password: 'moderator123',
    role: 'moderator',
    emailVerified: true
  },
  {
    email: 'user@exprsn.local',
    username: 'testuser',
    password: 'user123',
    role: 'user',
    emailVerified: true
  }
];

async function seedUsers(client, service) {
  log(`Creating default users for ${service}...`);

  for (const user of DEFAULT_USERS) {
    const hashedPassword = await bcrypt.hash(user.password, 10);
    const userId = crypto.randomUUID();

    try {
      await client.query(`
        INSERT INTO users (id, email, username, password, email_verified, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (email) DO NOTHING
      `, [userId, user.email, user.username, hashedPassword, user.emailVerified]);

      log(`  ✓ Created user: ${user.email} (${user.role})`);
    } catch (err) {
      console.warn(`  ○ User ${user.email} may already exist`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Roles and Permissions (Auth Service)
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_ROLES = [
  {
    name: 'admin',
    description: 'Administrator with full system access',
    permissions: ['*:*:*'] // Wildcard permission
  },
  {
    name: 'moderator',
    description: 'Content moderator',
    permissions: [
      'posts:read:*',
      'posts:update:*',
      'posts:delete:*',
      'users:read:*',
      'users:suspend:*',
      'moderation:*:*'
    ]
  },
  {
    name: 'user',
    description: 'Regular user',
    permissions: [
      'posts:read:own',
      'posts:create:own',
      'posts:update:own',
      'posts:delete:own',
      'profile:read:*',
      'profile:update:own'
    ]
  }
];

async function seedRolesAndPermissions(client) {
  log('Creating default roles and permissions...');

  for (const role of DEFAULT_ROLES) {
    const roleId = crypto.randomUUID();

    try {
      // Create role
      await client.query(`
        INSERT INTO roles (id, name, description, created_at, updated_at)
        VALUES ($1, $2, $3, NOW(), NOW())
        ON CONFLICT (name) DO NOTHING
      `, [roleId, role.name, role.description]);

      log(`  ✓ Created role: ${role.name}`);

      // Create permissions
      for (const permissionString of role.permissions) {
        const permId = crypto.randomUUID();
        const [resource, action, scope] = permissionString.split(':');

        try {
          await client.query(`
            INSERT INTO permissions (id, name, resource, action, scope, description, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
            ON CONFLICT (name) DO NOTHING
          `, [permId, permissionString, resource, action, scope, `${action} ${resource} (${scope})`]);

          // Link permission to role
          await client.query(`
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (
              (SELECT id FROM roles WHERE name = $1),
              (SELECT id FROM permissions WHERE name = $2)
            )
            ON CONFLICT DO NOTHING
          `, [role.name, permissionString]);
        } catch (err) {
          // Permission might already exist
        }
      }
    } catch (err) {
      console.warn(`  ○ Role ${role.name} may already exist`);
    }
  }

  // Assign roles to users
  log('Assigning roles to users...');
  for (const user of DEFAULT_USERS) {
    try {
      await client.query(`
        INSERT INTO user_roles (user_id, role_id)
        VALUES (
          (SELECT id FROM users WHERE email = $1),
          (SELECT id FROM roles WHERE name = $2)
        )
        ON CONFLICT DO NOTHING
      `, [user.email, user.role]);
    } catch (err) {
      // User-role assignment might already exist
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Default Organizations (Nexus Service)
// ═══════════════════════════════════════════════════════════════════════════

async function seedOrganizations(client) {
  log('Creating default organizations and groups...');

  const orgs = [
    { name: 'Exprsn Community', slug: 'exprsn-community', description: 'Official Exprsn community group' },
    { name: 'Developers', slug: 'developers', description: 'For developers building on Exprsn' },
    { name: 'General Discussion', slug: 'general', description: 'General discussion and announcements' }
  ];

  for (const org of orgs) {
    const orgId = crypto.randomUUID();

    try {
      await client.query(`
        INSERT INTO organizations (id, name, slug, description, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (slug) DO NOTHING
      `, [orgId, org.name, org.slug, org.description]);

      log(`  ✓ Created organization: ${org.name}`);

      // Add admin as owner
      await client.query(`
        INSERT INTO organization_members (organization_id, user_id, role, joined_at)
        VALUES (
          (SELECT id FROM organizations WHERE slug = $1),
          (SELECT id FROM users WHERE email = 'admin@exprsn.local'),
          'owner',
          NOW()
        )
        ON CONFLICT DO NOTHING
      `, [org.slug]);
    } catch (err) {
      console.warn(`  ○ Organization ${org.name} may already exist`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Default Workflows (Workflow Service)
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_WORKFLOWS = [
  {
    name: 'New User Welcome',
    description: 'Send welcome email and notifications to new users',
    trigger: 'user.created',
    steps: [
      {
        type: 'notification',
        name: 'Send Welcome Email',
        config: {
          channel: 'email',
          template: 'welcome_email',
          to: '{{user.email}}'
        }
      },
      {
        type: 'notification',
        name: 'Send In-App Notification',
        config: {
          channel: 'in-app',
          title: 'Welcome to Exprsn!',
          body: 'Get started by completing your profile'
        }
      }
    ]
  },
  {
    name: 'Content Moderation',
    description: 'Automatically moderate reported content',
    trigger: 'content.reported',
    steps: [
      {
        type: 'condition',
        name: 'Check Report Count',
        config: {
          condition: '{{report_count}} >= 5'
        },
        onTrue: 'flag_content',
        onFalse: 'notify_moderator'
      },
      {
        type: 'service',
        name: 'Flag Content',
        id: 'flag_content',
        config: {
          service: 'moderator',
          endpoint: '/api/content/flag',
          method: 'POST'
        }
      },
      {
        type: 'notification',
        name: 'Notify Moderator',
        id: 'notify_moderator',
        config: {
          channel: 'email',
          to: 'moderator@exprsn.local',
          subject: 'Content Reported'
        }
      }
    ]
  }
];

async function seedWorkflows(client) {
  log('Creating default workflows...');

  for (const workflow of DEFAULT_WORKFLOWS) {
    const workflowId = crypto.randomUUID();
    const versionId = crypto.randomUUID();

    try {
      // Create workflow
      await client.query(`
        INSERT INTO workflows (id, name, description, trigger_type, trigger_config, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, (SELECT id FROM users WHERE email = 'admin@exprsn.local'), NOW(), NOW())
        ON CONFLICT (name) DO NOTHING
      `, [workflowId, workflow.name, workflow.description, 'event', { event: workflow.trigger }]);

      // Create version
      await client.query(`
        INSERT INTO workflow_versions (id, workflow_id, version, steps, created_at)
        VALUES ($1, $2, 1, $3, NOW())
        ON CONFLICT DO NOTHING
      `, [versionId, workflowId, JSON.stringify(workflow.steps)]);

      log(`  ✓ Created workflow: ${workflow.name}`);
    } catch (err) {
      console.warn(`  ○ Workflow ${workflow.name} may already exist or table doesn't exist`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Notification Templates (Herald Service)
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_NOTIFICATION_TEMPLATES = [
  {
    name: 'welcome_email',
    type: 'email',
    subject: 'Welcome to Exprsn!',
    body: 'Hello {{username}},\n\nWelcome to Exprsn! We\'re excited to have you join our community.\n\nBest regards,\nThe Exprsn Team'
  },
  {
    name: 'password_reset',
    type: 'email',
    subject: 'Password Reset Request',
    body: 'Hello {{username}},\n\nYou requested to reset your password. Click the link below:\n\n{{reset_link}}\n\nIf you didn\'t request this, please ignore this email.'
  },
  {
    name: 'new_message',
    type: 'push',
    subject: 'New Message',
    body: '{{sender}} sent you a message'
  },
  {
    name: 'post_liked',
    type: 'in-app',
    subject: 'Someone liked your post',
    body: '{{user}} liked your post: "{{post_title}}"'
  }
];

async function seedNotificationTemplates(client) {
  log('Creating default notification templates...');

  for (const template of DEFAULT_NOTIFICATION_TEMPLATES) {
    const templateId = crypto.randomUUID();

    try {
      await client.query(`
        INSERT INTO notification_templates (id, name, channel, subject, body, variables, active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())
        ON CONFLICT (name) DO NOTHING
      `, [
        templateId,
        template.name,
        template.type,
        template.subject,
        template.body,
        JSON.stringify(extractVariables(template.body + ' ' + template.subject))
      ]);

      log(`  ✓ Created template: ${template.name}`);
    } catch (err) {
      console.warn(`  ○ Template ${template.name} may already exist or table doesn't exist`);
    }
  }
}

function extractVariables(text) {
  const matches = text.match(/\{\{([^}]+)\}\}/g) || [];
  return matches.map(m => m.replace(/\{\{|\}\}/g, '').trim());
}

// ═══════════════════════════════════════════════════════════════════════════
// Moderation Rules (Moderator Service)
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_MODERATION_RULES = [
  {
    name: 'Spam Detection',
    description: 'Detect and flag spam content',
    type: 'automated',
    conditions: {
      contains_spam_keywords: true,
      link_count_threshold: 5
    },
    actions: ['flag', 'notify_moderator']
  },
  {
    name: 'Hate Speech',
    description: 'Flag potential hate speech',
    type: 'automated',
    conditions: {
      ai_analysis_threshold: 0.8,
      category: 'hate_speech'
    },
    actions: ['flag', 'hide', 'notify_moderator']
  }
];

async function seedModerationRules(client) {
  log('Creating default moderation rules...');

  for (const rule of DEFAULT_MODERATION_RULES) {
    const ruleId = crypto.randomUUID();

    try {
      await client.query(`
        INSERT INTO moderation_rules (id, name, description, rule_type, conditions, actions, severity, active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 'medium', true, NOW(), NOW())
        ON CONFLICT (name) DO NOTHING
      `, [
        ruleId,
        rule.name,
        rule.description,
        rule.type,
        JSON.stringify(rule.conditions),
        JSON.stringify(rule.actions)
      ]);

      log(`  ✓ Created rule: ${rule.name}`);
    } catch (err) {
      console.warn(`  ○ Rule ${rule.name} may already exist or table doesn't exist`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Main Seeding Function
// ═══════════════════════════════════════════════════════════════════════════

async function seedService(service) {
  const client = await connectToService(service);
  if (!client) return;

  try {
    // Seed users for all services that have a users table
    if (['ca', 'auth', 'timeline', 'spark', 'nexus'].includes(service)) {
      await seedUsers(client, service);
    }

    // Service-specific seeding
    switch (service) {
      case 'auth':
        await seedRolesAndPermissions(client);
        break;

      case 'nexus':
        await seedOrganizations(client);
        break;

      case 'workflow':
        await seedWorkflows(client);
        break;

      case 'herald':
        await seedNotificationTemplates(client);
        break;

      case 'moderator':
        await seedModerationRules(client);
        break;
    }

    log(`✓ Seeding complete for ${service}\n`);
  } catch (err) {
    console.error(`Error seeding ${service}:`, err.message);
  } finally {
    await client.end();
  }
}

async function main() {
  console.log(`\n${colors.cyan}${'═'.repeat(75)}${colors.reset}`);
  console.log(`${colors.cyan}  Exprsn Default Data Seeding${colors.reset}`);
  console.log(`${colors.cyan}${'═'.repeat(75)}${colors.reset}\n`);

  log(`Environment: ${ENVIRONMENT}`);
  log(`Target service: ${TARGET_SERVICE}\n`);

  const servicesToSeed = TARGET_SERVICE === 'all'
    ? ['ca', 'auth', 'spark', 'timeline', 'nexus', 'moderator', 'herald', 'workflow']
    : [TARGET_SERVICE];

  for (const service of servicesToSeed) {
    section(`Seeding ${service.toUpperCase()}`);
    await seedService(service);
  }

  console.log(`${colors.green}╔${'═'.repeat(75)}╗${colors.reset}`);
  console.log(`${colors.green}║${' '.repeat(26)}Seeding Complete!${' '.repeat(31)}║${colors.reset}`);
  console.log(`${colors.green}╚${'═'.repeat(75)}╝${colors.reset}\n`);

  log('Default credentials:');
  log('  Admin:     admin@exprsn.local / admin123');
  log('  Moderator: moderator@exprsn.local / moderator123');
  log('  User:      user@exprsn.local / user123\n');
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
}

module.exports = { main, seedService };
