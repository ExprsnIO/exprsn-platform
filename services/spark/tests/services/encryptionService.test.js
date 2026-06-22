/**
 * Encryption Service Unit Tests
 */

const encryptionService = require('../../src/services/encryptionService');
const {
  connectTestDatabase,
  syncDatabase,
  cleanDatabase,
  disconnectTestDatabase,
  createTestUser,
  createTestEncryptionKey,
  EncryptionKey
} = require('../helpers/testDatabase');

describe('EncryptionService', () => {
  beforeAll(async () => {
    await connectTestDatabase();
    await syncDatabase({ force: true });
  });

  afterAll(async () => {
    await disconnectTestDatabase();
  });

  beforeEach(async () => {
    await cleanDatabase();
  });

  describe('generateKeyPair', () => {
    it('should generate RSA key pair successfully', async () => {
      const user = createTestUser();
      const deviceId = 'device-123';
      const passwordHash = 'password-hash-123';

      const result = await encryptionService.generateKeyPair(
        user.id,
        deviceId,
        passwordHash
      );

      expect(result).toHaveProperty('keyId');
      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('keyFingerprint');
      expect(result).toHaveProperty('expiresAt');
      expect(result.keyFingerprint).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should store key in database', async () => {
      const user = createTestUser();
      const deviceId = 'device-456';
      const passwordHash = 'password-hash-456';

      const result = await encryptionService.generateKeyPair(
        user.id,
        deviceId,
        passwordHash
      );

      const storedKey = await EncryptionKey.findByPk(result.keyId);
      expect(storedKey).toBeTruthy();
      expect(storedKey.userId).toBe(user.id);
      expect(storedKey.deviceId).toBe(deviceId);
      expect(storedKey.active).toBe(true);
    });

    it('should deactivate previous keys for same device', async () => {
      const user = createTestUser();
      const deviceId = 'device-789';
      const passwordHash = 'password-hash-789';

      // Generate first key
      const firstKey = await encryptionService.generateKeyPair(
        user.id,
        deviceId,
        passwordHash
      );

      // Generate second key (should deactivate first)
      const secondKey = await encryptionService.generateKeyPair(
        user.id,
        deviceId,
        passwordHash
      );

      const firstKeyRecord = await EncryptionKey.findByPk(firstKey.keyId);
      const secondKeyRecord = await EncryptionKey.findByPk(secondKey.keyId);

      expect(firstKeyRecord.active).toBe(false);
      expect(secondKeyRecord.active).toBe(true);
    });
  });

  describe('getPublicKey', () => {
    it('should retrieve active public key for user', async () => {
      const user = createTestUser();
      const deviceId = 'device-get-test';
      const passwordHash = 'password-hash-get';

      await encryptionService.generateKeyPair(user.id, deviceId, passwordHash);

      const result = await encryptionService.getPublicKey(user.id);

      expect(result).toBeTruthy();
      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('keyFingerprint');
      expect(result).toHaveProperty('keyType');
      expect(result.keyType).toBe('rsa-4096');
    });

    it('should return null for user without keys', async () => {
      const user = createTestUser();

      const result = await encryptionService.getPublicKey(user.id);

      expect(result).toBeNull();
    });

    it('should return only active key', async () => {
      const user = createTestUser();
      const deviceId = 'device-active-test';

      // Create inactive key
      await createTestEncryptionKey(user.id, deviceId, { active: false });

      const result = await encryptionService.getPublicKey(user.id);

      expect(result).toBeNull();
    });
  });

  describe('getBatchPublicKeys', () => {
    it('should retrieve public keys for multiple users', async () => {
      const user1 = createTestUser();
      const user2 = createTestUser();
      const user3 = createTestUser();

      await encryptionService.generateKeyPair(user1.id, 'device-1', 'pass1');
      await encryptionService.generateKeyPair(user2.id, 'device-2', 'pass2');
      await encryptionService.generateKeyPair(user3.id, 'device-3', 'pass3');

      const result = await encryptionService.getBatchPublicKeys([
        user1.id,
        user2.id,
        user3.id
      ]);

      expect(Object.keys(result)).toHaveLength(3);
      expect(result[user1.id]).toBeTruthy();
      expect(result[user2.id]).toBeTruthy();
      expect(result[user3.id]).toBeTruthy();
    });

    it('should handle users without keys', async () => {
      const user1 = createTestUser();
      const user2 = createTestUser();

      await encryptionService.generateKeyPair(user1.id, 'device-1', 'pass1');

      const result = await encryptionService.getBatchPublicKeys([
        user1.id,
        user2.id
      ]);

      expect(Object.keys(result)).toHaveLength(1);
      expect(result[user1.id]).toBeTruthy();
      expect(result[user2.id]).toBeUndefined();
    });
  });

  describe('rotateKey', () => {
    it('should rotate encryption key successfully', async () => {
      const user = createTestUser();
      const deviceId = 'device-rotate-test';
      const oldPassword = 'old-password';
      const newPassword = 'new-password';

      const firstKey = await encryptionService.generateKeyPair(
        user.id,
        deviceId,
        oldPassword
      );

      const rotatedKey = await encryptionService.rotateKey(
        user.id,
        deviceId,
        oldPassword,
        newPassword
      );

      expect(rotatedKey.keyId).not.toBe(firstKey.keyId);
      expect(rotatedKey.keyFingerprint).not.toBe(firstKey.keyFingerprint);

      const oldKeyRecord = await EncryptionKey.findByPk(firstKey.keyId);
      const newKeyRecord = await EncryptionKey.findByPk(rotatedKey.keyId);

      expect(oldKeyRecord.active).toBe(false);
      expect(newKeyRecord.active).toBe(true);
    });

    it('should fail with incorrect old password', async () => {
      const user = createTestUser();
      const deviceId = 'device-rotate-fail';
      const correctPassword = 'correct-password';
      const wrongPassword = 'wrong-password';
      const newPassword = 'new-password';

      await encryptionService.generateKeyPair(
        user.id,
        deviceId,
        correctPassword
      );

      await expect(
        encryptionService.rotateKey(
          user.id,
          deviceId,
          wrongPassword,
          newPassword
        )
      ).rejects.toThrow('Invalid old password');
    });
  });

  describe('deleteDeviceKeys', () => {
    it('should deactivate all keys for device', async () => {
      const user = createTestUser();
      const deviceId = 'device-delete-test';

      const key = await encryptionService.generateKeyPair(
        user.id,
        deviceId,
        'password'
      );

      const deleteCount = await encryptionService.deleteDeviceKeys(
        user.id,
        deviceId
      );

      expect(deleteCount).toBe(1);

      const keyRecord = await EncryptionKey.findByPk(key.keyId);
      expect(keyRecord.active).toBe(false);
    });

    it('should return 0 for non-existent device', async () => {
      const user = createTestUser();

      const deleteCount = await encryptionService.deleteDeviceKeys(
        user.id,
        'non-existent-device'
      );

      expect(deleteCount).toBe(0);
    });
  });

  describe('getUserKeys', () => {
    it('should return all keys for user across devices', async () => {
      const user = createTestUser();

      await encryptionService.generateKeyPair(user.id, 'device-1', 'pass1');
      await encryptionService.generateKeyPair(user.id, 'device-2', 'pass2');
      await encryptionService.generateKeyPair(user.id, 'device-3', 'pass3');

      const keys = await encryptionService.getUserKeys(user.id);

      expect(keys).toHaveLength(3);
      expect(keys[0]).toHaveProperty('keyId');
      expect(keys[0]).toHaveProperty('deviceId');
      expect(keys[0]).toHaveProperty('keyFingerprint');
      expect(keys[0]).toHaveProperty('active');
    });

    it('should include inactive keys', async () => {
      const user = createTestUser();
      const deviceId = 'device-history';

      await encryptionService.generateKeyPair(user.id, deviceId, 'pass1');
      await encryptionService.generateKeyPair(user.id, deviceId, 'pass2');

      const keys = await encryptionService.getUserKeys(user.id);

      expect(keys).toHaveLength(2);
      expect(keys.filter(k => k.active)).toHaveLength(1);
      expect(keys.filter(k => !k.active)).toHaveLength(1);
    });
  });

  describe('validateKeyOwnership', () => {
    it('should return true for owned key', async () => {
      const user = createTestUser();
      const key = await encryptionService.generateKeyPair(
        user.id,
        'device-own',
        'password'
      );

      const isOwner = await encryptionService.validateKeyOwnership(
        key.keyId,
        user.id
      );

      expect(isOwner).toBe(true);
    });

    it('should return false for non-owned key', async () => {
      const user1 = createTestUser();
      const user2 = createTestUser();

      const key = await encryptionService.generateKeyPair(
        user1.id,
        'device-1',
        'password'
      );

      const isOwner = await encryptionService.validateKeyOwnership(
        key.keyId,
        user2.id
      );

      expect(isOwner).toBe(false);
    });
  });

  describe('storeMessageKeys', () => {
    it('should store encrypted keys for recipients', async () => {
      const {
        createTestMessage,
        createTestConversation,
        createTestParticipant,
        MessageKey
      } = require('../helpers/testDatabase');

      const sender = createTestUser();
      const recipient1 = createTestUser();
      const recipient2 = createTestUser();

      const conversation = await createTestConversation();
      await createTestParticipant(conversation.id, sender.id);
      await createTestParticipant(conversation.id, recipient1.id);
      await createTestParticipant(conversation.id, recipient2.id);

      const message = await createTestMessage(
        conversation.id,
        sender.id,
        'Test message'
      );

      const recipientKeys = [
        { userId: recipient1.id, encryptedKey: 'encrypted-key-1' },
        { userId: recipient2.id, encryptedKey: 'encrypted-key-2' }
      ];

      await encryptionService.storeMessageKeys(message.id, recipientKeys);

      const storedKeys = await MessageKey.findAll({
        where: { messageId: message.id }
      });

      expect(storedKeys).toHaveLength(2);
    });
  });

  describe('getMessageKey', () => {
    it('should retrieve encrypted key for recipient', async () => {
      const {
        createTestMessage,
        createTestConversation,
        createTestParticipant,
        createTestMessageKey
      } = require('../helpers/testDatabase');

      const sender = createTestUser();
      const recipient = createTestUser();

      const conversation = await createTestConversation();
      const message = await createTestMessage(
        conversation.id,
        sender.id,
        'Test'
      );

      await createTestMessageKey(message.id, recipient.id, {
        encryptedMessageKey: 'test-encrypted-key'
      });

      const key = await encryptionService.getMessageKey(
        message.id,
        recipient.id
      );

      expect(key).toBe('test-encrypted-key');
    });

    it('should return null for non-existent key', async () => {
      const {
        createTestMessage,
        createTestConversation
      } = require('../helpers/testDatabase');

      const sender = createTestUser();
      const recipient = createTestUser();

      const conversation = await createTestConversation();
      const message = await createTestMessage(
        conversation.id,
        sender.id,
        'Test'
      );

      const key = await encryptionService.getMessageKey(
        message.id,
        recipient.id
      );

      expect(key).toBeNull();
    });
  });
});
