/**
 * Timeline Service Seeder - Posts, Comments, Likes, Follows
 */

const { Sequelize } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

async function seed() {
  const startTime = Date.now();
  let recordsCreated = 0;

  const sequelize = new Sequelize(
    process.env.TIMELINE_DB_NAME || 'exprsn_timeline',
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
    console.log('  Connected to exprsn_timeline database');

    // Sample user IDs (would come from CA in real scenario)
    const userIds = Array.from({ length: 20 }, () => uuidv4());

    // ═══════════════════════════════════════════════════════════════════
    // 1. Create Posts
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating posts...');

    const postContents = [
      "Just deployed our new microservices architecture! 🚀",
      "Love working with the Exprsn platform. The CA token system is brilliant!",
      "Anyone else excited about the new workflow automation features?",
      "Pro tip: Always validate your tokens before processing requests.",
      "Great meetup today discussing distributed systems.",
      "The new real-time messaging is incredibly fast!",
      "Just finished implementing E2EE in our chat app.",
      "Database migrations completed successfully ✅",
      "Looking for feedback on our new API design.",
      "Thanks everyone for the amazing support!",
      "Debugging can be therapeutic when you find the bug 🐛",
      "Code review time! Always learning from the team.",
      "Performance optimizations are so satisfying.",
      "Just hit 1M API requests today! 📈",
      "The documentation for this platform is excellent.",
      "Exploring the new file vault features.",
      "Live streaming integration working perfectly!",
      "Security audit passed with flying colors! 🎉",
      "Our moderation AI is getting smarter every day.",
      "Shoutout to the amazing dev team! 💯"
    ];

    const postIds = [];
    for (let i = 0; i < 100; i++) {
      const postId = uuidv4();
      const visibility = ['public', 'followers', 'private'][Math.floor(Math.random() * 3)];

      await sequelize.query(`
        INSERT INTO posts (id, user_id, content, visibility, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days', NOW())
      `, {
        replacements: [
          postId,
          userIds[Math.floor(Math.random() * userIds.length)],
          postContents[Math.floor(Math.random() * postContents.length)],
          visibility
        ]
      });
      postIds.push(postId);
      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. Create Likes
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating likes...');

    for (let i = 0; i < 300; i++) {
      try {
        await sequelize.query(`
          INSERT INTO likes (user_id, post_id, created_at, updated_at)
          VALUES ($1, $2, NOW() - INTERVAL '${Math.floor(Math.random() * 25)} days', NOW())
        `, {
          replacements: [
            userIds[Math.floor(Math.random() * userIds.length)],
            postIds[Math.floor(Math.random() * postIds.length)]
          ]
        });
        recordsCreated++;
      } catch (err) {
        // Ignore duplicate key violations
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. Create Comments
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating comments...');

    const commentTexts = [
      "Great post!",
      "Thanks for sharing this!",
      "Totally agree with this.",
      "Interesting perspective!",
      "Could you elaborate on this?",
      "This helped me solve my issue!",
      "Amazing work! 🎉",
      "I had the same problem!",
      "Looking forward to trying this out.",
      "Excellent explanation!"
    ];

    for (let i = 0; i < 200; i++) {
      await sequelize.query(`
        INSERT INTO comments (id, user_id, post_id, content, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${Math.floor(Math.random() * 20)} days', NOW())
      `, {
        replacements: [
          uuidv4(),
          userIds[Math.floor(Math.random() * userIds.length)],
          postIds[Math.floor(Math.random() * postIds.length)],
          commentTexts[Math.floor(Math.random() * commentTexts.length)]
        ]
      });
      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. Create Follows
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating follows...');

    for (let i = 0; i < 80; i++) {
      try {
        const followerId = userIds[Math.floor(Math.random() * userIds.length)];
        const followingId = userIds[Math.floor(Math.random() * userIds.length)];

        if (followerId !== followingId) {
          await sequelize.query(`
            INSERT INTO follows (follower_id, following_id, created_at, updated_at)
            VALUES ($1, $2, NOW() - INTERVAL '${Math.floor(Math.random() * 60)} days', NOW())
          `, {
            replacements: [followerId, followingId]
          });
          recordsCreated++;
        }
      } catch (err) {
        // Ignore duplicate key violations
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 5. Create Bookmarks
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating bookmarks...');

    for (let i = 0; i < 50; i++) {
      try {
        await sequelize.query(`
          INSERT INTO bookmarks (user_id, post_id, created_at, updated_at)
          VALUES ($1, $2, NOW() - INTERVAL '${Math.floor(Math.random() * 15)} days', NOW())
        `, {
          replacements: [
            userIds[Math.floor(Math.random() * userIds.length)],
            postIds[Math.floor(Math.random() * postIds.length)]
          ]
        });
        recordsCreated++;
      } catch (err) {
        // Ignore duplicate key violations
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // 6. Create Reposts
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating reposts...');

    for (let i = 0; i < 40; i++) {
      try {
        await sequelize.query(`
          INSERT INTO reposts (id, user_id, post_id, comment, created_at, updated_at)
          VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${Math.floor(Math.random() * 10)} days', NOW())
        `, {
          replacements: [
            uuidv4(),
            userIds[Math.floor(Math.random() * userIds.length)],
            postIds[Math.floor(Math.random() * postIds.length)],
            Math.random() > 0.5 ? 'Check this out!' : null
          ]
        });
        recordsCreated++;
      } catch (err) {
        // Ignore errors
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      recordsCreated,
      duration,
      summary: {
        posts: postIds.length,
        likes: 300,
        comments: 200,
        follows: 80
      }
    };

  } catch (error) {
    console.error('  Error seeding Timeline:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

if (require.main === module) {
  seed()
    .then(result => {
      console.log(`\nTimeline seeded: ${result.recordsCreated} records in ${result.duration}s`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to seed Timeline:', error);
      process.exit(1);
    });
}

module.exports = { seed };
