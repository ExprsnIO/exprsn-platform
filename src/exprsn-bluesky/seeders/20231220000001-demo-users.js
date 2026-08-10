const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const now = new Date();

    // Generate keypairs for users
    const generateKeyPair = () => {
      return new Promise((resolve, reject) => {
        crypto.generateKeyPair('rsa', {
          modulusLength: 2048,
          publicKeyEncoding: { type: 'spki', format: 'pem' },
          privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        }, (err, publicKey, privateKey) => {
          if (err) reject(err);
          else resolve({ publicKey, privateKey });
        });
      });
    };

    const users = [];
    const usernames = [
      'alice_dev', 'bob_designer', 'charlie_pm', 'diana_writer',
      'ethan_artist', 'fiona_musician', 'george_chef', 'hannah_photographer',
      'isaac_scientist', 'julia_teacher'
    ];

    const displayNames = [
      'Alice Anderson', 'Bob Brown', 'Charlie Chen', 'Diana Davis',
      'Ethan Evans', 'Fiona Foster', 'George Garcia', 'Hannah Hill',
      'Isaac Ivanov', 'Julia Johnson'
    ];

    const descriptions = [
      'Full-stack developer | Coffee enthusiast ☕',
      'UI/UX Designer | Making the web beautiful 🎨',
      'Product Manager | Building great experiences',
      'Content Writer | Telling stories through words ✍️',
      'Digital Artist | Creating worlds 🖌️',
      'Musician & Composer | Music is life 🎵',
      'Chef & Food Blogger | Cooking with passion 👨‍🍳',
      'Photographer | Capturing moments 📸',
      'Research Scientist | Exploring the universe 🔬',
      'High School Teacher | Inspiring young minds 📚'
    ];

    for (let i = 0; i < usernames.length; i++) {
      const { publicKey, privateKey } = await generateKeyPair();
      const did = `did:web:exprsn.io:${usernames[i]}`;
      const handle = `${usernames[i]}.exprsn.io`;

      users.push({
        id: uuidv4(),
        did,
        handle,
        exprsn_user_id: uuidv4(), // Generate UUID for exprsn_user_id
        email: `${usernames[i]}@exprsn.io`,
        display_name: displayNames[i],
        description: descriptions[i],
        public_key: publicKey,
        private_key: Buffer.from(privateKey).toString('base64'), // Simple encoding for demo
        status: 'active',
        is_verified: i < 5, // First 5 users are verified
        created_at: now,
        updated_at: now
      });
    }

    await queryInterface.bulkInsert('accounts', users);

    // Create repositories for each user
    const repositories = users.map(user => ({
      id: uuidv4(),
      account_id: user.id,
      did: user.did,
      head: null,
      rev: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      commit_count: 0,
      record_count: 0,
      blob_count: 0,
      total_size: 0,
      created_at: now,
      updated_at: now
    }));

    await queryInterface.bulkInsert('repositories', repositories);

    console.log(`✓ Created ${users.length} demo users`);
    return { users, repositories };
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('repositories', null, {});
    await queryInterface.bulkDelete('accounts', null, {});
  }
};
