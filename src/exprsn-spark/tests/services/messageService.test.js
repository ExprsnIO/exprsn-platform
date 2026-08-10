/**
 * Message Service Unit Tests
 */

const messageService = require('../../src/services/messageService');
const {
  connectTestDatabase,
  syncDatabase,
  cleanDatabase,
  disconnectTestDatabase,
  createTestUser,
  createTestConversation,
  createTestParticipant,
  createTestMessage,
  createTestEncryptedMessage,
  Message,
  Participant
} = require('../helpers/testDatabase');

describe('MessageService', () => {
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

  describe('sendMessage', () => {
    it('should send a plaintext message successfully', async () => {
      const sender = createTestUser();
      const recipient = createTestUser();
      const conversation = await createTestConversation();
      await createTestParticipant(conversation.id, sender.id);
      await createTestParticipant(conversation.id, recipient.id);

      const message = await messageService.sendMessage(
        conversation.id,
        sender.id,
        'Hello, world!',
        { type: 'text' }
      );

      expect(message).toBeTruthy();
      expect(message.content).toBe('Hello, world!');
      expect(message.senderId).toBe(sender.id);
      expect(message.encrypted).toBe(false);
    });

    it('should send an encrypted message successfully', async () => {
      const sender = createTestUser();
      const recipient = createTestUser();
      const conversation = await createTestConversation();
      await createTestParticipant(conversation.id, sender.id);
      await createTestParticipant(conversation.id, recipient.id);

      const message = await messageService.sendMessage(
        conversation.id,
        sender.id,
        null,
        {
          encrypted: true,
          encryptedContent: 'encrypted-content-abc123',
          senderKeyFingerprint: 'a'.repeat(64)
        }
      );

      expect(message).toBeTruthy();
      expect(message.encryptedContent).toBe('encrypted-content-abc123');
      expect(message.content).toBeNull();
      expect(message.encrypted).toBe(true);
      expect(message.senderKeyFingerprint).toBe('a'.repeat(64));
    });

    it('should fail if sender is not a participant', async () => {
      const sender = createTestUser();
      const conversation = await createTestConversation();

      await expect(
        messageService.sendMessage(conversation.id, sender.id, 'Hello')
      ).rejects.toThrow('Not a participant');
    });

    it('should sanitize HTML in plaintext messages', async () => {
      const sender = createTestUser();
      const conversation = await createTestConversation();
      await createTestParticipant(conversation.id, sender.id);

      const message = await messageService.sendMessage(
        conversation.id,
        sender.id,
        '<script>alert("xss")</script><b>Hello</b>'
      );

      expect(message.content).not.toContain('<script>');
      expect(message.content).toContain('<b>Hello</b>');
    });
  });

  describe('getMessages', () => {
    it('should retrieve messages for a conversation', async () => {
      const user1 = createTestUser();
      const user2 = createTestUser();
      const conversation = await createTestConversation();
      await createTestParticipant(conversation.id, user1.id);
      await createTestParticipant(conversation.id, user2.id);

      await createTestMessage(conversation.id, user1.id, 'Message 1');
      await createTestMessage(conversation.id, user2.id, 'Message 2');
      await createTestMessage(conversation.id, user1.id, 'Message 3');

      const messages = await messageService.getMessages(
        conversation.id,
        user1.id
      );

      expect(messages).toHaveLength(3);
    });

    it('should fail if user is not a participant', async () => {
      const user = createTestUser();
      const conversation = await createTestConversation();

      await expect(
        messageService.getMessages(conversation.id, user.id)
      ).rejects.toThrow('Access denied');
    });

    it('should respect limit parameter', async () => {
      const user = createTestUser();
      const conversation = await createTestConversation();
      await createTestParticipant(conversation.id, user.id);

      for (let i = 0; i < 10; i++) {
        await createTestMessage(conversation.id, user.id, `Message ${i}`);
      }

      const messages = await messageService.getMessages(
        conversation.id,
        user.id,
        { limit: 5 }
      );

      expect(messages).toHaveLength(5);
    });
  });

  describe('editMessage', () => {
    it('should edit a plaintext message', async () => {
      const user = createTestUser();
      const conversation = await createTestConversation();
      await createTestParticipant(conversation.id, user.id);

      const message = await createTestMessage(
        conversation.id,
        user.id,
        'Original message'
      );

      const edited = await messageService.editMessage(
        message.id,
        user.id,
        'Edited message'
      );

      expect(edited.content).toBe('Edited message');
      expect(edited.edited).toBe(true);
      expect(edited.editedAt).toBeTruthy();
    });

    it('should edit an encrypted message', async () => {
      const user = createTestUser();
      const conversation = await createTestConversation();
      await createTestParticipant(conversation.id, user.id);

      const message = await createTestEncryptedMessage(
        conversation.id,
        user.id
      );

      const edited = await messageService.editMessage(
        message.id,
        user.id,
        null,
        { encryptedContent: 'new-encrypted-content' }
      );

      expect(edited.encryptedContent).toBe('new-encrypted-content');
      expect(edited.edited).toBe(true);
    });

    it('should fail if user is not the sender', async () => {
      const user1 = createTestUser();
      const user2 = createTestUser();
      const conversation = await createTestConversation();

      const message = await createTestMessage(
        conversation.id,
        user1.id,
        'Message'
      );

      await expect(
        messageService.editMessage(message.id, user2.id, 'Edited')
      ).rejects.toThrow("Cannot edit other user's message");
    });
  });

  describe('deleteMessage', () => {
    it('should delete a message', async () => {
      const user = createTestUser();
      const conversation = await createTestConversation();
      await createTestParticipant(conversation.id, user.id);

      const message = await createTestMessage(
        conversation.id,
        user.id,
        'To be deleted'
      );

      const result = await messageService.deleteMessage(message.id, user.id);

      expect(result.success).toBe(true);

      const deletedMessage = await Message.findByPk(message.id);
      expect(deletedMessage).toBeNull();
    });

    it('should fail if user is not the sender', async () => {
      const user1 = createTestUser();
      const user2 = createTestUser();
      const conversation = await createTestConversation();

      const message = await createTestMessage(
        conversation.id,
        user1.id,
        'Message'
      );

      await expect(
        messageService.deleteMessage(message.id, user2.id)
      ).rejects.toThrow("Cannot delete other user's message");
    });
  });

  describe('addReaction', () => {
    it('should add a reaction to a message', async () => {
      const user = createTestUser();
      const conversation = await createTestConversation();
      const message = await createTestMessage(
        conversation.id,
        user.id,
        'Message'
      );

      const reaction = await messageService.addReaction(
        message.id,
        user.id,
        '👍'
      );

      expect(reaction).toBeTruthy();
      expect(reaction.emoji).toBe('👍');
      expect(reaction.userId).toBe(user.id);
    });

    it('should not create duplicate reactions', async () => {
      const user = createTestUser();
      const conversation = await createTestConversation();
      const message = await createTestMessage(
        conversation.id,
        user.id,
        'Message'
      );

      const reaction1 = await messageService.addReaction(
        message.id,
        user.id,
        '👍'
      );

      const reaction2 = await messageService.addReaction(
        message.id,
        user.id,
        '👍'
      );

      expect(reaction1.id).toBe(reaction2.id);
    });
  });

  describe('removeReaction', () => {
    it('should remove a reaction from a message', async () => {
      const { createTestReaction } = require('../helpers/testDatabase');

      const user = createTestUser();
      const conversation = await createTestConversation();
      const message = await createTestMessage(
        conversation.id,
        user.id,
        'Message'
      );

      await createTestReaction(message.id, user.id, '👍');

      const result = await messageService.removeReaction(
        message.id,
        user.id,
        '👍'
      );

      expect(result.success).toBe(true);
    });

    it('should fail if reaction does not exist', async () => {
      const user = createTestUser();
      const conversation = await createTestConversation();
      const message = await createTestMessage(
        conversation.id,
        user.id,
        'Message'
      );

      await expect(
        messageService.removeReaction(message.id, user.id, '👍')
      ).rejects.toThrow('Reaction not found');
    });
  });

  describe('markAsRead', () => {
    it('should mark messages as read', async () => {
      const user = createTestUser();
      const conversation = await createTestConversation();
      await createTestParticipant(conversation.id, user.id);

      const result = await messageService.markAsRead(
        conversation.id,
        user.id,
        []
      );

      expect(result.success).toBe(true);
      expect(result.readAt).toBeTruthy();

      const participant = await Participant.findOne({
        where: { conversationId: conversation.id, userId: user.id }
      });

      expect(participant.lastReadAt).toBeTruthy();
    });

    it('should fail if user is not a participant', async () => {
      const user = createTestUser();
      const conversation = await createTestConversation();

      await expect(
        messageService.markAsRead(conversation.id, user.id, [])
      ).rejects.toThrow('Not a participant');
    });
  });
});
