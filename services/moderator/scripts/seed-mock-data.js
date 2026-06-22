/**
 * Seed Mock Data for Testing
 * Creates realistic test data for the moderation dashboard
 */

require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

const config = {
  host: process.env.MODERATOR_PG_HOST || 'localhost',
  port: parseInt(process.env.MODERATOR_PG_PORT) || 5432,
  database: process.env.MODERATOR_PG_DATABASE || 'exprsn_moderator',
  username: process.env.MODERATOR_PG_USER || 'postgres',
  password: process.env.MODERATOR_PG_PASSWORD || '',
  dialect: 'postgres',
  logging: false
};

// Sample content for moderation
const sampleContent = [
  "Hey everyone, check out my new blog post about web development!",
  "This is spam! Click here to win $1000000!!! Limited time offer!!!",
  "I hate this stupid platform and everyone on it. You all suck!",
  "Just finished a great book on JavaScript. Highly recommend!",
  "Buy cheap pills online! No prescription needed! Click now!!!",
  "Can someone help me with this React error? I'm stuck.",
  "This content violates our community guidelines and should be removed.",
  "Beautiful sunset photo from my trip to California 🌅",
  "F*** this website and all the idiots who use it!",
  "Looking for recommendations on the best Node.js frameworks.",
  "🔥 HOT DEAL 🔥 Make money from home! Work 1 hour per day!!!",
  "Thanks for the helpful tutorial! Really appreciated.",
  "I think the moderators are biased and unfair.",
  "Check out my photography portfolio, would love feedback!",
  "This is clearly offensive content that needs to be flagged.",
  "Does anyone know how to fix CORS errors in Express?",
  "Amazing community here! Thanks for all the support.",
  "You're all a bunch of [redacted] and I hope you [redacted]",
  "New to coding, any beginner-friendly resources?",
  "URGENT: Your account has been compromised! Click here now!"
];

const contentTypes = ['post', 'comment', 'message'];
const sourceServices = ['timeline', 'spark', 'nexus', 'gallery'];
const userIds = Array.from({ length: 10 }, () => uuidv4());
const moderatorIds = Array.from({ length: 3 }, () => uuidv4());

