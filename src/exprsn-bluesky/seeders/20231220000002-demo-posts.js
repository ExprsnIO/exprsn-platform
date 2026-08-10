const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Get users
    const accounts = await queryInterface.sequelize.query(
      'SELECT id, did FROM accounts ORDER BY created_at LIMIT 10',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const repositories = await queryInterface.sequelize.query(
      'SELECT id, account_id, did FROM repositories ORDER BY created_at LIMIT 10',
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    if (accounts.length === 0) {
      console.log('No accounts found. Run user seeder first.');
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
        indexed_at: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        created_at: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random time in last week
        updated_at: now
      };
    };

    // 1. Simple text posts
    const textPosts = [
      'Just deployed my first AT Protocol app! 🚀 This is amazing!',
      'Beautiful sunset today. Nature never disappoints. 🌅',
      'Coffee and code - the perfect combination for a productive morning ☕💻',
      'Excited to announce I\'m starting a new project! More details coming soon...',
      'The best code is no code at all. - Every developer eventually',
      'Just finished reading an amazing book on distributed systems. Mind = blown 🤯',
      'Weekend plans: hiking, photography, and maybe some stargazing 🌟',
      'Pro tip: Take breaks. Your code will still be there when you get back.',
      'Cooking experiment today: fusion tacos! 🌮 Will report back...',
      'Music recommendation: Check out this new album I discovered 🎵'
    ];

    textPosts.forEach((text, i) => {
      const repo = repositories[i % repositories.length];
      records.push(createRecord(repo, 'io.exprsn.timeline.post', `post_text_${i}`, {
        $type: 'io.exprsn.timeline.post',
        text,
        visibility: 'public',
        createdAt: new Date(now.getTime() - (i * 60 * 60 * 1000)).toISOString()
      }));
    });

    // 2. Posts with images (mock data - in real system would have actual blobs)
    const imagePosts = [
      {
        text: 'Check out this amazing view from my morning hike! 🏔️',
        images: [
          { alt: 'Mountain landscape at sunrise', width: 1920, height: 1080 }
        ]
      },
      {
        text: 'My latest artwork - what do you think? 🎨',
        images: [
          { alt: 'Digital art: abstract composition', width: 1080, height: 1080 }
        ]
      },
      {
        text: 'Food photography from today\'s cooking adventure 🍽️',
        images: [
          { alt: 'Beautifully plated pasta dish', width: 1600, height: 1200 }
        ]
      },
      {
        text: 'Some shots from today\'s photoshoot 📸',
        images: [
          { alt: 'Portrait in golden hour', width: 1440, height: 1920 },
          { alt: 'Urban architecture', width: 1920, height: 1440 }
        ]
      }
    ];

    imagePosts.forEach((post, i) => {
      const repo = repositories[(i + 2) % repositories.length];
      const images = post.images.map(img => ({
        image: {
          $type: 'blob',
          ref: { $link: generateCID() },
          mimeType: 'image/jpeg',
          size: 1024000 + Math.random() * 2048000
        },
        alt: img.alt,
        aspectRatio: { width: img.width, height: img.height }
      }));

      records.push(createRecord(repo, 'io.exprsn.timeline.post', `post_image_${i}`, {
        $type: 'io.exprsn.timeline.post',
        text: post.text,
        embed: {
          $type: 'io.exprsn.timeline.embed#images',
          images
        },
        visibility: 'public',
        createdAt: new Date(now.getTime() - ((i + 15) * 60 * 60 * 1000)).toISOString()
      }));
    });

    // 3. Posts with external links
    const linkPosts = [
      {
        text: 'Great article on the future of decentralized social networks',
        uri: 'https://example.com/decentralized-social',
        title: 'The Future of Decentralized Social Networks',
        description: 'Exploring how AT Protocol is changing the landscape of social media'
      },
      {
        text: 'This tutorial helped me finally understand lexicons!',
        uri: 'https://example.com/atproto-lexicons',
        title: 'Understanding AT Protocol Lexicons',
        description: 'A comprehensive guide to creating and using lexicons'
      },
      {
        text: 'Beautiful design inspiration for your next project',
        uri: 'https://example.com/design-inspiration',
        title: '50 Stunning UI Designs',
        description: 'A curated collection of beautiful user interfaces'
      }
    ];

    linkPosts.forEach((post, i) => {
      const repo = repositories[(i + 4) % repositories.length];
      records.push(createRecord(repo, 'io.exprsn.timeline.post', `post_link_${i}`, {
        $type: 'io.exprsn.timeline.post',
        text: post.text,
        embed: {
          $type: 'io.exprsn.timeline.embed#external',
          uri: post.uri,
          title: post.title,
          description: post.description
        },
        visibility: 'public',
        createdAt: new Date(now.getTime() - ((i + 25) * 60 * 60 * 1000)).toISOString()
      }));
    });

    // 4. Video posts (mock)
    const videoPosts = [
      'Quick tutorial on AT Protocol basics 🎥',
      'My travel vlog from last weekend 🎬',
      'Cooking demo: Perfect pasta carbonara 👨‍🍳'
    ];

    videoPosts.forEach((text, i) => {
      const repo = repositories[(i + 6) % repositories.length];
      records.push(createRecord(repo, 'io.exprsn.timeline.post', `post_video_${i}`, {
        $type: 'io.exprsn.timeline.post',
        text,
        embed: {
          $type: 'io.exprsn.timeline.embed#video',
          video: {
            $type: 'blob',
            ref: { $link: generateCID() },
            mimeType: 'video/mp4',
            size: 15000000 + Math.random() * 30000000
          },
          aspectRatio: { width: 1920, height: 1080 }
        },
        visibility: 'public',
        createdAt: new Date(now.getTime() - ((i + 35) * 60 * 60 * 1000)).toISOString()
      }));
    });

    // 5. Reply posts (threaded conversations)
    const rootPost = records[0]; // First text post
    if (rootPost) {
      const rootRef = { uri: rootPost.uri, cid: rootPost.cid };

      // First reply
      const repo1 = repositories[1];
      const reply1 = createRecord(repo1, 'io.exprsn.timeline.post', 'reply_1', {
        $type: 'io.exprsn.timeline.post',
        text: 'Congratulations! Can\'t wait to try it out!',
        reply: {
          root: rootRef,
          parent: rootRef
        },
        visibility: 'public',
        createdAt: new Date(now.getTime() - 40 * 60 * 60 * 1000).toISOString()
      });
      records.push(reply1);

      // Reply to reply
      const repo2 = repositories[2];
      const reply2 = createRecord(repo2, 'io.exprsn.timeline.post', 'reply_2', {
        $type: 'io.exprsn.timeline.post',
        text: 'Same here! This is the future of social media.',
        reply: {
          root: rootRef,
          parent: { uri: reply1.uri, cid: reply1.cid }
        },
        visibility: 'public',
        createdAt: new Date(now.getTime() - 38 * 60 * 60 * 1000).toISOString()
      });
      records.push(reply2);
    }

    // 6. Posts with tags
    const taggedPosts = [
      { text: 'Learning #atprotocol and loving it! #decentralized #opensource', tags: ['atprotocol', 'decentralized', 'opensource'] },
      { text: 'New #photography series coming soon! #art #creative', tags: ['photography', 'art', 'creative'] },
      { text: '#cooking #foodie adventures continue! 🍝', tags: ['cooking', 'foodie'] }
    ];

    taggedPosts.forEach((post, i) => {
      const repo = repositories[(i + 7) % repositories.length];
      records.push(createRecord(repo, 'io.exprsn.timeline.post', `post_tagged_${i}`, {
        $type: 'io.exprsn.timeline.post',
        text: post.text,
        tags: post.tags,
        visibility: 'public',
        createdAt: new Date(now.getTime() - ((i + 50) * 60 * 60 * 1000)).toISOString()
      }));
    });

    // 7. Posts with mentions (facets)
    const mentionPosts = [
      'Great collaboration with @bob_designer on this project!',
      'Thanks @alice_dev for the code review! 🙏',
      'Shoutout to @charlie_pm for keeping us on track!'
    ];

    mentionPosts.forEach((text, i) => {
      const repo = repositories[i % repositories.length];
      // In real implementation, facets would have proper byte ranges and DID references
      const facets = [{
        index: { byteStart: text.indexOf('@'), byteEnd: text.indexOf('@') + text.split('@')[1].split(' ')[0].length + 1 },
        features: [{
          $type: 'app.bsky.richtext.facet#mention',
          did: accounts[(i + 1) % accounts.length].did
        }]
      }];

      records.push(createRecord(repo, 'io.exprsn.timeline.post', `post_mention_${i}`, {
        $type: 'io.exprsn.timeline.post',
        text,
        facets,
        visibility: 'public',
        createdAt: new Date(now.getTime() - ((i + 60) * 60 * 60 * 1000)).toISOString()
      }));
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
            record_count = ${repoRecords.length},
            commit_count = ${repoRecords.length},
            updated_at = NOW()
          WHERE id = '${repo.id}'`
        );
      }
    }

    console.log(`✓ Created ${records.length} demo posts with various types`);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('records', {
      collection: 'io.exprsn.timeline.post'
    }, {});
  }
};
