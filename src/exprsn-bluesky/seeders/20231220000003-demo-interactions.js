const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Get repositories and posts
    const repositories = await queryInterface.sequelize.query(
      'SELECT id, did FROM repositories ORDER BY created_at LIMIT 10',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const posts = await queryInterface.sequelize.query(
      `SELECT id, repository_id, uri, collection, rkey, cid
       FROM records
       WHERE collection = 'io.exprsn.timeline.post'
       ORDER BY created_at DESC
       LIMIT 20`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (repositories.length === 0 || posts.length === 0) {
      console.log('No repositories or posts found. Run previous seeders first.');
      return;
    }

    const now = new Date();
    const records = [];

    // Helper to create CID
    const generateCID = () => `bafyreig${crypto.randomBytes(16).toString('hex')}`;

    // Helper to create record
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
        indexed_at: new Date(now.getTime() - Math.random() * 5 * 24 * 60 * 60 * 1000),
        created_at: new Date(now.getTime() - Math.random() * 5 * 24 * 60 * 60 * 1000),
        updated_at: now
      };
    };

    // 1. Create likes
    // Each post gets 2-5 likes from different users
    posts.forEach((post, postIndex) => {
      const numLikes = 2 + Math.floor(Math.random() * 4); // 2-5 likes
      const likedBy = new Set();

      for (let i = 0; i < numLikes; i++) {
        let repoIndex = Math.floor(Math.random() * repositories.length);

        // Don't like own post, and don't duplicate likes
        while (repositories[repoIndex].id === post.repository_id || likedBy.has(repoIndex)) {
          repoIndex = (repoIndex + 1) % repositories.length;
        }
        likedBy.add(repoIndex);

        const repo = repositories[repoIndex];
        const postUri = post.uri; // Use the URI from the post record

        records.push(createRecord(repo, 'io.exprsn.timeline.like', `like_${postIndex}_${i}`, {
          $type: 'io.exprsn.timeline.like',
          subject: {
            uri: postUri,
            cid: post.cid
          },
          createdAt: new Date(now.getTime() - Math.random() * 4 * 24 * 60 * 60 * 1000).toISOString()
        }));
      }
    });

    // 2. Create reposts
    // Some posts get 1-3 reposts
    const repostablePosts = posts.slice(0, 10); // First 10 posts get reposts
    repostablePosts.forEach((post, postIndex) => {
      const numReposts = 1 + Math.floor(Math.random() * 3); // 1-3 reposts
      const repostedBy = new Set();

      for (let i = 0; i < numReposts; i++) {
        let repoIndex = Math.floor(Math.random() * repositories.length);

        // Don't repost own post, and don't duplicate reposts
        while (repositories[repoIndex].id === post.repository_id || repostedBy.has(repoIndex)) {
          repoIndex = (repoIndex + 1) % repositories.length;
        }
        repostedBy.add(repoIndex);

        const repo = repositories[repoIndex];
        const postUri = post.uri; // Use the URI from the post record

        records.push(createRecord(repo, 'io.exprsn.timeline.repost', `repost_${postIndex}_${i}`, {
          $type: 'io.exprsn.timeline.repost',
          subject: {
            uri: postUri,
            cid: post.cid
          },
          createdAt: new Date(now.getTime() - Math.random() * 3 * 24 * 60 * 60 * 1000).toISOString()
        }));
      }
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

    console.log(`✓ Created ${records.length} likes and reposts (interactions)`);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('records', {
      collection: { [Sequelize.Op.in]: ['io.exprsn.timeline.like', 'io.exprsn.timeline.repost'] }
    }, {});
  }
};
