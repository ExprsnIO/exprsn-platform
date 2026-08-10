/**
 * ═══════════════════════════════════════════════════════════
 * Git Setup System Migration
 * Creates comprehensive configuration tables for Git/CI/CD management
 * Provides feature parity with GitLab, GitHub, and Azure DevOps
 * ═══════════════════════════════════════════════════════════
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ═══════════════════════════════════════════════════════════
    // 1. Git System Configuration
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_system_config', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      config_key: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      config_value: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      config_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      is_encrypted: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      updated_by: {
        type: Sequelize.UUID,
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

    await queryInterface.addIndex('git_system_config', ['config_type']);
    await queryInterface.addIndex('git_system_config', ['config_key']);

    // ═══════════════════════════════════════════════════════════
    // 2. Repository Templates
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_repository_templates', {
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
      template_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      default_branch: {
        type: Sequelize.STRING(100),
        defaultValue: 'main'
      },
      gitignore_content: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      readme_template: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      license_type: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      include_ci_config: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      ci_config_template: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      branch_protection_rules: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    await queryInterface.addIndex('git_repository_templates', ['template_type']);
    await queryInterface.addIndex('git_repository_templates', ['is_active']);

    // ═══════════════════════════════════════════════════════════
    // 3. SSH Keys Management
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_ssh_keys', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      public_key: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      fingerprint: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      key_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    await queryInterface.addIndex('git_ssh_keys', ['user_id']);
    await queryInterface.addIndex('git_ssh_keys', ['fingerprint'], { unique: true });
    await queryInterface.addIndex('git_ssh_keys', ['is_active']);

    // ═══════════════════════════════════════════════════════════
    // 4. Personal Access Tokens
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_personal_access_tokens', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      token_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      scopes: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    await queryInterface.addIndex('git_personal_access_tokens', ['user_id']);
    await queryInterface.addIndex('git_personal_access_tokens', ['token_hash'], { unique: true });
    await queryInterface.addIndex('git_personal_access_tokens', ['is_active']);

    // ═══════════════════════════════════════════════════════════
    // 5. Repository Access Policies
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_repository_policies', {
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
      policy_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      policy_config: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    await queryInterface.addIndex('git_repository_policies', ['repository_id']);
    await queryInterface.addIndex('git_repository_policies', ['policy_type']);

    // ═══════════════════════════════════════════════════════════
    // 6. CI/CD Runners
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_runners', {
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
      runner_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      runner_token_hash: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      tags: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      is_shared: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      max_jobs: {
        type: Sequelize.INTEGER,
        defaultValue: 1
      },
      configuration: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      status: {
        type: Sequelize.STRING(50),
        defaultValue: 'offline'
      },
      last_contact_at: {
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

    await queryInterface.addIndex('git_runners', ['runner_token_hash'], { unique: true });
    await queryInterface.addIndex('git_runners', ['status']);
    await queryInterface.addIndex('git_runners', ['runner_type']);

    // ═══════════════════════════════════════════════════════════
    // 7. Environment Variables
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_environment_variables', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      scope_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      scope_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      key: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      value_encrypted: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      is_protected: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_masked: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      environment_scope: {
        type: Sequelize.STRING(100),
        defaultValue: '*'
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

    await queryInterface.addIndex('git_environment_variables', ['scope_type', 'scope_id']);
    await queryInterface.addIndex('git_environment_variables', ['scope_type', 'scope_id', 'key', 'environment_scope'], {
      unique: true,
      name: 'git_env_vars_unique_idx'
    });

    // ═══════════════════════════════════════════════════════════
    // 8. Code Owners
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_code_owners', {
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
      path_pattern: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      owner_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      is_required: {
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

    await queryInterface.addIndex('git_code_owners', ['repository_id']);
    await queryInterface.addIndex('git_code_owners', ['owner_type', 'owner_id']);

    // ═══════════════════════════════════════════════════════════
    // 9. Issue Templates
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_issue_templates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      template_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      title_template: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      body_template: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      labels: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      assignees: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      is_default: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    await queryInterface.addIndex('git_issue_templates', ['repository_id']);
    await queryInterface.addIndex('git_issue_templates', ['template_type']);

    // ═══════════════════════════════════════════════════════════
    // 10. Deployment Environments
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_deployment_environments', {
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
        type: Sequelize.STRING(255),
        allowNull: false
      },
      environment_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      configuration: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      auto_deploy: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      protected: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      approval_rules: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      external_url: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    await queryInterface.addIndex('git_deployment_environments', ['repository_id', 'name'], { unique: true });
    await queryInterface.addIndex('git_deployment_environments', ['environment_type']);

    // ═══════════════════════════════════════════════════════════
    // 11. Registry Configuration
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_registry_config', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      registry_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      repository_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'git_repositories',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      configuration: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      storage_path: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      is_public: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },
      max_size_mb: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      cleanup_policy: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    await queryInterface.addIndex('git_registry_config', ['registry_type']);
    await queryInterface.addIndex('git_registry_config', ['repository_id']);

    // ═══════════════════════════════════════════════════════════
    // 12. Security Scan Configuration
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_security_scan_config', {
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
      scan_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      configuration: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      fail_on_severity: {
        type: Sequelize.STRING(50),
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

    await queryInterface.addIndex('git_security_scan_config', ['repository_id', 'scan_type'], { unique: true });

    // ═══════════════════════════════════════════════════════════
    // 13. Security Scan Results
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_security_scan_results', {
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
      pipeline_run_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'git_pipeline_runs',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      scan_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      severity: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      vulnerability_count: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      results_data: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      status: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      scanned_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('git_security_scan_results', ['repository_id']);
    await queryInterface.addIndex('git_security_scan_results', ['pipeline_run_id']);
    await queryInterface.addIndex('git_security_scan_results', ['scan_type']);

    // ═══════════════════════════════════════════════════════════
    // 14. Merge Trains
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_merge_trains', {
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
      target_branch: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      pull_request_ids: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      current_position: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      status: {
        type: Sequelize.STRING(50),
        defaultValue: 'running'
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

    await queryInterface.addIndex('git_merge_trains', ['repository_id']);
    await queryInterface.addIndex('git_merge_trains', ['status']);

    // ═══════════════════════════════════════════════════════════
    // 15. OAuth Applications
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_oauth_applications', {
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
      client_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true
      },
      client_secret_hash: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      redirect_uris: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      scopes: {
        type: Sequelize.JSONB,
        allowNull: false
      },
      is_confidential: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
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

    await queryInterface.addIndex('git_oauth_applications', ['client_id'], { unique: true });
    await queryInterface.addIndex('git_oauth_applications', ['owner_id']);

    // ═══════════════════════════════════════════════════════════
    // 16. Pipeline Artifacts
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_pipeline_artifacts', {
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
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      artifact_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      file_path: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      size_bytes: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('git_pipeline_artifacts', ['pipeline_run_id']);
    await queryInterface.addIndex('git_pipeline_artifacts', ['expires_at']);

    // ═══════════════════════════════════════════════════════════
    // 17. Pipeline Cache
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_pipeline_cache', {
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
      cache_key: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      file_path: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      size_bytes: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      last_used_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('git_pipeline_cache', ['repository_id', 'cache_key'], { unique: true });
    await queryInterface.addIndex('git_pipeline_cache', ['expires_at']);

    // ═══════════════════════════════════════════════════════════
    // 18. Audit Logs
    // ═══════════════════════════════════════════════════════════
    await queryInterface.createTable('git_audit_logs', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      event_type: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      entity_type: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      details: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    await queryInterface.addIndex('git_audit_logs', ['event_type']);
    await queryInterface.addIndex('git_audit_logs', ['entity_type', 'entity_id']);
    await queryInterface.addIndex('git_audit_logs', ['user_id']);
    await queryInterface.addIndex('git_audit_logs', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order
    await queryInterface.dropTable('git_audit_logs');
    await queryInterface.dropTable('git_pipeline_cache');
    await queryInterface.dropTable('git_pipeline_artifacts');
    await queryInterface.dropTable('git_oauth_applications');
    await queryInterface.dropTable('git_merge_trains');
    await queryInterface.dropTable('git_security_scan_results');
    await queryInterface.dropTable('git_security_scan_config');
    await queryInterface.dropTable('git_registry_config');
    await queryInterface.dropTable('git_deployment_environments');
    await queryInterface.dropTable('git_issue_templates');
    await queryInterface.dropTable('git_code_owners');
    await queryInterface.dropTable('git_environment_variables');
    await queryInterface.dropTable('git_runners');
    await queryInterface.dropTable('git_repository_policies');
    await queryInterface.dropTable('git_personal_access_tokens');
    await queryInterface.dropTable('git_ssh_keys');
    await queryInterface.dropTable('git_repository_templates');
    await queryInterface.dropTable('git_system_config');
  }
};