async function seedMockData() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Exprsn Moderator - Mock Data Seeding');
  console.log('═══════════════════════════════════════════════════════════\n');

  const sequelize = new Sequelize(config);

  try {
    // Test connection
    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('✓ Database connection successful\n');

    // Clear existing data
    console.log('Clearing existing data...');
    await sequelize.query('TRUNCATE TABLE moderation_actions CASCADE');
    await sequelize.query('TRUNCATE TABLE review_queue CASCADE');
    await sequelize.query('TRUNCATE TABLE reports CASCADE');
    await sequelize.query('TRUNCATE TABLE user_actions CASCADE');
    await sequelize.query('TRUNCATE TABLE appeals CASCADE');
    await sequelize.query('TRUNCATE TABLE moderation_items CASCADE');
    await sequelize.query('TRUNCATE TABLE moderation_rules CASCADE');
    console.log('✓ Existing data cleared\n');

    // Insert moderation items
    console.log('Creating moderation items...');
    const moderationItems = [];

    for (let i = 0; i < sampleContent.length; i++) {
      const content = sampleContent[i];
      const contentType = contentTypes[Math.floor(Math.random() * contentTypes.length)];
      const sourceService = sourceServices[Math.floor(Math.random() * sourceServices.length)];
      const userId = userIds[Math.floor(Math.random() * userIds.length)];

      // Determine scores based on content
      let toxicityScore = Math.floor(Math.random() * 30);
      let nsfwScore = Math.floor(Math.random() * 20);
      let spamScore = Math.floor(Math.random() * 25);
      let violenceScore = Math.floor(Math.random() * 15);
      let hateSpeechScore = Math.floor(Math.random() * 20);

      // Adjust scores for obviously bad content
      if (content.includes('spam') || content.includes('!!!') || content.includes('$')) {
        spamScore = Math.floor(Math.random() * 30) + 70;
      }
      if (content.includes('hate') || content.includes('suck') || content.includes('[redacted]')) {
        toxicityScore = Math.floor(Math.random() * 20) + 80;
        hateSpeechScore = Math.floor(Math.random() * 20) + 75;
      }
      if (content.includes('offensive') || content.includes('violates')) {
        toxicityScore = Math.floor(Math.random() * 20) + 60;
      }

      const riskScore = Math.floor((toxicityScore + nsfwScore + spamScore + violenceScore + hateSpeechScore) / 5);

      // Determine status based on risk score
      let status, requiresReview, riskLevel;
      if (riskScore <= 30) {
        status = 'approved';
        requiresReview = false;
        riskLevel = 'safe';
      } else if (riskScore <= 50) {
        status = 'approved';
        requiresReview = false;
        riskLevel = 'low';
      } else if (riskScore <= 75) {
        status = 'pending';
        requiresReview = true;
        riskLevel = 'medium';
      } else if (riskScore <= 90) {
        status = 'flagged';
        requiresReview = true;
        riskLevel = 'high';
      } else {
        status = 'rejected';
        requiresReview = true;
        riskLevel = 'critical';
      }

      const itemId = uuidv4();
      const contentId = `${contentType}-${uuidv4().substring(0, 8)}`;

      const submittedTime = Date.now() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000);

      moderationItems.push({
        id: itemId,
        content_type: contentType,
        content_id: contentId,
        source_service: sourceService,
        user_id: userId,
        content_text: content,
        status: status,
        risk_score: riskScore,
        risk_level: riskLevel,
        toxicity_score: toxicityScore,
        nsfw_score: nsfwScore,
        spam_score: spamScore,
        violence_score: violenceScore,
        hate_speech_score: hateSpeechScore,
        ai_provider: ['claude', 'openai', 'local'][Math.floor(Math.random() * 3)],
        requires_review: requiresReview,
        submitted_at: submittedTime,
        created_at: new Date(),
        updated_at: new Date()
      });
    }

    await sequelize.query(`
      INSERT INTO moderation_items (
        id, content_type, content_id, source_service, user_id, content_text,
        status, risk_score, risk_level, toxicity_score, nsfw_score, spam_score,
        violence_score, hate_speech_score, ai_provider,
        requires_review, submitted_at, created_at, updated_at
      ) VALUES ${moderationItems.map((_, i) => `(
        $${i * 19 + 1}, $${i * 19 + 2}::content_type, $${i * 19 + 3}, $${i * 19 + 4}, $${i * 19 + 5}, $${i * 19 + 6},
        $${i * 19 + 7}::moderation_status, $${i * 19 + 8}, $${i * 19 + 9}::risk_level, $${i * 19 + 10}, $${i * 19 + 11},
        $${i * 19 + 12}, $${i * 19 + 13}, $${i * 19 + 14}, $${i * 19 + 15}::ai_provider,
        $${i * 19 + 16}, $${i * 19 + 17}, $${i * 19 + 18}, $${i * 19 + 19}
      )`).join(', ')}
    `, {
      bind: moderationItems.flatMap(item => [
        item.id, item.content_type, item.content_id, item.source_service, item.user_id, item.content_text,
        item.status, item.risk_score, item.risk_level, item.toxicity_score, item.nsfw_score, item.spam_score,
        item.violence_score, item.hate_speech_score, item.ai_provider,
        item.requires_review, item.submitted_at, item.created_at, item.updated_at
      ])
    });

    console.log(`✓ Created ${moderationItems.length} moderation items\n`);

    // Insert review queue items for pending items
    console.log('Creating review queue items...');
    const pendingItems = moderationItems.filter(item => item.requires_review && item.status === 'pending');
    const queueItems = [];

    for (const item of pendingItems) {
      const priority = item.risk_score;
      const escalated = item.risk_level === 'critical';

      queueItems.push({
        id: uuidv4(),
        moderation_item_id: item.id,
        priority: priority,
        escalated: escalated,
        status: 'pending',
        created_at: item.submitted_at,
        updated_at: new Date()
      });
    }

    if (queueItems.length > 0) {
      await sequelize.query(`
        INSERT INTO review_queue (
          id, moderation_item_id, priority, escalated, status, created_at, updated_at
        ) VALUES ${queueItems.map((_, i) => `(
          $${i * 7 + 1}, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}::report_status, $${i * 7 + 6}, $${i * 7 + 7}
        )`).join(', ')}
      `, {
        bind: queueItems.flatMap(item => [
          item.id, item.moderation_item_id, item.priority, item.escalated, item.status,
          item.created_at, item.updated_at
        ])
      });
    }

    console.log(`✓ Created ${queueItems.length} review queue items\n`);

    // Insert moderation actions for approved/rejected items
    console.log('Creating moderation actions...');
    const actionedItems = moderationItems.filter(item => item.status === 'approved' || item.status === 'rejected');
    const actions = [];

    for (const item of actionedItems) {
      const action = item.status === 'approved' ? 'approve' : 'reject';
      const moderatorId = moderatorIds[Math.floor(Math.random() * moderatorIds.length)];
      const automated = Math.random() > 0.3; // 70% automated

      actions.push({
        id: uuidv4(),
        moderation_item_id: item.id,
        action: action,
        content_type: item.content_type,
        content_id: item.content_id,
        source_service: item.source_service,
        performed_by: automated ? null : moderatorId,
        is_automated: automated,
        reason: automated ? 'Automatic moderation based on AI analysis' : 'Manual review decision',
        performed_at: item.submitted_at + Math.floor(Math.random() * 3600000),
        created_at: new Date()
      });
    }

    if (actions.length > 0) {
      await sequelize.query(`
        INSERT INTO moderation_actions (
          id, moderation_item_id, action, content_type, content_id, source_service,
          performed_by, is_automated, reason, performed_at, created_at
        ) VALUES ${actions.map((_, i) => `(
          $${i * 11 + 1}, $${i * 11 + 2}, $${i * 11 + 3}::moderation_action, $${i * 11 + 4}::content_type,
          $${i * 11 + 5}, $${i * 11 + 6}, $${i * 11 + 7}, $${i * 11 + 8}, $${i * 11 + 9},
          $${i * 11 + 10}, $${i * 11 + 11}
        )`).join(', ')}
      `, {
        bind: actions.flatMap(action => [
          action.id, action.moderation_item_id, action.action, action.content_type, action.content_id,
          action.source_service, action.performed_by, action.is_automated, action.reason,
          action.performed_at, action.created_at
        ])
      });
    }

    console.log(`✓ Created ${actions.length} moderation actions\n`);

    // Insert some moderation rules
    console.log('Creating moderation rules...');
    const rules = [
      {
        id: uuidv4(),
        name: 'Auto-approve safe content',
        description: 'Automatically approve content with low risk scores',
        applies_to: ['post', 'comment', 'message'],
        source_services: ['timeline', 'spark'],
        conditions: { max_risk_score: 30 },
        action: 'auto_approve',
        threshold_score: 30,
        enabled: true,
        priority: 100,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Flag spam content',
        description: 'Flag content with high spam scores for review',
        applies_to: ['post', 'comment'],
        source_services: ['timeline'],
        conditions: { min_spam_score: 70 },
        action: 'flag',
        threshold_score: 70,
        enabled: true,
        priority: 90,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        name: 'Block hate speech',
        description: 'Automatically reject content with high hate speech scores',
        applies_to: ['post', 'comment', 'message'],
        source_services: ['timeline', 'spark', 'nexus'],
        conditions: { min_hate_speech_score: 85 },
        action: 'reject',
        threshold_score: 85,
        enabled: true,
        priority: 95,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];

    await sequelize.query(`
      INSERT INTO moderation_rules (
        id, name, description, applies_to, source_services, conditions, action,
        threshold_score, enabled, priority, created_at, updated_at
      ) VALUES ${rules.map((_, i) => `(
        $${i * 12 + 1}, $${i * 12 + 2}, $${i * 12 + 3}, $${i * 12 + 4}::content_type[], $${i * 12 + 5}::varchar[],
        $${i * 12 + 6}::jsonb, $${i * 12 + 7}::moderation_action, $${i * 12 + 8}, $${i * 12 + 9}, $${i * 12 + 10},
        $${i * 12 + 11}, $${i * 12 + 12}
      )`).join(', ')}
    `, {
      bind: rules.flatMap(rule => [
        rule.id, rule.name, rule.description,
        `{${rule.applies_to.join(',')}}`,  // PostgreSQL array format
        `{${rule.source_services.join(',')}}`,  // PostgreSQL array format
        JSON.stringify(rule.conditions), rule.action, rule.threshold_score, rule.enabled, rule.priority,
        rule.created_at, rule.updated_at
      ])
    });

    console.log(`✓ Created ${rules.length} moderation rules\n`);

    // Summary statistics
    console.log('───────────────────────────────────────────────────────────');
    console.log('Summary:');
    console.log(`  Total Items: ${moderationItems.length}`);
    console.log(`  Pending Review: ${queueItems.length}`);
    console.log(`  Approved: ${moderationItems.filter(i => i.status === 'approved').length}`);
    console.log(`  Rejected: ${moderationItems.filter(i => i.status === 'rejected').length}`);
    console.log(`  Actions Logged: ${actions.length}`);
    console.log(`  Rules Created: ${rules.length}`);
    console.log('───────────────────────────────────────────────────────────\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('  Mock data seeding complete!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n✗ Error seeding data:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run script
seedMockData().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
