/**
 * ═══════════════════════════════════════════════════════════
 * Test Factories
 * Create test data for models
 * ═══════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Create a test user
 */
function createUser(overrides = {}) {
  return {
    id: uuidv4(),
    username: `user_${Date.now()}`,
    email: `user_${Date.now()}@example.com`,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

/**
 * Create a test post
 */
function createPost(overrides = {}) {
  return {
    id: uuidv4(),
    userId: overrides.userId || uuidv4(),
    content: overrides.content || 'Test post content',
    contentType: 'text',
    visibility: 'public',
    status: 'published',
    hashtags: overrides.hashtags || [],
    mentions: overrides.mentions || [],
    urls: overrides.urls || [],
    likeCount: 0,
    repostCount: 0,
    replyCount: 0,
    viewCount: 0,
    engagementScore: 0,
    deleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    publishedAt: new Date(),
    ...overrides
  };
}

/**
 * Create a test like
 */
function createLike(overrides = {}) {
  return {
    id: uuidv4(),
    userId: overrides.userId || uuidv4(),
    postId: overrides.postId || uuidv4(),
    createdAt: new Date(),
    ...overrides
  };
}

/**
 * Create a test follow
 */
function createFollow(overrides = {}) {
  return {
    id: uuidv4(),
    followerId: overrides.followerId || uuidv4(),
    followingId: overrides.followingId || uuidv4(),
    createdAt: new Date(),
    ...overrides
  };
}

/**
 * Create a test repost
 */
function createRepost(overrides = {}) {
  return {
    id: uuidv4(),
    userId: overrides.userId || uuidv4(),
    postId: overrides.postId || uuidv4(),
    originalPostId: overrides.originalPostId || uuidv4(),
    createdAt: new Date(),
    ...overrides
  };
}

/**
 * Create a test bookmark
 */
function createBookmark(overrides = {}) {
  return {
    id: uuidv4(),
    userId: overrides.userId || uuidv4(),
    postId: overrides.postId || uuidv4(),
    createdAt: new Date(),
    ...overrides
  };
}

/**
 * Create a test list
 */
function createList(overrides = {}) {
  return {
    id: uuidv4(),
    userId: overrides.userId || uuidv4(),
    name: overrides.name || 'Test List',
    description: overrides.description || 'Test list description',
    visibility: 'public',
    memberCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
}

/**
 * Create multiple posts
 */
function createPosts(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) =>
    createPost({
      content: `Test post ${i + 1}`,
      createdAt: new Date(Date.now() - i * 1000), // Stagger timestamps
      ...overrides
    })
  );
}

/**
 * Create a post with engagement
 */
function createPopularPost(overrides = {}) {
  return createPost({
    likeCount: 100,
    repostCount: 50,
    replyCount: 25,
    viewCount: 1000,
    engagementScore: 175,
    ...overrides
  });
}

/**
 * Create a thread of posts (reply chain)
 */
function createThread(length = 3, overrides = {}) {
  const posts = [];
  let previousPostId = null;

  for (let i = 0; i < length; i++) {
    const post = createPost({
      content: `Thread post ${i + 1}`,
      replyToPostId: previousPostId,
      createdAt: new Date(Date.now() - (length - i) * 1000),
      ...overrides
    });
    posts.push(post);
    previousPostId = post.id;
  }

  return posts;
}

module.exports = {
  createUser,
  createPost,
  createLike,
  createFollow,
  createRepost,
  createBookmark,
  createList,
  createPosts,
  createPopularPost,
  createThread
};
