const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Generate demo user IDs
    const demoUserId = uuidv4();
    const demoOrgId = uuidv4();

    // Note: In production, these would reference actual users from the auth service
    // This is just sample data for development/testing

    await queryInterface.bulkInsert('payment_configurations', [
      {
        id: uuidv4(),
        user_id: demoUserId,
        organization_id: null,
        provider: 'stripe',
        is_active: true,
        is_primary: true,
        credentials: JSON.stringify({
          testSecretKey: 'sk_test_demo_key',
          testPublishableKey: 'pk_test_demo_key'
        }),
        webhook_secret: 'whsec_demo_secret',
        settings: JSON.stringify({
          automaticPaymentMethods: true,
          captureMethod: 'automatic'
        }),
        test_mode: true,
        metadata: JSON.stringify({
          createdBy: 'seeder',
          purpose: 'demo'
        }),
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: uuidv4(),
        user_id: null,
        organization_id: demoOrgId,
        provider: 'paypal',
        is_active: true,
        is_primary: true,
        credentials: JSON.stringify({
          clientId: 'demo_client_id',
          clientSecret: 'demo_client_secret'
        }),
        webhook_secret: null,
        settings: JSON.stringify({
          brandName: 'Demo Organization',
          landingPage: 'BILLING'
        }),
        test_mode: true,
        metadata: JSON.stringify({
          createdBy: 'seeder',
          purpose: 'demo'
        }),
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});

    console.log('Demo payment configurations seeded');
    console.log(`Demo User ID: ${demoUserId}`);
    console.log(`Demo Org ID: ${demoOrgId}`);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('payment_configurations', null, {});
  }
};
