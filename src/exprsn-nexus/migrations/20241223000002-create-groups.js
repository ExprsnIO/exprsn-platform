'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('groups', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      slug: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      creator_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      visibility: {
        type: Sequelize.ENUM('public', 'private', 'unlisted'),
        defaultValue: 'public',
        allowNull: false
      },
      join_mode: {
        type: Sequelize.ENUM('open', 'request', 'invite'),
        defaultValue: 'request',
        allowNull: false
      },
      governance_model: {
        type: Sequelize.ENUM('centralized', 'decentralized', 'dao', 'consensus'),
        defaultValue: 'centralized',
        allowNull: false
      },
      governance_rules: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      avatar_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      banner_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      member_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      max_members: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      is_featured: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_verified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      location: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      latitude: {
        type: Sequelize.DECIMAL(10, 8),
        allowNull: true
      },
      longitude: {
        type: Sequelize.DECIMAL(11, 8),
        allowNull: true
      },
      website: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.BIGINT,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('groups', ['slug'], { unique: true });
    await queryInterface.addIndex('groups', ['creator_id']);
    await queryInterface.addIndex('groups', ['visibility']);
    await queryInterface.addIndex('groups', ['category']);
    await queryInterface.addIndex('groups', ['is_active']);
    await queryInterface.addIndex('groups', ['is_featured']);
    await queryInterface.addIndex('groups', ['created_at']);
    await queryInterface.addIndex('groups', ['tags'], { using: 'gin' });
    await queryInterface.addIndex('groups', ['metadata'], { using: 'gin' });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('groups');
  }
};
