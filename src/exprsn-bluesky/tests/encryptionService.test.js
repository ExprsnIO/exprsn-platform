const encryptionService = require('../services/encryptionService');

describe('EncryptionService', () => {
  describe('Basic Encryption/Decryption', () => {
    it('should encrypt and decrypt data correctly', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encryptionService.encrypt(plaintext);

      expect(encrypted).toBeTruthy();
      expect(encrypted).not.toBe(plaintext);

      const decrypted = encryptionService.decrypt(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle long strings', () => {
      const plaintext = 'A'.repeat(10000);
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should handle special characters', () => {
      const plaintext = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`\n\t\r';
      const encrypted = encryptionService.encrypt(plaintext);
      const decrypted = encryptionService.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext', () => {
      const plaintext = 'Hello, World!';
      const encrypted1 = encryptionService.encrypt(plaintext);
      const encrypted2 = encryptionService.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);

      expect(encryptionService.decrypt(encrypted1)).toBe(plaintext);
      expect(encryptionService.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should throw error on tampered ciphertext', () => {
      const plaintext = 'Hello, World!';
      const encrypted = encryptionService.encrypt(plaintext);

      // Tamper with ciphertext
      const tampered = encrypted.slice(0, -5) + 'xxxxx';

      expect(() => {
        encryptionService.decrypt(tampered);
      }).toThrow('Decryption failed');
    });
  });

  describe('Private Key Encryption', () => {
    it('should encrypt and decrypt private keys', () => {
      const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7VJTUt9Us8cKj
-----END PRIVATE KEY-----`;

      const encrypted = encryptionService.encryptPrivateKey(privateKey);
      expect(encrypted).not.toBe(privateKey);

      const decrypted = encryptionService.decryptPrivateKey(encrypted);
      expect(decrypted).toBe(privateKey);
    });
  });

  describe('Hashing', () => {
    it('should hash data consistently', () => {
      const data = 'password123';
      const hash1 = encryptionService.hash(data);
      const hash2 = encryptionService.hash(data);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 hex chars
    });

    it('should produce different hashes for different data', () => {
      const hash1 = encryptionService.hash('password123');
      const hash2 = encryptionService.hash('password124');

      expect(hash1).not.toBe(hash2);
    });

    it('should compare hashes correctly', () => {
      const data = 'password123';
      const hash = encryptionService.hash(data);

      expect(encryptionService.compareHash(data, hash)).toBe(true);
      expect(encryptionService.compareHash('wrongpassword', hash)).toBe(false);
    });
  });

  describe('Password-Based Encryption', () => {
    it('should encrypt and decrypt with password', () => {
      const plaintext = 'Secret data';
      const password = 'MySecurePassword123!';

      const encrypted = encryptionService.encryptWithPassword(plaintext, password);
      expect(encrypted).not.toBe(plaintext);

      const decrypted = encryptionService.decryptWithPassword(encrypted, password);
      expect(decrypted).toBe(plaintext);
    });

    it('should fail with wrong password', () => {
      const plaintext = 'Secret data';
      const password = 'MySecurePassword123!';

      const encrypted = encryptionService.encryptWithPassword(plaintext, password);

      expect(() => {
        encryptionService.decryptWithPassword(encrypted, 'WrongPassword');
      }).toThrow('Password decryption failed');
    });

    it('should produce different ciphertext with same password', () => {
      const plaintext = 'Secret data';
      const password = 'MySecurePassword123!';

      const encrypted1 = encryptionService.encryptWithPassword(plaintext, password);
      const encrypted2 = encryptionService.encryptWithPassword(plaintext, password);

      expect(encrypted1).not.toBe(encrypted2);

      expect(encryptionService.decryptWithPassword(encrypted1, password)).toBe(plaintext);
      expect(encryptionService.decryptWithPassword(encrypted2, password)).toBe(plaintext);
    });
  });

  describe('Token Generation', () => {
    it('should generate random tokens', () => {
      const token1 = encryptionService.generateToken();
      const token2 = encryptionService.generateToken();

      expect(token1).toHaveLength(64); // 32 bytes = 64 hex chars
      expect(token2).toHaveLength(64);
      expect(token1).not.toBe(token2);
    });

    it('should generate tokens of specified length', () => {
      const token = encryptionService.generateToken(16);
      expect(token).toHaveLength(32); // 16 bytes = 32 hex chars
    });
  });
});
