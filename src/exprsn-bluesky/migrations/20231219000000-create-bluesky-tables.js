module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Accounts table
    await queryInterface.createTable('accounts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      did: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      handle: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      exprsn_user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      display_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      avatar_cid: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      banner_cid: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      private_key: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      public_key: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      recovery_key: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'suspended', 'deleted'),
        defaultValue: 'active'
      },
      is_verified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      last_seen_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('accounts', ['did'], { unique: true });
    await queryInterface.addIndex('accounts', ['handle'], { unique: true });
    await queryInterface.addIndex('accounts', ['exprsn_user_id']);
    await queryInterface.addIndex('accounts', ['email'], { unique: true });
    await queryInterface.addIndex('accounts', ['status']);
    await queryInterface.addIndex('accounts', ['created_at']);

    // Repositories table
    await queryInterface.createTable('repositories', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'accounts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      did: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      head: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      rev: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      commit_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      record_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      blob_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      total_size: {
        type: Sequelize.BIGINT,
        defaultValue: 0
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('repositories', ['account_id'], { unique: true });
    await queryInterface.addIndex('repositories', ['did'], { unique: true });
    await queryInterface.addIndex('repositories', ['created_at']);

    // Records table
    await queryInterface.createTable('records', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'repositories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      uri: {
        type: Sequelize.STRING(512),
        allowNull: false,
        unique: true
      },
      cid: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      collection: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      rkey: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      value: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      indexed_at: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      exprsn_post_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      exprsn_message_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('records', ['repository_id']);
    await queryInterface.addIndex('records', ['uri'], { unique: true });
    await queryInterface.addIndex('records', ['cid']);
    await queryInterface.addIndex('records', ['collection']);
    await queryInterface.addIndex('records', ['rkey']);
    await queryInterface.addIndex('records', ['indexed_at']);
    await queryInterface.addIndex('records', ['exprsn_post_id']);
    await queryInterface.addIndex('records', ['exprsn_message_id']);
    await queryInterface.addIndex('records', ['repository_id', 'collection']);

    // Blobs table
    await queryInterface.createTable('blobs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'repositories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      cid: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      mime_type: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      size: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      exprsn_file_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      storage_type: {
        type: Sequelize.ENUM('filevault', 'local', 's3', 'ipfs'),
        defaultValue: 'filevault'
      },
      storage_path: {
        type: Sequelize.STRING(512),
        allowNull: true
      },
      width: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      height: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      alt_text: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('blobs', ['repository_id']);
    await queryInterface.addIndex('blobs', ['cid'], { unique: true });
    await queryInterface.addIndex('blobs', ['mime_type']);
    await queryInterface.addIndex('blobs', ['exprsn_file_id']);
    await queryInterface.addIndex('blobs', ['storage_type']);
    await queryInterface.addIndex('blobs', ['created_at']);

    // Subscriptions table
    await queryInterface.createTable('subscriptions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'accounts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      subject_did: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      subject_handle: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      type: {
        type: Sequelize.ENUM('follow', 'mute', 'block'),
        defaultValue: 'follow'
      },
      uri: {
        type: Sequelize.STRING(512),
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'pending', 'removed'),
        defaultValue: 'active'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('subscriptions', ['account_id']);
    await queryInterface.addIndex('subscriptions', ['subject_did']);
    await queryInterface.addIndex('subscriptions', ['type']);
    await queryInterface.addIndex('subscriptions', ['status']);
    await queryInterface.addIndex('subscriptions', ['account_id', 'subject_did', 'type'], { unique: true });

    // Events table
    await queryInterface.createTable('events', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'accounts', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      seq: {
        type: Sequelize.BIGINT,
        allowNull: false,
        unique: true
      },
      did: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      event_type: {
        type: Sequelize.ENUM('commit', 'identity', 'account', 'handle'),
        allowNull: false
      },
      operation: {
        type: Sequelize.ENUM('create', 'update', 'delete'),
        allowNull: true
      },
      collection: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      rkey: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      record: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      cid: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      rev: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      time: {
        type: Sequelize.DATE,
        defaultValue: Sequelize.NOW
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('events', ['seq'], { unique: true });
    await queryInterface.addIndex('events', ['account_id']);
    await queryInterface.addIndex('events', ['did']);
    await queryInterface.addIndex('events', ['event_type']);
    await queryInterface.addIndex('events', ['operation']);
    await queryInterface.addIndex('events', ['collection']);
    await queryInterface.addIndex('events', ['time']);
    await queryInterface.addIndex('events', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('events');
    await queryInterface.dropTable('subscriptions');
    await queryInterface.dropTable('blobs');
    await queryInterface.dropTable('records');
    await queryInterface.dropTable('repositories');
    await queryInterface.dropTable('accounts');
  }
};
