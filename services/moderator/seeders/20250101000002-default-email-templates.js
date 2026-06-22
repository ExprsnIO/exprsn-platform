/**
 * ═══════════════════════════════════════════════════════════
 * Seeder: Default Email Templates
 * Creates default email templates for moderation notifications
 * ═══════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const now = new Date();

    const templates = [
      {
        id: uuidv4(),
        name: 'Content Approved',
        type: 'content_approved',
        subject: 'Your content has been approved',
        body_text: `Hello,

Your {{contentType}} (ID: {{contentId}}) has been approved by our moderation team.

Thank you for following our community guidelines!

Date: {{date}}

Best regards,
Exprsn Moderation Team`,
        body_html: null,
        variables: JSON.stringify(['contentType', 'contentId', 'date']),
        enabled: true,
        is_default: true,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        name: 'Content Rejected',
        type: 'content_rejected',
        subject: 'Your content was not approved',
        body_text: `Hello,

Your {{contentType}} (ID: {{contentId}}) was not approved for the following reason:

{{reason}}

Please review our community guidelines and feel free to submit content that adheres to our policies.

Date: {{date}}

Best regards,
Exprsn Moderation Team`,
        body_html: null,
        variables: JSON.stringify(['contentType', 'contentId', 'reason', 'date']),
        enabled: true,
        is_default: true,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        name: 'User Warning',
        type: 'user_warned',
        subject: 'Community Guidelines Warning',
        body_text: `Hello,

You have received a warning for the following reason:

{{reason}}

Please review our community guidelines to avoid future violations. Repeated violations may result in account suspension or termination.

Date: {{date}}

Best regards,
Exprsn Moderation Team`,
        body_html: null,
        variables: JSON.stringify(['reason', 'date', 'relatedContent']),
        enabled: true,
        is_default: true,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        name: 'User Suspended',
        type: 'user_suspended',
        subject: 'Account Suspended',
        body_text: `Hello,

Your account has been temporarily suspended for the following reason:

{{reason}}

Suspension duration: {{duration}}
Your account will be automatically reinstated on: {{expiresAt}}

If you believe this action was taken in error, you may submit an appeal through your account dashboard.

Date: {{date}}

Best regards,
Exprsn Moderation Team`,
        body_html: null,
        variables: JSON.stringify(['reason', 'duration', 'expiresAt', 'date']),
        enabled: true,
        is_default: true,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        name: 'User Banned',
        type: 'user_banned',
        subject: 'Account Permanently Banned',
        body_text: `Hello,

Your account has been permanently banned for the following reason:

{{reason}}

This decision is final. You will no longer be able to access this platform.

If you believe this action was taken in error, please contact support@exprsn.com with your account details.

Date: {{date}}

Best regards,
Exprsn Moderation Team`,
        body_html: null,
        variables: JSON.stringify(['reason', 'date']),
        enabled: true,
        is_default: true,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        name: 'Appeal Received',
        type: 'appeal_received',
        subject: 'Your appeal has been received',
        body_text: `Hello,

We have received your appeal (ID: {{appealId}}) and our team will review it shortly.

You will receive a response within 3-5 business days.

Date: {{date}}

Best regards,
Exprsn Moderation Team`,
        body_html: null,
        variables: JSON.stringify(['appealId', 'date']),
        enabled: true,
        is_default: true,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        name: 'Appeal Approved',
        type: 'appeal_approved',
        subject: 'Your appeal has been approved',
        body_text: `Hello,

Good news! Your appeal (ID: {{appealId}}) has been approved.

Decision: {{decision}}

The moderation action has been reversed and your account status has been restored.

Date: {{date}}

Best regards,
Exprsn Moderation Team`,
        body_html: null,
        variables: JSON.stringify(['appealId', 'decision', 'date']),
        enabled: true,
        is_default: true,
        created_at: now,
        updated_at: now
      },
      {
        id: uuidv4(),
        name: 'Appeal Denied',
        type: 'appeal_denied',
        subject: 'Your appeal has been denied',
        body_text: `Hello,

After careful review, your appeal (ID: {{appealId}}) has been denied.

Reason: {{reason}}

The original moderation decision stands.

Date: {{date}}

Best regards,
Exprsn Moderation Team`,
        body_html: null,
        variables: JSON.stringify(['appealId', 'reason', 'date']),
        enabled: true,
        is_default: true,
        created_at: now,
        updated_at: now
      }
    ];

    await queryInterface.bulkInsert('email_templates', templates);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('email_templates', null, {});
  }
};
