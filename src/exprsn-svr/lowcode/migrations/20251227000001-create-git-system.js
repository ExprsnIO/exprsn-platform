/**
 * ═══════════════════════════════════════════════════════════
 * Git Integration System Migration
 * Creates comprehensive Git functionality with CI/CD support
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ═══════════════════════════════════════════════════════════
    // 1. Git Repositories
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_repositories', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      slug: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      default_branch: {
        type: Sequelize.STRING,
        defaultValue: 'main',
        allowNull: false
      },
      visibility: {
        type: Sequelize.ENUM('public', 'private', 'internal'),
        defaultValue: 'private',
        allowNull: false
      },
      // Low-Code integration
      application_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'applications',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      html_project_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'html_projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      clone_url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      ssh_url: {
        type: Sequelize.STRING,
        allowNull: true
      },
      size: {
        type: Sequelize.BIGINT,
        defaultValue: 0
      },
      stars_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      forks_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      open_issues_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      open_prs_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      is_fork: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      parent_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      archived: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      settings: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex('git_repositories', ['slug']);
    await queryInterface.addIndex('git_repositories', ['application_id']);
    await queryInterface.addIndex('git_repositories', ['html_project_id']);
    await queryInterface.addIndex('git_repositories', ['owner_id']);
    await queryInterface.addIndex('git_repositories', ['parent_id']);

    // ═══════════════════════════════════════════════════════════
    // 2. Git Branches
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_branches', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      commit_sha: {
        type: Sequelize.STRING(40),
        allowNull: false
      },
      is_protected: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      protection_rules: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
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

    await queryInterface.addIndex('git_branches', ['repository_id', 'name'], { unique: true });
    await queryInterface.addIndex('git_branches', ['commit_sha']);

    // ═══════════════════════════════════════════════════════════
    // 3. Git Commits
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_commits', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      sha: {
        type: Sequelize.STRING(40),
        allowNull: false
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      author_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      author_email: {
        type: Sequelize.STRING,
        allowNull: false
      },
      author_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      committer_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      committer_email: {
        type: Sequelize.STRING,
        allowNull: false
      },
      parent_shas: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      tree_sha: {
        type: Sequelize.STRING(40),
        allowNull: false
      },
      additions: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      deletions: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      files_changed: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      committed_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('git_commits', ['repository_id', 'sha'], { unique: true });
    await queryInterface.addIndex('git_commits', ['author_id']);
    await queryInterface.addIndex('git_commits', ['committed_at']);

    // ═══════════════════════════════════════════════════════════
    // 4. Git Tags
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_tags', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      commit_sha: {
        type: Sequelize.STRING(40),
        allowNull: false
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      tagger_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      tagger_email: {
        type: Sequelize.STRING,
        allowNull: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('git_tags', ['repository_id', 'name'], { unique: true });

    // ═══════════════════════════════════════════════════════════
    // 5. Git Issues
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_issues', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      number: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      state: {
        type: Sequelize.ENUM('open', 'closed', 'in_progress', 'resolved', 'wont_fix'),
        defaultValue: 'open',
        allowNull: false
      },
      priority: {
        type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
        defaultValue: 'medium'
      },
      issue_type: {
        type: Sequelize.ENUM('bug', 'feature', 'enhancement', 'task', 'question', 'documentation'),
        defaultValue: 'task'
      },
      labels: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      assignees: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        defaultValue: []
      },
      milestone_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Workflow integration
      workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      workflow_instance_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      closed_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      closed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      due_date: {
        type: Sequelize.DATE,
        allowNull: true
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

    await queryInterface.addIndex('git_issues', ['repository_id', 'number'], { unique: true });
    await queryInterface.addIndex('git_issues', ['state']);
    await queryInterface.addIndex('git_issues', ['created_by']);
    await queryInterface.addIndex('git_issues', ['workflow_instance_id']);

    // ═══════════════════════════════════════════════════════════
    // 6. Git Issue Comments
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_issue_comments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      issue_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_issues',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      author_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      is_system: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
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

    await queryInterface.addIndex('git_issue_comments', ['issue_id']);
    await queryInterface.addIndex('git_issue_comments', ['author_id']);

    // ═══════════════════════════════════════════════════════════
    // 7. Git Pull Requests
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_pull_requests', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      number: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING,
        allowNull: false
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      state: {
        type: Sequelize.ENUM('open', 'closed', 'merged', 'draft'),
        defaultValue: 'open',
        allowNull: false
      },
      source_branch: {
        type: Sequelize.STRING,
        allowNull: false
      },
      target_branch: {
        type: Sequelize.STRING,
        allowNull: false
      },
      head_sha: {
        type: Sequelize.STRING(40),
        allowNull: false
      },
      base_sha: {
        type: Sequelize.STRING(40),
        allowNull: false
      },
      merge_commit_sha: {
        type: Sequelize.STRING(40),
        allowNull: true
      },
      mergeable: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      conflicts: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      labels: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      assignees: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        defaultValue: []
      },
      reviewers: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        defaultValue: []
      },
      // CI/CD integration
      ci_status: {
        type: Sequelize.ENUM('pending', 'running', 'success', 'failure', 'cancelled'),
        defaultValue: 'pending'
      },
      ci_pipeline_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Review status
      review_status: {
        type: Sequelize.ENUM('pending', 'approved', 'changes_requested', 'commented'),
        defaultValue: 'pending'
      },
      approvals_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      changes_requested_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      merged_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      merged_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      closed_at: {
        type: Sequelize.DATE,
        allowNull: true
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

    await queryInterface.addIndex('git_pull_requests', ['repository_id', 'number'], { unique: true });
    await queryInterface.addIndex('git_pull_requests', ['state']);
    await queryInterface.addIndex('git_pull_requests', ['created_by']);
    await queryInterface.addIndex('git_pull_requests', ['ci_pipeline_id']);

    // ═══════════════════════════════════════════════════════════
    // 8. Git PR Reviews
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_pr_reviews', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      pr_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_pull_requests',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      reviewer_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      state: {
        type: Sequelize.ENUM('pending', 'approved', 'changes_requested', 'commented'),
        defaultValue: 'pending',
        allowNull: false
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      submitted_at: {
        type: Sequelize.DATE,
        allowNull: true
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

    await queryInterface.addIndex('git_pr_reviews', ['pr_id']);
    await queryInterface.addIndex('git_pr_reviews', ['reviewer_id']);

    // ═══════════════════════════════════════════════════════════
    // 9. Git PR Comments
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_pr_comments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      pr_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_pull_requests',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      review_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'git_pr_reviews',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      body: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      author_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      // Code-specific comments
      file_path: {
        type: Sequelize.STRING,
        allowNull: true
      },
      line_number: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      commit_sha: {
        type: Sequelize.STRING(40),
        allowNull: true
      },
      is_resolved: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
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

    await queryInterface.addIndex('git_pr_comments', ['pr_id']);
    await queryInterface.addIndex('git_pr_comments', ['review_id']);
    await queryInterface.addIndex('git_pr_comments', ['author_id']);

    // ═══════════════════════════════════════════════════════════
    // 10. Git Webhooks
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_webhooks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      url: {
        type: Sequelize.STRING,
        allowNull: false
      },
      secret: {
        type: Sequelize.STRING,
        allowNull: true
      },
      events: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: ['push', 'pull_request', 'issues']
      },
      active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      ssl_verify: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      headers: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
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

    await queryInterface.addIndex('git_webhooks', ['repository_id']);

    // ═══════════════════════════════════════════════════════════
    // 11. Git Pipelines (CI/CD)
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_pipelines', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      trigger_on: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: ['push', 'pull_request']
      },
      branches: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: ['*']
      },
      // Workflow integration
      workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // Pipeline definition
      stages: {
        type: Sequelize.JSONB,
        defaultValue: []
      },
      environment_variables: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      timeout_minutes: {
        type: Sequelize.INTEGER,
        defaultValue: 60
      },
      active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
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

    await queryInterface.addIndex('git_pipelines', ['repository_id']);
    await queryInterface.addIndex('git_pipelines', ['workflow_id']);

    // ═══════════════════════════════════════════════════════════
    // 12. Git Pipeline Runs
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_pipeline_runs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      pipeline_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_pipelines',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      run_number: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'running', 'success', 'failure', 'cancelled', 'skipped'),
        defaultValue: 'pending',
        allowNull: false
      },
      trigger: {
        type: Sequelize.ENUM('push', 'pull_request', 'manual', 'webhook', 'schedule'),
        allowNull: false
      },
      branch: {
        type: Sequelize.STRING,
        allowNull: false
      },
      commit_sha: {
        type: Sequelize.STRING(40),
        allowNull: false
      },
      pr_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'git_pull_requests',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      stages_status: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      started_by: {
        type: Sequelize.UUID,
        allowNull: true
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('git_pipeline_runs', ['pipeline_id']);
    await queryInterface.addIndex('git_pipeline_runs', ['repository_id', 'run_number']);
    await queryInterface.addIndex('git_pipeline_runs', ['status']);
    await queryInterface.addIndex('git_pipeline_runs', ['pr_id']);

    // ═══════════════════════════════════════════════════════════
    // 13. Git Deployment Targets
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_deployment_targets', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      type: {
        type: Sequelize.ENUM('docker', 'kubernetes', 'digitalocean', 'aws', 'azure', 'gcp', 'bare_metal', 'xen', 'qemu'),
        allowNull: false
      },
      environment: {
        type: Sequelize.ENUM('development', 'staging', 'production', 'testing'),
        defaultValue: 'development'
      },
      configuration: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      credentials: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      created_by: {
        type: Sequelize.UUID,
        allowNull: false
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

    await queryInterface.addIndex('git_deployment_targets', ['repository_id']);
    await queryInterface.addIndex('git_deployment_targets', ['type']);

    // ═══════════════════════════════════════════════════════════
    // 14. Git Deployments
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_deployments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      target_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_deployment_targets',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      pipeline_run_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'git_pipeline_runs',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      commit_sha: {
        type: Sequelize.STRING(40),
        allowNull: false
      },
      branch: {
        type: Sequelize.STRING,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'in_progress', 'success', 'failure', 'rolled_back'),
        defaultValue: 'pending',
        allowNull: false
      },
      logs: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      deployed_by: {
        type: Sequelize.UUID,
        allowNull: false
      },
      started_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      finished_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('git_deployments', ['repository_id']);
    await queryInterface.addIndex('git_deployments', ['target_id']);
    await queryInterface.addIndex('git_deployments', ['pipeline_run_id']);
    await queryInterface.addIndex('git_deployments', ['status']);

    // ═══════════════════════════════════════════════════════════
    // 15. Git Build Logs
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_build_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      pipeline_run_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_pipeline_runs',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      stage_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      step_name: {
        type: Sequelize.STRING,
        allowNull: true
      },
      log_level: {
        type: Sequelize.ENUM('info', 'warning', 'error', 'debug'),
        defaultValue: 'info'
      },
      message: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      timestamp: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('git_build_logs', ['pipeline_run_id']);
    await queryInterface.addIndex('git_build_logs', ['timestamp']);

    // ═══════════════════════════════════════════════════════════
    // 16. Git Test Results
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_test_results', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      pipeline_run_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_pipeline_runs',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      suite_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      test_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('passed', 'failed', 'skipped', 'error'),
        allowNull: false
      },
      duration_ms: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      stack_trace: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('git_test_results', ['pipeline_run_id']);
    await queryInterface.addIndex('git_test_results', ['status']);

    // ═══════════════════════════════════════════════════════════
    // 17. Git Repository Collaborators
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_collaborators', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      role: {
        type: Sequelize.ENUM('admin', 'maintainer', 'contributor', 'reader'),
        defaultValue: 'reader',
        allowNull: false
      },
      permissions: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      added_by: {
        type: Sequelize.UUID,
        allowNull: false
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

    await queryInterface.addIndex('git_collaborators', ['repository_id', 'user_id'], { unique: true });
    await queryInterface.addIndex('git_collaborators', ['user_id']);

    // ═══════════════════════════════════════════════════════════
    // 18. Git File Changes (for tracking detailed changes)
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_file_changes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      commit_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'git_commits',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      file_path: {
        type: Sequelize.STRING,
        allowNull: false
      },
      change_type: {
        type: Sequelize.ENUM('added', 'modified', 'deleted', 'renamed'),
        allowNull: false
      },
      old_path: {
        type: Sequelize.STRING,
        allowNull: true
      },
      additions: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      deletions: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      patch: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('git_file_changes', ['commit_id']);
    await queryInterface.addIndex('git_file_changes', ['file_path']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('git_file_changes');
    await queryInterface.dropTable('git_collaborators');
    await queryInterface.dropTable('git_test_results');
    await queryInterface.dropTable('git_build_logs');
    await queryInterface.dropTable('git_deployments');
    await queryInterface.dropTable('git_deployment_targets');
    await queryInterface.dropTable('git_pipeline_runs');
    await queryInterface.dropTable('git_pipelines');
    await queryInterface.dropTable('git_webhooks');
    await queryInterface.dropTable('git_pr_comments');
    await queryInterface.dropTable('git_pr_reviews');
    await queryInterface.dropTable('git_pull_requests');
    await queryInterface.dropTable('git_issue_comments');
    await queryInterface.dropTable('git_issues');
    await queryInterface.dropTable('git_tags');
    await queryInterface.dropTable('git_commits');
    await queryInterface.dropTable('git_branches');
    await queryInterface.dropTable('git_repositories');
  }
};
