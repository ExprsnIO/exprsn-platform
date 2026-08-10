/**
 * ═══════════════════════════════════════════════════════════════════════
 * Moderator Service Seeder - Content moderation, reports, reviews
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.MODERATOR_DB_NAME || 'exprsn_moderator',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

async function seed() {
  const startTime = Date.now();
  let recordsCreated = 0;
  const client = await pool.connect();

  try {
    console.log('  Connected to exprsn_moderator database');

    // Sample user IDs
    const sampleUserIds = Array.from({ length: 10 }, () => uuidv4());
    const moderatorIds = [sampleUserIds[0], sampleUserIds[1]];

    // ═══════════════════════════════════════════════════════════════════
    // 1. Create Moderation Items
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating moderation items...');

    const contentTypes = ['post', 'comment', 'message', 'profile', 'image'];
    const riskLevels = ['safe', 'low', 'medium', 'high', 'critical'];
    const statuses = ['pending', 'approved', 'rejected', 'flagged'];
    const actions = ['none', 'warn', 'remove', 'ban_user', 'escalate'];

    const sampleTexts = [
      'This is a perfectly normal post about technology.',
      'Check out this awesome photo I took!',
      'Can anyone help me with this programming question?',
      'This product is terrible, worst purchase ever!',
      'Looking forward to the weekend!',
      'Does anyone know a good restaurant nearby?',
      'Thanks for the helpful advice!',
      'I strongly disagree with this opinion.',
      'Here are my vacation photos!',
      'What an amazing experience that was!'
    ];

    for (let i = 0; i < 150; i++) {
      const riskScore = Math.floor(Math.random() * 100);
      const riskLevel = riskScore < 20 ? 'safe' : riskScore < 40 ? 'low' : riskScore < 60 ? 'medium' : riskScore < 80 ? 'high' : 'critical';
      const requiresReview = riskLevel === 'high' || riskLevel === 'critical' || Math.random() > 0.7;
      const status = requiresReview ? 'pending' : (Math.random() > 0.2 ? 'approved' : 'rejected');

      const result = await client.query(`
        INSERT INTO moderation_items (
          content_type, content_id, source_service, user_id, content_text, content_url,
          content_metadata, risk_score, risk_level, toxicity_score, nsfw_score,
          spam_score, violence_score, hate_speech_score, ai_provider, ai_model,
          ai_response, status, action, requires_review, reviewed_by, reviewed_at,
          submitted_at, processed_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW())
        RETURNING id
      `, [
        contentTypes[Math.floor(Math.random() * contentTypes.length)],
        uuidv4(),
        'exprsn-timeline',
        sampleUserIds[Math.floor(Math.random() * sampleUserIds.length)],
        sampleTexts[Math.floor(Math.random() * sampleTexts.length)],
        Math.random() > 0.5 ? `https://example.com/content/${uuidv4()}` : null,
        JSON.stringify({ language: 'en', wordCount: Math.floor(Math.random() * 100) + 10 }),
        riskScore,
        riskLevel,
        Math.floor(Math.random() * 100),
        Math.floor(Math.random() * 100),
        Math.floor(Math.random() * 100),
        Math.floor(Math.random() * 100),
        Math.floor(Math.random() * 100),
        ['claude', 'openai', 'local'][Math.floor(Math.random() * 3)],
        'claude-3-sonnet-20240229',
        JSON.stringify({ classification: riskLevel, confidence: Math.random() }),
        status,
        status === 'approved' ? 'none' : status === 'rejected' ? actions[Math.floor(Math.random() * actions.length)] : null,
        requiresReview,
        status !== 'pending' ? moderatorIds[Math.floor(Math.random() * moderatorIds.length)] : null,
        status !== 'pending' ? new Date(Date.now() - Math.random() * 5 * 24 * 60 * 60 * 1000) : null,
        new Date(Date.now() - Math.random() * 10 * 24 * 60 * 60 * 1000),
        new Date(Date.now() - Math.random() * 9 * 24 * 60 * 60 * 1000)
      ]);

      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 2. Create Reports
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating user reports...');

    const reportReasons = ['spam', 'harassment', 'hate_speech', 'violence', 'nsfw', 'misinformation', 'other'];

    for (let i = 0; i < 80; i++) {
      const status = ['pending', 'investigating', 'resolved', 'dismissed'][Math.floor(Math.random() * 4)];
      const resolved = status === 'resolved' || status === 'dismissed';

      await client.query(`
        INSERT INTO reports (
          content_type, content_id, source_service, reported_by, reason, details,
          status, assigned_to, assigned_at, resolved_by, resolved_at, resolution_notes,
          action_taken, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      `, [
        contentTypes[Math.floor(Math.random() * contentTypes.length)],
        uuidv4(),
        'exprsn-timeline',
        sampleUserIds[Math.floor(Math.random() * sampleUserIds.length)],
        reportReasons[Math.floor(Math.random() * reportReasons.length)],
        'User reported this content as inappropriate',
        status,
        status !== 'pending' ? moderatorIds[Math.floor(Math.random() * moderatorIds.length)] : null,
        status !== 'pending' ? new Date(Date.now() - Math.random() * 3 * 24 * 60 * 60 * 1000) : null,
        resolved ? moderatorIds[Math.floor(Math.random() * moderatorIds.length)] : null,
        resolved ? new Date(Date.now() - Math.random() * 1 * 24 * 60 * 60 * 1000) : null,
        resolved ? 'Report reviewed and action taken' : null,
        resolved ? actions[Math.floor(Math.random() * actions.length)] : null
      ]);

      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 3. Create User Actions
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating user moderation actions...');

    const actionTypes = ['warning', 'mute', 'suspend', 'ban', 'content_removal'];

    for (let i = 0; i < 40; i++) {
      const actionType = actionTypes[Math.floor(Math.random() * actionTypes.length)];
      const durationSeconds = actionType === 'ban' ? null : Math.floor(Math.random() * 30) * 24 * 60 * 60;
      const active = Math.random() > 0.3;

      await client.query(`
        INSERT INTO user_actions (
          user_id, action_type, reason, duration_seconds, expires_at, performed_by,
          related_content_id, active, performed_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      `, [
        sampleUserIds[Math.floor(Math.random() * sampleUserIds.length)],
        actionType,
        'Violation of community guidelines',
        durationSeconds,
        durationSeconds ? new Date(Date.now() + durationSeconds * 1000) : null,
        moderatorIds[Math.floor(Math.random() * moderatorIds.length)],
        Math.random() > 0.5 ? uuidv4() : null,
        active,
        new Date(Date.now() - Math.random() * 15 * 24 * 60 * 60 * 1000)
      ]);

      recordsCreated++;
    }

    // ═══════════════════════════════════════════════════════════════════
    // 4. Create Moderation Actions Log
    // ═══════════════════════════════════════════════════════════════════
    console.log('  Creating moderation action logs...');

    for (let i = 0; i < 100; i++) {
      await client.query(`
        INSERT INTO moderation_actions (
          action, content_type, content_id, source_service, performed_by, is_automated,
          reason, metadata, performed_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      `, [
        actions[Math.floor(Math.random() * actions.length)],
        contentTypes[Math.floor(Math.random() * contentTypes.length)],
        uuidv4(),
        'exprsn-timeline',
        Math.random() > 0.3 ? moderatorIds[Math.floor(Math.random() * moderatorIds.length)] : null,
        Math.random() > 0.3,
        'Automated moderation action',
        JSON.stringify({ confidence: Math.random(), source: 'ai' }),
        new Date(Date.now() - Math.random() * 20 * 24 * 60 * 60 * 1000)
      ]);

      recordsCreated++;
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    return {
      recordsCreated,
      duration,
      summary: {
        moderationItems: 150,
        reports: 80,
        userActions: 40,
        actionLogs: 100
      }
    };

  } catch (error) {
    console.error('  Error seeding Moderator:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed()
    .then(result => {
      console.log(`\nModerator seeded: ${result.recordsCreated} records in ${result.duration}s`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Failed to seed Moderator:', error);
      process.exit(1);
    });
}

module.exports = { seed };
