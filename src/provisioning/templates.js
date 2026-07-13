/**
 * ═══════════════════════════════════════════════════════════════════════
 * Org provisioning templates (FEAT-032 / ADR-0003 Decision 3 §7)
 * ═══════════════════════════════════════════════════════════════════════
 * A hardcoded per-type template map keyed on the existing Organization.type
 * enum (enterprise | team | personal). The TYPE — never the caller — chooses
 * plan / settings / RBAC groups / cert depth / token scope / limits, and (slice
 * 2) whether a Nexus social group is created. Admin editability is out of scope
 * (follow-up).
 *
 * buildOrgPayload is the mass-assignment guard (ADR-0003 Decision 6): the org
 * payload is assembled from the template plus an explicit field allowlist, so a
 * raw client body can never set plan / settings / type / metadata.
 */

const { AppError } = require('@exprsn/shared');

// Mirror of Organization.settings defaults so template settings deep-merge over
// a known base rather than replacing the whole JSON column blindly.
const ORG_SETTINGS_DEFAULTS = {
  allowUserRegistration: false,
  requireEmailVerification: true,
  requireMfa: false,
  mfa: {
    allowedMethods: ['totp', 'backup_codes'],
    enrollmentGracePeriodDays: 7,
    rememberDeviceDays: 0
  },
  sessionTimeout: 3600000,
  passwordPolicy: {
    minLength: 8,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSymbols: false
  }
};

const TEMPLATES = {
  enterprise: {
    orgType: 'enterprise',
    plan: 'enterprise',
    settings: {
      requireMfa: true,
      requireEmailVerification: true,
      allowUserRegistration: false
    },
    rbacGroups: [
      { slug: 'administrators', name: 'Administrators', ownerRole: 'admin' },
      { slug: 'members', name: 'Members', ownerRole: 'owner' }
    ],
    cert: { intermediateValidityYears: 5, entityType: 'client', entityValidityDays: 365 },
    token: {
      permissions: { read: true, write: true, append: true, update: true, delete: false },
      resourceType: 'url',
      resourceValue: '/',
      expiryType: 'time',
      expirySeconds: 2592000
    },
    limits: { maxMembers: null },
    // Slice 2: enterprise/team provision a Nexus social group + spark channels.
    nexus: { create: true, visibility: 'private', joinMode: 'request' }
  },

  team: {
    orgType: 'team',
    plan: 'starter',
    settings: {
      requireMfa: false,
      requireEmailVerification: true,
      allowUserRegistration: false
    },
    rbacGroups: [
      { slug: 'members', name: 'Members', ownerRole: 'owner' }
    ],
    cert: { intermediateValidityYears: 3, entityType: 'client', entityValidityDays: 365 },
    token: {
      permissions: { read: true, write: true, append: true, update: true, delete: false },
      resourceType: 'url',
      resourceValue: '/',
      expiryType: 'time',
      expirySeconds: 2592000
    },
    limits: { maxMembers: 50 },
    nexus: { create: true, visibility: 'public', joinMode: 'request' }
  },

  personal: {
    orgType: 'personal',
    plan: 'free',
    settings: {
      requireMfa: false,
      requireEmailVerification: true,
      allowUserRegistration: false
    },
    rbacGroups: [],
    cert: { intermediateValidityYears: 2, entityType: 'client', entityValidityDays: 365 },
    token: {
      permissions: { read: true, write: true, append: true, update: false, delete: false },
      resourceType: 'url',
      resourceValue: '/',
      expiryType: 'time',
      expirySeconds: 604800
    },
    limits: { maxMembers: 1 },
    // Personal orgs get no Nexus social group.
    nexus: { create: false, visibility: 'private', joinMode: 'invite' }
  }
};

// Fields a client may supply on the org body — everything else comes from the
// template. Keep this list in lockstep with the ADR-0003 Decision 6 allowlist.
const ORG_FIELD_ALLOWLIST = ['name', 'slug', 'description', 'email', 'website'];

/**
 * Collapse an arbitrary name into a valid slug: lowercase, non-alphanumeric runs
 * → a single '-', trimmed of leading/trailing dashes.
 * @param {string} input
 * @returns {string}
 * @throws {AppError} VALIDATION_ERROR if empty after normalization
 */
function normalizeSlug(input) {
  const slug = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slug) {
    throw new AppError('A valid slug or name is required', 400, 'VALIDATION_ERROR');
  }
  return slug;
}

/**
 * Resolve a template by org type.
 * @param {string} type - enterprise | team | personal
 * @returns {Object} the template
 * @throws {AppError} UNKNOWN_ORG_TYPE
 */
function resolveTemplate(type) {
  const template = TEMPLATES[type];
  if (!template) {
    throw new AppError(`Unknown organization type: ${type}`, 400, 'UNKNOWN_ORG_TYPE');
  }
  return template;
}

/** Shallow-recursive merge (plain objects only); arrays/scalars from `override` win. */
function deepMerge(base, override) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])
    ) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Build the sanitized Organization.create payload from a template + an explicit
 * client-field allowlist (mass-assignment guard). type / plan / settings /
 * status / caGroupId come from the template, NEVER the client body.
 * @param {Object} template - a resolved template
 * @param {Object} organization - the (untrusted) client org fields
 * @returns {Object} sanitized attributes for Organization.create
 * @throws {AppError} VALIDATION_ERROR when name is missing
 */
function buildOrgPayload(template, organization = {}) {
  const payload = {};
  for (const field of ORG_FIELD_ALLOWLIST) {
    if (organization[field] !== undefined) {
      payload[field] = organization[field];
    }
  }

  if (!payload.name || !String(payload.name).trim()) {
    throw new AppError('Organization name is required', 400, 'VALIDATION_ERROR');
  }

  payload.slug = normalizeSlug(payload.slug || payload.name);
  payload.type = template.orgType;
  payload.plan = template.plan;
  payload.settings = deepMerge(ORG_SETTINGS_DEFAULTS, template.settings);
  payload.status = 'active';
  payload.caGroupId = null;

  return payload;
}

module.exports = {
  TEMPLATES,
  ORG_SETTINGS_DEFAULTS,
  resolveTemplate,
  buildOrgPayload,
  normalizeSlug
};
