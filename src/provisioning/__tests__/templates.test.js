/**
 * §6h — templates unit (resolveTemplate / buildOrgPayload / normalizeSlug).
 * Pure functions; no DB, no CA.
 */

'use strict';

const {
  resolveTemplate,
  buildOrgPayload,
  normalizeSlug,
  TEMPLATES
} = require('../templates');

describe('templates', () => {
  describe('resolveTemplate', () => {
    test.each(['enterprise', 'team', 'personal'])('resolves the %s template', (type) => {
      const tpl = resolveTemplate(type);
      expect(tpl).toBe(TEMPLATES[type]);
      expect(tpl.orgType).toBe(type);
    });

    test('throws UNKNOWN_ORG_TYPE for an unknown type', () => {
      expect.assertions(2);
      try {
        resolveTemplate('bogus');
      } catch (err) {
        expect(err.errorCode).toBe('UNKNOWN_ORG_TYPE');
        expect(err.statusCode).toBe(400);
      }
    });

    test('throws UNKNOWN_ORG_TYPE for a missing type', () => {
      expect(() => resolveTemplate(undefined)).toThrow(/Unknown organization type/);
    });
  });

  describe('normalizeSlug', () => {
    test('collapses non-alphanumeric runs and trims dashes', () => {
      expect(normalizeSlug('Acme  Co!!')).toBe('acme-co');
      expect(normalizeSlug('  --Hello__World--  ')).toBe('hello-world');
      expect(normalizeSlug('Already-Good')).toBe('already-good');
    });

    test('throws VALIDATION_ERROR when empty after normalization', () => {
      expect.assertions(2);
      try {
        normalizeSlug('!!!');
      } catch (err) {
        expect(err.errorCode).toBe('VALIDATION_ERROR');
        expect(err.statusCode).toBe(400);
      }
    });
  });

  describe('buildOrgPayload (mass-assignment guard)', () => {
    test('drops non-allowlisted client keys and takes type/plan/settings from the template', () => {
      const tpl = resolveTemplate('personal');
      const payload = buildOrgPayload(tpl, {
        name: 'My Personal Org',
        description: 'desc',
        email: 'me@example.com',
        website: 'https://example.com',
        // hostile / non-allowlisted keys:
        plan: 'enterprise',
        type: 'enterprise',
        settings: { requireMfa: false },
        status: 'suspended',
        caGroupId: 'attacker-controlled',
        metadata: { evil: true }
      });

      // allowlisted client fields survive
      expect(payload.name).toBe('My Personal Org');
      expect(payload.description).toBe('desc');
      expect(payload.email).toBe('me@example.com');
      expect(payload.website).toBe('https://example.com');

      // template wins — client cannot escalate
      expect(payload.type).toBe('personal');
      expect(payload.plan).toBe('free');
      expect(payload.status).toBe('active');
      expect(payload.caGroupId).toBeNull();

      // settings come from the template deep-merged over defaults, NOT the client
      expect(payload.settings.requireMfa).toBe(false); // personal template value
      expect(payload.settings.requireEmailVerification).toBe(true);
      // non-allowlisted keys never appear
      expect(payload).not.toHaveProperty('metadata');
    });

    test('enterprise template forces plan=enterprise + requireMfa=true regardless of client', () => {
      const tpl = resolveTemplate('enterprise');
      const payload = buildOrgPayload(tpl, { name: 'BigCo', plan: 'free', settings: { requireMfa: false } });
      expect(payload.plan).toBe('enterprise');
      expect(payload.settings.requireMfa).toBe(true);
    });

    test('derives + normalizes a slug from the name when none is given', () => {
      const payload = buildOrgPayload(resolveTemplate('team'), { name: 'Acme  Co!!' });
      expect(payload.slug).toBe('acme-co');
    });

    test('normalizes an explicitly provided slug', () => {
      const payload = buildOrgPayload(resolveTemplate('team'), { name: 'Acme', slug: 'Acme  Team!!' });
      expect(payload.slug).toBe('acme-team');
    });

    test('throws VALIDATION_ERROR when name is missing', () => {
      expect.assertions(1);
      try {
        buildOrgPayload(resolveTemplate('team'), { description: 'no name' });
      } catch (err) {
        expect(err.errorCode).toBe('VALIDATION_ERROR');
      }
    });
  });
});
