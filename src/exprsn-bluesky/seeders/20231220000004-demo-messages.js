const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const repositories = await queryInterface.sequelize.query(
        'SELECT id, did FROM repositories ORDER BY created_at LIMIT 10',
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );

      const accounts = await queryInterface.sequelize.query(
        'SELECT id, did FROM accounts ORDER BY created_at LIMIT 10',
        { type: queryInterface.sequelize.QueryTypes.SELECT }
      );

      if (repositories.length < 6 || accounts.length < 6) {
        console.log('Not enough repositories or accounts. Run previous seeders first.');
        return;
      }

    const now = new Date();
    const records = [];

    // Helper functions
    const generateCID = () => `bafyreig${crypto.randomBytes(16).toString('hex')}`;
    const generateConvId = () => `conv_${crypto.randomBytes(8).toString('hex')}`;

    const createRecord = (repository, collection, rkey, value) => {
      const uri = `at://${repository.did}/${collection}/${rkey}`;
      return {
        id: uuidv4(),
        repository_id: repository.id,
        uri,
        collection,
        rkey,
        cid: generateCID(),
        value,
        indexed_at: new Date(now.getTime() - Math.random() * 3 * 24 * 60 * 60 * 1000),
        created_at: new Date(now.getTime() - Math.random() * 3 * 24 * 60 * 60 * 1000),
        updated_at: now
      };
    };

    // 1. Create 1:1 conversations
    const conversations = [];

    // Conversation 1: alice and bob
    const conv1Id = generateConvId();
    const conv1 = createRecord(repositories[0], 'io.exprsn.spark.conversation', conv1Id, {
      $type: 'io.exprsn.spark.conversation',
      participants: [accounts[0].did, accounts[1].did],
      isGroup: false,
      isEncrypted: true,
      settings: {
        isPinned: false
      },
      createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
    });
    records.push(conv1);
    conversations.push({ id: conv1Id, participants: [0, 1], record: conv1 });

    // Conversation 2: charlie and diana
    const conv2Id = generateConvId();
    const conv2 = createRecord(repositories[2], 'io.exprsn.spark.conversation', conv2Id, {
      $type: 'io.exprsn.spark.conversation',
      participants: [accounts[2].did, accounts[3].did],
      isGroup: false,
      isEncrypted: true,
      createdAt: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString()
    });
    records.push(conv2);
    conversations.push({ id: conv2Id, participants: [2, 3], record: conv2 });

    // 2. Create a group conversation
    const conv3Id = generateConvId();
    const conv3 = createRecord(repositories[0], 'io.exprsn.spark.conversation', conv3Id, {
      $type: 'io.exprsn.spark.conversation',
      participants: [accounts[0].did, accounts[1].did, accounts[4].did, accounts[5].did],
      name: 'Dev Team Chat',
      isGroup: true,
      isEncrypted: false,
      settings: {
        isPinned: true,
        customColor: '#4A90E2'
      },
      createdAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString()
    });
    records.push(conv3);
    conversations.push({ id: conv3Id, participants: [0, 1, 4, 5], record: conv3, isGroup: true });

    // 3. Create messages for each conversation
    const messageTexts = {
      conv1: [
        { sender: 0, text: 'Hey Bob! Did you see the new AT Protocol features?' },
        { sender: 1, text: 'Yes! The lexicon system is really powerful' },
        { sender: 0, text: 'Agreed! I\'m working on some custom lexicons now' },
        { sender: 1, text: 'Cool! Let me know if you need help with the designs' },
        { sender: 0, text: 'Will do, thanks! 🙏' }
      ],
      conv2: [
        { sender: 0, text: 'Diana, quick question about the roadmap' },
        { sender: 1, text: 'Sure, what\'s up?' },
        { sender: 0, text: 'Are we still on track for the Q1 release?' },
        { sender: 1, text: 'Yes, everything looks good so far!' },
        { sender: 0, text: 'Perfect, thanks for the update 👍' }
      ],
      conv3: [
        { sender: 0, text: 'Morning team! Quick standup?' },
        { sender: 1, text: 'Sure! I finished the UI mockups yesterday' },
        { sender: 2, text: 'Great! I\'ll start implementing them today' },
        { sender: 3, text: 'And I\'ll work on the API integration' },
        { sender: 0, text: 'Awesome teamwork everyone! 🎉' },
        { sender: 1, text: 'Question: should we use the blue or green theme?' },
        { sender: 2, text: 'I vote blue, it\'s more calming' },
        { sender: 3, text: '+1 for blue' },
        { sender: 0, text: 'Blue it is then!' }
      ]
    };

    conversations.forEach((conv, convIndex) => {
      const convKey = `conv${convIndex + 1}`;
      const messages = messageTexts[convKey];

      messages.forEach((msg, msgIndex) => {
        const senderRepo = repositories[conv.participants[msg.sender]];
        const isLast = msgIndex === messages.length - 1;

        // Add reactions to some messages
        const reactions = [];
        if (Math.random() > 0.6 && !isLast && conv.participants.length > 0) {
          const participantIndex = conv.participants[Math.floor(Math.random() * conv.participants.length)];
          // Make sure the account exists
          if (accounts[participantIndex]) {
            const emojis = ['👍', '❤️', '😄', '🎉', '👏'];
            reactions.push({
              emoji: emojis[Math.floor(Math.random() * emojis.length)],
              actor: accounts[participantIndex].did,
              createdAt: new Date(now.getTime() - (messages.length - msgIndex - 1) * 60 * 60 * 1000).toISOString()
            });
          }
        }

        const messageRecord = createRecord(
          senderRepo,
          'io.exprsn.spark.message',
          `msg_${convIndex}_${msgIndex}`,
          {
            $type: 'io.exprsn.spark.message',
            conversationId: conv.id,
            content: {
              type: 'text',
              text: msg.text
            },
            reactions: reactions.length > 0 ? reactions : undefined,
            isEdited: false,
            createdAt: new Date(now.getTime() - (messages.length - msgIndex) * 60 * 60 * 1000).toISOString()
          }
        );

        messageRecord.created_at = new Date(now.getTime() - (messages.length - msgIndex) * 60 * 60 * 1000);
        records.push(messageRecord);
      });
    });

    // Use raw SQL for JSONB column
    await queryInterface.bulkInsert('records', records.map(r => ({
      ...r,
      value: queryInterface.sequelize.literal(`'${JSON.stringify(r.value).replace(/'/g, "''")}'::jsonb`)
    })));

    // Update repository counts
    for (const repo of repositories) {
      const repoRecords = records.filter(r => r.repository_id === repo.id);
      if (repoRecords.length > 0) {
        await queryInterface.sequelize.query(
          `UPDATE repositories SET
            record_count = record_count + ${repoRecords.length},
            commit_count = commit_count + ${repoRecords.length},
            updated_at = NOW()
          WHERE id = '${repo.id}'`
        );
      }
    }

    console.log(`✓ Created ${conversations.length} conversations with ${records.length - conversations.length} messages`);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('records', {
      collection: {
        [Sequelize.Op.in]: ['io.exprsn.spark.conversation', 'io.exprsn.spark.message']
      }
    }, {});
  }
};
