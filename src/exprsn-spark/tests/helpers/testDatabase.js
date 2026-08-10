/**
 * Test Database Helpers
 * Utilities for setting up and tearing down test database
 */

const { sequelize, Conversation, Message, Participant, Reaction, EncryptionKey, MessageKey } = require('../../src/models');
const crypto = require('crypto');

/**
 * Connect to test database
 */
async function connectTestDatabase() {
  try {
    await sequelize.authenticate();
    console.log('Test database connected');
    return true;
  } catch (error) {
    console.error('Failed to connect to test database:', error.message);
    return false;
  }
}

/**
 * Sync database schema (create tables)
 */
async function syncDatabase(options = {}) {
  try {
    await sequelize.sync({ force: options.force || false, ...options });
    console.log('Test database synced');
    return true;
  } catch (error) {
    console.error('Failed to sync test database:', error.message);
    throw error;
  }
}

/**
 * Clean all test data
 */
async function cleanDatabase() {
  try {
    // Delete in correct order (respect foreign keys)
    await MessageKey.destroy({ where: {}, force: true });
    await EncryptionKey.destroy({ where: {}, force: true });
    await Reaction.destroy({ where: {}, force: true });
    await Message.destroy({ where: {}, force: true });
    await Participant.destroy({ where: {}, force: true });
    await Conversation.destroy({ where: {}, force: true });

    console.log('Test database cleaned');
    return true;
  } catch (error) {
    console.error('Failed to clean test database:', error.message);
    throw error;
  }
}

/**
 * Disconnect from test database
 */
async function disconnectTestDatabase() {
  try {
    await sequelize.close();
    console.log('Test database disconnected');
    return true;
  } catch (error) {
    console.error('Failed to disconnect from test database:', error.message);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════
// Test Data Factories
// ═══════════════════════════════════════════════════════════

/**
 * Create test user (mock - we don't have a User model in Spark)
 */
function createTestUser(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    username: `testuser_${Date.now()}`,
    email: `test${Date.now()}@example.com`,
    ...overrides
  };
}

/**
 * Create test conversation
 */
async function createTestConversation(overrides = {}) {
  const defaults = {
    type: 'direct',
    maxParticipants: 2,
    isPrivate: true
  };

  return await Conversation.create({
    ...defaults,
    ...overrides
  });
}

/**
 * Create test participant
 */
async function createTestParticipant(conversationId, userId, overrides = {}) {
  const defaults = {
    role: 'member',
    active: true
  };

  return await Participant.create({
    conversationId,
    userId,
    ...defaults,
    ...overrides
  });
}

/**
 * Create test message
 */
async function createTestMessage(conversationId, senderId, content, overrides = {}) {
  const defaults = {
    contentType: 'text',
    deleted: false
  };

  return await Message.create({
    conversationId,
    senderId,
    content,
    ...defaults,
    ...overrides
  });
}

/**
 * Create test encrypted message
 */
async function createTestEncryptedMessage(conversationId, senderId, overrides = {}) {
  const defaults = {
    contentType: 'text',
    encrypted: true,
    encryptedContent: 'encrypted-content-' + crypto.randomBytes(16).toString('hex'),
    senderKeyFingerprint: crypto.randomBytes(32).toString('hex'),
    deleted: false
  };

  return await Message.create({
    conversationId,
    senderId,
    content: null,
    ...defaults,
    ...overrides
  });
}

/**
 * Create test reaction
 */
async function createTestReaction(messageId, userId, emoji = '👍', overrides = {}) {
  return await Reaction.create({
    messageId,
    userId,
    emoji,
    ...overrides
  });
}

/**
 * Create test encryption key
 */
async function createTestEncryptionKey(userId, deviceId, overrides = {}) {
  // Generate a simple test key pair
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048, // Use smaller key for tests (faster)
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const keyFingerprint = crypto
    .createHash('sha256')
    .update(publicKey)
    .digest('hex');

  // Simple encryption of private key for tests
  const cipher = crypto.createCipher('aes-256-cbc', 'test-password');
  let encryptedPrivateKey = cipher.update(privateKey, 'utf8', 'hex');
  encryptedPrivateKey += cipher.final('hex');

  const defaults = {
    keyType: 'rsa-4096',
    active: true
  };

  return await EncryptionKey.create({
    userId,
    deviceId,
    publicKey,
    encryptedPrivateKey,
    keyFingerprint,
    ...defaults,
    ...overrides
  });
}

/**
 * Create test message key
 */
async function createTestMessageKey(messageId, recipientId, overrides = {}) {
  const defaults = {
    encryptedMessageKey: 'encrypted-key-' + crypto.randomBytes(16).toString('hex')
  };

  return await MessageKey.create({
    messageId,
    recipientId,
    ...defaults,
    ...overrides
  });
}

/**
 * Create full conversation with participants and messages
 */
async function createFullTestConversation(userIds = [], messageCount = 5) {
  if (userIds.length < 2) {
    throw new Error('Need at least 2 users for a conversation');
  }

  // Create conversation
  const conversation = await createTestConversation({
    type: userIds.length === 2 ? 'direct' : 'group',
    maxParticipants: userIds.length
  });

  // Add participants
  const participants = [];
  for (const userId of userIds) {
    const participant = await createTestParticipant(conversation.id, userId);
    participants.push(participant);
  }

  // Add messages
  const messages = [];
  for (let i = 0; i < messageCount; i++) {
    const senderId = userIds[i % userIds.length];
    const message = await createTestMessage(
      conversation.id,
      senderId,
      `Test message ${i + 1}`
    );
    messages.push(message);
  }

  return {
    conversation,
    participants,
    messages
  };
}

module.exports = {
  // Database operations
  connectTestDatabase,
  syncDatabase,
  cleanDatabase,
  disconnectTestDatabase,

  // Factories
  createTestUser,
  createTestConversation,
  createTestParticipant,
  createTestMessage,
  createTestEncryptedMessage,
  createTestReaction,
  createTestEncryptionKey,
  createTestMessageKey,
  createFullTestConversation,

  // Models (for direct access)
  Conversation,
  Message,
  Participant,
  Reaction,
  EncryptionKey,
  MessageKey
};
