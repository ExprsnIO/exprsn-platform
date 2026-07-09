/**
 * Password Service Tests
 * Tests for password validation, strength calculation, difference checking,
 * and generation — aligned with the current passwordService API:
 *   validatePassword, calculatePasswordStrength, isDifferentEnough,
 *   generatePassword, validatePasswordOrThrow (min length 12).
 */

const passwordService = require('../src/services/passwordService');

// Policy-compliant password: >=12 chars, upper/lower/digit/special, no
// sequential runs (abc/123), no triple repeats, no common weak substrings.
const STRONG_PW = 'Xk9!mQ2@vB7$Lp4z';

describe('Password Service', () => {
  describe('validatePassword', () => {
    test('should accept a strong password meeting all requirements', () => {
      const result = passwordService.validatePassword(STRONG_PW);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject password shorter than minimum length (12)', () => {
      const result = passwordService.validatePassword('Vk9!m');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('at least 12 characters'));
    });

    test('should reject password without uppercase letter', () => {
      const result = passwordService.validatePassword('vk9!mq2@wb7$lp4z');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('uppercase letter'));
    });

    test('should reject password without lowercase letter', () => {
      const result = passwordService.validatePassword('VK9!MQ2@WB7$LP4Z');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('lowercase letter'));
    });

    test('should reject password without number', () => {
      const result = passwordService.validatePassword('Vkm!nQw@xBz$Ldwy');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('number'));
    });

    test('should reject password without special character', () => {
      const result = passwordService.validatePassword('Vk9mQ2wB7Lp4zXe6');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('special character'));
    });

    test('should reject common weak passwords', () => {
      const weakPasswords = ['MyPassword9!x$Qz', 'Welcome9!x$QzTb', 'XqAdmin9!x$QzTb'];
      weakPasswords.forEach(password => {
        const result = passwordService.validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(expect.stringContaining('common'));
      });
    });

    test('should reject password with repeating characters', () => {
      const result = passwordService.validatePassword('Vk9!mQ2@aaaB7$Lp');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('repeating characters'));
    });

    test('should reject password with sequential patterns', () => {
      const sequentialPasswords = ['Vk9!mQ2@abcB7$Lp', 'Vk9!mQ@B7$Lpz123'];
      sequentialPasswords.forEach(password => {
        const result = passwordService.validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors).toContainEqual(expect.stringContaining('sequential'));
      });
    });

    test('should reject null, undefined, or empty password without throwing', () => {
      expect(passwordService.validatePassword(null).valid).toBe(false);
      expect(passwordService.validatePassword(undefined).valid).toBe(false);
      expect(passwordService.validatePassword('').valid).toBe(false);
    });
  });

  describe('calculatePasswordStrength', () => {
    test('should rate a tiny password as Very Weak', () => {
      const result = passwordService.calculatePasswordStrength('pass');
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.strength).toBe('Very Weak');
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    test('should heavily penalize common weak patterns', () => {
      const result = passwordService.calculatePasswordStrength('password1');
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.strength).toMatch(/Weak/i);
      expect(result.feedback).toContainEqual(expect.stringContaining('common weak patterns'));
    });

    test('should rate a fully mixed password highly', () => {
      const result = passwordService.calculatePasswordStrength('MyQ@zw0rk2094');
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    test('should rate a long complex password as Strong or Very Strong', () => {
      const result = passwordService.calculatePasswordStrength('C0mql3x!Q@zzw0rk#2094$Zecuve');
      expect(result.score).toBeGreaterThanOrEqual(4);
      expect(['Good', 'Very Strong']).toContain(result.strength);
    });

    test('should provide feedback for weak passwords', () => {
      const result = passwordService.calculatePasswordStrength('weak');
      expect(result.feedback).toBeInstanceOf(Array);
      expect(result.feedback.length).toBeGreaterThan(0);
    });

    test('should reward character diversity', () => {
      const weak = passwordService.calculatePasswordStrength('aaaaaaaaaa');
      const diverse = passwordService.calculatePasswordStrength('aXcW1794!@#$');
      expect(diverse.score).toBeGreaterThan(weak.score);
    });

    test('should handle empty password', () => {
      const result = passwordService.calculatePasswordStrength('');
      expect(result.score).toBe(0);
      expect(result.strength).toBe('Very Weak');
      expect(result.feedback).toContain('Password is required');
    });

    test('should include a percentage in the result', () => {
      const result = passwordService.calculatePasswordStrength(STRONG_PW);
      expect(result.percentage).toBeGreaterThanOrEqual(0);
      expect(result.percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('isDifferentEnough', () => {
    test('should accept a password with sufficient changes', () => {
      expect(passwordService.isDifferentEnough('NewQassw0rt456!', 'OldQassw0rt123!')).toBe(true);
    });

    test('should accept when there is no old password', () => {
      expect(passwordService.isDifferentEnough('Anything9!x$Qz', null)).toBe(true);
    });

    test('should reject identical passwords', () => {
      expect(passwordService.isDifferentEnough('Same123!@#', 'Same123!@#')).toBe(false);
    });

    test('should reject passwords with minimal changes (< 3 edits)', () => {
      expect(passwordService.isDifferentEnough('Qassword124!', 'Qassword123!')).toBe(false);
      expect(passwordService.isDifferentEnough('MyQassword!2', 'MyQassword!1')).toBe(false);
      expect(passwordService.isDifferentEnough('Zecure2025!', 'Zecure2024!')).toBe(false);
    });

    test('should accept exactly 3 character edits (Levenshtein >= 3)', () => {
      // 'abc' -> 'def' is distance 3; 'kitten' -> 'sitting' is distance 3
      expect(passwordService.isDifferentEnough('abc', 'def')).toBe(true);
      expect(passwordService.isDifferentEnough('kitten', 'sitting')).toBe(true);
    });
  });

  describe('generatePassword', () => {
    test('should generate password of specified length', () => {
      expect(passwordService.generatePassword(16)).toHaveLength(16);
      expect(passwordService.generatePassword(24)).toHaveLength(24);
    });

    test('should generate password with default length of 16', () => {
      expect(passwordService.generatePassword()).toHaveLength(16);
    });

    test('should include all four character classes', () => {
      for (let i = 0; i < 10; i++) {
        const password = passwordService.generatePassword(20);
        expect(/[A-Z]/.test(password)).toBe(true);
        expect(/[a-z]/.test(password)).toBe(true);
        expect(/\d/.test(password)).toBe(true);
        expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(true);
      }
    });

    test('should only use characters from the documented charset', () => {
      const password = passwordService.generatePassword(64);
      expect(/^[A-Za-z0-9!@#$%^&*()_+\-=\[\]{}|;:,.<>?]+$/.test(password)).toBe(true);
    });

    test('should generate different passwords each time', () => {
      const password1 = passwordService.generatePassword(20);
      const password2 = passwordService.generatePassword(20);
      const password3 = passwordService.generatePassword(20);

      expect(password1).not.toBe(password2);
      expect(password2).not.toBe(password3);
      expect(password1).not.toBe(password3);
    });

    test('should have a high strength score', () => {
      for (let i = 0; i < 10; i++) {
        const password = passwordService.generatePassword(20);
        const strength = passwordService.calculatePasswordStrength(password);
        expect(strength.score).toBeGreaterThanOrEqual(3);
      }
    });
  });

  describe('validatePasswordOrThrow', () => {
    test('should not throw for a strong password', () => {
      expect(() => passwordService.validatePasswordOrThrow(STRONG_PW)).not.toThrow();
    });

    test('should throw WEAK_PASSWORD for a weak password', () => {
      try {
        passwordService.validatePasswordOrThrow('weak');
        throw new Error('expected validatePasswordOrThrow to throw');
      } catch (err) {
        expect(err.statusCode).toBe(400);
        expect(err.errorCode).toBe('WEAK_PASSWORD');
        expect(err.message).toContain('Password does not meet requirements');
      }
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long passwords without repeats or sequences', () => {
      const longPassword = 'Xk9!mQ2@'.repeat(12) + 'vB7$'; // 100 chars
      const validation = passwordService.validatePassword(longPassword);
      expect(validation.valid).toBe(true);

      const strength = passwordService.calculatePasswordStrength(longPassword);
      expect(strength.score).toBeGreaterThanOrEqual(3);
    });

    test('should handle passwords with unicode characters', () => {
      const unicodePassword = 'Vk9!mQ2@日本語x$Lp';
      const validation = passwordService.validatePassword(unicodePassword);
      expect(validation.valid).toBe(true);
    });

    test('should report all missing character classes', () => {
      const result = passwordService.validatePassword('!@$%?&*()_+?');
      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining('uppercase'));
      expect(result.errors).toContainEqual(expect.stringContaining('lowercase'));
      expect(result.errors).toContainEqual(expect.stringContaining('number'));
    });
  });
});
