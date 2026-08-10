/**
 * Spark Service Seeder - Conversations, Messages, Reactions
 */

const { Sequelize } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  const startTime = Date.now();
  let recordsCreated = 0;

  const sequelize = new Sequelize(
    process.env.SPARK_DB_NAME || 'exprsn_spark',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: false
    }
  );

  try {
    await sequelize.authenticate();
    console.log('  Connected to exprsn_spark database');

    const userIds = Array.from({ length: 15 }, () => uuidv4());

    // ═══════════════════════════════════════════════════════════════════
    // 1. Create Conversations
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating conversations...');

    const conversationIds = [];
    for (let i = 0; i < 30; i++) {
      const convId = uuidv4();
      const isGroup = Math.random() > 0.6;

      await sequelize.query(`
        INSERT INTO conversations (id, type, name, is_encrypted, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${Math.floor(Math.random() * 60)} days', NOW())
      `, {
        replacements: [
          convId,
          isGroup ? 'group' : 'direct',
          isGroup ? `Team ${i}` : null,
          Math.random() > 0.3
        ]
      });
      conversationIds.push(convId);
      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. Add Participants
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Adding participants...');

    for (const convId of conversationIds) {
      const numParticipants = Math.floor(Math.random() * 5) + 2;
      const selectedUsers = userIds.sort(() => 0.5 - Math.random()).slice(0, numParticipants);

      for (const userId of selectedUsers) {
        try {
          await sequelize.query(`
            INSERT INTO participants (conversation_id, user_id, role, joined_at, created_at, updated_at)
            VALUES ($1, $2, $3, NOW() - INTERVAL '${Math.floor(Math.random() * 50)} days', NOW(), NOW())
          `, {
            replacements: [convId, userId, Math.random() > 0.8 ? 'admin' : 'member']
          });
          recordsCreated++;
        } catch (err) {
          // Ignore duplicates
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. Create Messages
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating messages...');

    const messageTexts = [
      "Hey! How's the project going?",
      "Just finished the deployment 🚀",
      "Can we schedule a meeting for tomorrow?",
      "Great work on the last sprint!",
      "I'll review the PR shortly",
      "Thanks for the help!",
      "Did you see the latest updates?",
      "Let me know when you're available",
      "Perfect timing!",
      "Looking forward to the demo"
    ];

    const messageIds = [];
    for (let i = 0; i < 500; i++) {
      const messageId = uuidv4();
      await sequelize.query(`
        INSERT INTO messages (id, conversation_id, sender_id, content, is_encrypted, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${Math.floor(Math.random() * 40)} days', NOW())
      `, {
        replacements: [
          messageId,
          conversationIds[Math.floor(Math.random() * conversationIds.length)],
          userIds[Math.floor(Math.random() * userIds.length)],
          messageTexts[Math.floor(Math.random() * messageTexts.length)],
          Math.random() > 0.3
        ]
      });
      messageIds.push(messageId);
      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. Create Reactions
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating reactions...');

    const emojis = ['👍', '❤️', '😂', '🎉', '🔥', '👏'];

    for (let i = 0; i < 200; i++) {
      try {
        await sequelize.query(`
          INSERT INTO reactions (message_id, user_id, emoji, created_at, updated_at)
          VALUES ($1, $2, $3, NOW(), NOW())
        `, {
          replacements: [
            messageIds[Math.floor(Math.random() * messageIds.length)],
            userIds[Math.floor(Math.random() * userIds.length)],
            emojis[Math.floor(Math.random() * emojis.length)]
          ]
        });
        recordsCreated++;
      } catch (err) {
        // Ignore duplicates
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      recordsCreated,
      duration,
      summary: {
        conversations: conversationIds.length,
        messages: messageIds.length,
        reactions: 200
      }
    };

  } catch (error) {
    console.error('  Error seeding Spark:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  seed()
    .then(result => {
      console.log(`\nSpark seeded: ${result.recordsCreated} records in ${result.duration}s`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to seed Spark:', error);
      process.exit(1);
    });
}

module.exports = { seed };
