/**
 * Migration: Knowledge Base, Forums, and Business Forms
 *
 * Creates tables for:
 * - Knowledge Base: Articles, categories, versions, attachments
 * - Forums: Categories, forums, threads, posts, moderation
 * - Business Forms: Form definitions, submissions, field definitions
 * - CardDAV: Contacts for synchronization
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ============================================
    // KNOWLEDGE BASE TABLES
    // ============================================

    // Create kb_categories table
    await queryInterface.createTable('kb_categories', {
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
      icon: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      color: {
        type: Sequelize.STRING(7),
        allowNull: true,
        defaultValue: '#3788d8'
      },
      parent_category_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      article_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      visibility: {
        type: Sequelize.ENUM('public', 'internal', 'private'),
        allowNull: false,
        defaultValue: 'public'
      },
      is_archived: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('kb_categories', ['slug'], { unique: true });
    await queryInterface.addIndex('kb_categories', ['parent_category_id']);
    await queryInterface.addIndex('kb_categories', ['visibility']);
    await queryInterface.addIndex('kb_categories', ['is_archived']);

    // Create kb_articles table
    await queryInterface.createTable('kb_articles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      category_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'kb_categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      slug: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      summary: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      content_format: {
        type: Sequelize.ENUM('markdown', 'html', 'plaintext'),
        allowNull: false,
        defaultValue: 'markdown'
      },
      author_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      last_edited_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      last_edited_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      status: {
        type: Sequelize.ENUM('draft', 'published', 'archived', 'under_review'),
        allowNull: false,
        defaultValue: 'draft'
      },
      published_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // SEO & Discovery
      meta_title: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      meta_description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      meta_keywords: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      // Engagement
      view_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      helpful_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      not_helpful_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Access control
      visibility: {
        type: Sequelize.ENUM('public', 'internal', 'private'),
        allowNull: false,
        defaultValue: 'public'
      },
      requires_authentication: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      allowed_roles: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      // Features
      enable_comments: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      enable_feedback: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      is_featured: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      featured_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Related content
      related_article_ids: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: []
      },
      // Full-text search
      search_vector: {
        type: 'TSVECTOR',
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('kb_articles', ['category_id']);
    await queryInterface.addIndex('kb_articles', ['author_id']);
    await queryInterface.addIndex('kb_articles', ['slug']);
    await queryInterface.addIndex('kb_articles', ['status']);
    await queryInterface.addIndex('kb_articles', ['visibility']);
    await queryInterface.addIndex('kb_articles', ['published_at']);
    await queryInterface.addIndex('kb_articles', ['is_featured']);
    await queryInterface.addIndex('kb_articles', ['category_id', 'slug'], { unique: true });
    // Full-text search index
    await queryInterface.sequelize.query(
      'CREATE INDEX kb_articles_search_idx ON kb_articles USING GIN (search_vector);'
    );

    // Create kb_article_versions table
    await queryInterface.createTable('kb_article_versions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      article_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'kb_articles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      content_format: {
        type: Sequelize.ENUM('markdown', 'html', 'plaintext'),
        allowNull: false,
        defaultValue: 'markdown'
      },
      change_summary: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      edited_by_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      diff_from_previous: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('kb_article_versions', ['article_id']);
    await queryInterface.addIndex('kb_article_versions', ['version']);
    await queryInterface.addIndex('kb_article_versions', ['article_id', 'version'], { unique: true });

    // Create kb_article_attachments table
    await queryInterface.createTable('kb_article_attachments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      article_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'kb_articles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      filename: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      original_filename: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      file_path: {
        type: Sequelize.STRING(1000),
        allowNull: false
      },
      file_type: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      file_size: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      uploaded_by_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      download_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('kb_article_attachments', ['article_id']);

    // ============================================
    // FORUMS TABLES
    // ============================================

    // Create forum_categories table
    await queryInterface.createTable('forum_categories', {
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
      icon: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      color: {
        type: Sequelize.STRING(7),
        allowNull: true
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      forum_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('forum_categories', ['slug'], { unique: true });

    // Create forums table
    await queryInterface.createTable('forums', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      category_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'forum_categories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      slug: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      icon: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Access control
      visibility: {
        type: Sequelize.ENUM('public', 'members_only', 'private'),
        allowNull: false,
        defaultValue: 'public'
      },
      requires_approval: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      allowed_roles: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      // Moderation
      is_moderated: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      moderator_ids: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: []
      },
      // Statistics
      thread_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      post_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Latest activity
      last_post_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      last_post_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      last_post_user_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Status
      is_locked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_archived: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('forums', ['category_id']);
    await queryInterface.addIndex('forums', ['slug']);
    await queryInterface.addIndex('forums', ['visibility']);
    await queryInterface.addIndex('forums', ['is_archived']);
    await queryInterface.addIndex('forums', ['category_id', 'slug'], { unique: true });

    // Create forum_threads table
    await queryInterface.createTable('forum_threads', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      forum_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'forums',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      slug: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      author_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      // Thread properties
      is_pinned: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_locked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_announcement: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_sticky: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Statistics
      view_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      post_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      reply_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Latest activity
      last_post_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      last_post_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      last_post_user_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Tags
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      // Moderation
      moderation_status: {
        type: Sequelize.ENUM('approved', 'pending', 'flagged', 'hidden', 'deleted'),
        allowNull: false,
        defaultValue: 'approved'
      },
      moderated_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      moderated_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      moderation_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('forum_threads', ['forum_id']);
    await queryInterface.addIndex('forum_threads', ['author_id']);
    await queryInterface.addIndex('forum_threads', ['slug']);
    await queryInterface.addIndex('forum_threads', ['is_pinned']);
    await queryInterface.addIndex('forum_threads', ['is_announcement']);
    await queryInterface.addIndex('forum_threads', ['last_post_at']);
    await queryInterface.addIndex('forum_threads', ['moderation_status']);

    // Create forum_posts table
    await queryInterface.createTable('forum_posts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      thread_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'forum_threads',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      author_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      content: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      content_format: {
        type: Sequelize.ENUM('markdown', 'html', 'bbcode', 'plaintext'),
        allowNull: false,
        defaultValue: 'markdown'
      },
      // Reply chain
      parent_post_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'forum_posts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      reply_to_user_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Editing
      edited_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      edited_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      edit_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      edit_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // IP tracking (for moderation)
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Reactions
      like_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Moderation
      moderation_status: {
        type: Sequelize.ENUM('approved', 'pending', 'flagged', 'hidden', 'deleted'),
        allowNull: false,
        defaultValue: 'approved'
      },
      flag_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      moderated_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      moderated_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      moderation_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Solution marking (for Q&A forums)
      is_solution: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      marked_solution_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      marked_solution_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      deleted_at: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    await queryInterface.addIndex('forum_posts', ['thread_id']);
    await queryInterface.addIndex('forum_posts', ['author_id']);
    await queryInterface.addIndex('forum_posts', ['parent_post_id']);
    await queryInterface.addIndex('forum_posts', ['moderation_status']);
    await queryInterface.addIndex('forum_posts', ['is_solution']);
    await queryInterface.addIndex('forum_posts', ['created_at']);

    // ============================================
    // BUSINESS FORMS TABLES
    // ============================================

    // Create business_forms table
    await queryInterface.createTable('business_forms', {
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
      category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      // Form definition
      fields: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of field definitions with validation rules'
      },
      layout: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Form layout configuration (sections, columns, etc.)'
      },
      // Workflow integration
      on_submit_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Workflow to trigger on form submission'
      },
      on_approve_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      on_reject_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Parameters (for dynamic forms)
      parameters: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Form parameters that can be set when instantiating the form'
      },
      parameter_schema: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'JSON Schema for form parameters'
      },
      // Access control
      visibility: {
        type: Sequelize.ENUM('public', 'authenticated', 'role_based', 'private'),
        allowNull: false,
        defaultValue: 'authenticated'
      },
      allowed_roles: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      allowed_user_ids: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: []
      },
      // Approval workflow
      requires_approval: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      approver_role: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      approver_user_ids: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: []
      },
      auto_approval_rules: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      // Notifications
      notify_on_submit: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      notification_recipients: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: []
      },
      // Features
      allow_multiple_submissions: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      allow_draft_saving: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      allow_editing_after_submit: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Customization
      success_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      success_redirect_url: {
        type: Sequelize.STRING(1000),
        allowNull: true
      },
      custom_css: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Status
      status: {
        type: Sequelize.ENUM('draft', 'active', 'inactive', 'archived'),
        allowNull: false,
        defaultValue: 'draft'
      },
      is_template: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Statistics
      submission_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      approval_rate: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Percentage of approved submissions'
      },
      // Ownership
      created_by_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      updated_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Version control
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('business_forms', ['slug'], { unique: true });
    await queryInterface.addIndex('business_forms', ['status']);
    await queryInterface.addIndex('business_forms', ['category']);
    await queryInterface.addIndex('business_forms', ['is_template']);
    await queryInterface.addIndex('business_forms', ['created_by_id']);

    // Create form_submissions table
    await queryInterface.createTable('business_form_submissions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      form_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'business_forms',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      submitted_by_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      // Form data
      data: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {},
        comment: 'Submitted form field values'
      },
      parameters: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Parameter values used for this submission'
      },
      // Attachments
      attachments: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of file attachment metadata'
      },
      // Status tracking
      status: {
        type: Sequelize.ENUM('draft', 'submitted', 'under_review', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft'
      },
      submitted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      // Approval workflow
      reviewed_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      reviewed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      review_comments: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      approval_level: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Current approval level in multi-stage approval'
      },
      required_approval_levels: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      // Workflow execution
      workflow_execution_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'ID of triggered workflow execution'
      },
      workflow_status: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      // Tracking
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Editing
      last_edited_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      edit_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Reference number
      reference_number: {
        type: Sequelize.STRING(100),
        allowNull: true,
        unique: true,
        comment: 'Auto-generated or custom reference number'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('business_form_submissions', ['form_id']);
    await queryInterface.addIndex('business_form_submissions', ['submitted_by_id']);
    await queryInterface.addIndex('business_form_submissions', ['status']);
    await queryInterface.addIndex('business_form_submissions', ['submitted_at']);
    await queryInterface.addIndex('business_form_submissions', ['reviewed_by_id']);
    await queryInterface.addIndex('business_form_submissions', ['reference_number'], { unique: true });
    await queryInterface.addIndex('business_form_submissions', ['workflow_execution_id']);

    // ============================================
    // CARDDAV CONTACTS TABLES
    // ============================================

    // Create contact_addressbooks table
    await queryInterface.createTable('contact_addressbooks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      color: {
        type: Sequelize.STRING(7),
        allowNull: true
      },
      is_shared: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      shared_with: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: []
      },
      contact_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // CardDAV properties
      sync_token: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      ctag: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'CardDAV change tag'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('contact_addressbooks', ['owner_id']);
    await queryInterface.addIndex('contact_addressbooks', ['sync_token']);

    // Create contacts table
    await queryInterface.createTable('contacts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      addressbook_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'contact_addressbooks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      // Basic info
      prefix: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      first_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      middle_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      last_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      suffix: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      nickname: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      full_name: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      // Organization
      organization: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      department: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      job_title: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      // Contact methods (arrays for multiple entries)
      emails: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of {type, value, isPrimary}'
      },
      phones: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of {type, value, isPrimary}'
      },
      addresses: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of {type, street, city, state, zip, country}'
      },
      urls: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of {type, value}'
      },
      // Social
      social_profiles: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Object with platform: username pairs'
      },
      // Dates
      birthday: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      anniversary: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      // Additional info
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      photo_url: {
        type: Sequelize.STRING(1000),
        allowNull: true
      },
      categories: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      // CardDAV properties
      vcard: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Raw vCard data'
      },
      uid: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Unique identifier for CardDAV'
      },
      etag: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Entity tag for CardDAV'
      },
      // CRM integration
      linked_crm_contact_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Link to CRM contacts table'
      },
      linked_crm_company_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Status
      is_favorite: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_archived: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('contacts', ['addressbook_id']);
    await queryInterface.addIndex('contacts', ['first_name']);
    await queryInterface.addIndex('contacts', ['last_name']);
    await queryInterface.addIndex('contacts', ['organization']);
    await queryInterface.addIndex('contacts', ['uid']);
    await queryInterface.addIndex('contacts', ['linked_crm_contact_id']);
    await queryInterface.addIndex('contacts', ['is_favorite']);

    console.log('✅ Knowledge Base, Forums, and Business Forms migration completed');
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order
    await queryInterface.dropTable('contacts');
    await queryInterface.dropTable('contact_addressbooks');
    await queryInterface.dropTable('business_form_submissions');
    await queryInterface.dropTable('business_forms');
    await queryInterface.dropTable('forum_posts');
    await queryInterface.dropTable('forum_threads');
    await queryInterface.dropTable('forums');
    await queryInterface.dropTable('forum_categories');
    await queryInterface.dropTable('kb_article_attachments');
    await queryInterface.dropTable('kb_article_versions');
    await queryInterface.dropTable('kb_articles');
    await queryInterface.dropTable('kb_categories');

    console.log('✅ Knowledge Base, Forums, and Business Forms migration rolled back');
  }
};
