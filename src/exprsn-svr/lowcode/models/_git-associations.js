/**
 * ═══════════════════════════════════════════════════════════
 * Git Models Associations
 * Defines all relationships between Git models
 * ═══════════════════════════════════════════════════════════
 */

const GitRepository = require('./GitRepository');
const GitBranch = require('./GitBranch');
const GitCommit = require('./GitCommit');
const GitIssue = require('./GitIssue');
const GitPullRequest = require('./GitPullRequest');
const GitPipeline = require('./GitPipeline');
const GitPipelineRun = require('./GitPipelineRun');
const GitDeploymentTarget = require('./GitDeploymentTarget');
const GitWebhook = require('./GitWebhook');

// Application and HTML Project associations (imported when available)
let Application, HtmlProject;
try {
  Application = require('./Application');
  HtmlProject = require('./HtmlProject');
} catch (error) {
  // Models not available yet
}

function setupGitAssociations() {
  // Repository associations
  GitRepository.hasMany(GitBranch, {
    foreignKey: 'repositoryId',
    as: 'branches',
    onDelete: 'CASCADE'
  });

  GitRepository.hasMany(GitCommit, {
    foreignKey: 'repositoryId',
    as: 'commits',
    onDelete: 'CASCADE'
  });

  GitRepository.hasMany(GitIssue, {
    foreignKey: 'repositoryId',
    as: 'issues',
    onDelete: 'CASCADE'
  });

  GitRepository.hasMany(GitPullRequest, {
    foreignKey: 'repositoryId',
    as: 'pullRequests',
    onDelete: 'CASCADE'
  });

  GitRepository.hasMany(GitPipeline, {
    foreignKey: 'repositoryId',
    as: 'pipelines',
    onDelete: 'CASCADE'
  });

  GitRepository.hasMany(GitWebhook, {
    foreignKey: 'repositoryId',
    as: 'webhooks',
    onDelete: 'CASCADE'
  });

  GitRepository.hasMany(GitDeploymentTarget, {
    foreignKey: 'repositoryId',
    as: 'deploymentTargets',
    onDelete: 'CASCADE'
  });

  // Repository parent-child (fork) relationship
  GitRepository.belongsTo(GitRepository, {
    foreignKey: 'parentId',
    as: 'parent'
  });

  GitRepository.hasMany(GitRepository, {
    foreignKey: 'parentId',
    as: 'forks'
  });

  // Low-Code integration
  if (Application) {
    GitRepository.belongsTo(Application, {
      foreignKey: 'applicationId',
      as: 'application'
    });

    Application.hasOne(GitRepository, {
      foreignKey: 'applicationId',
      as: 'repository'
    });
  }

  if (HtmlProject) {
    GitRepository.belongsTo(HtmlProject, {
      foreignKey: 'htmlProjectId',
      as: 'htmlProject'
    });

    HtmlProject.hasOne(GitRepository, {
      foreignKey: 'htmlProjectId',
      as: 'repository'
    });
  }

  // Branch associations
  GitBranch.belongsTo(GitRepository, {
    foreignKey: 'repositoryId',
    as: 'repository'
  });

  // Commit associations
  GitCommit.belongsTo(GitRepository, {
    foreignKey: 'repositoryId',
    as: 'repository'
  });

  // Issue associations
  GitIssue.belongsTo(GitRepository, {
    foreignKey: 'repositoryId',
    as: 'repository'
  });

  // Pull Request associations
  GitPullRequest.belongsTo(GitRepository, {
    foreignKey: 'repositoryId',
    as: 'repository'
  });

  GitPullRequest.belongsTo(GitPipeline, {
    foreignKey: 'ciPipelineId',
    as: 'ciPipeline'
  });

  // Pipeline associations
  GitPipeline.belongsTo(GitRepository, {
    foreignKey: 'repositoryId',
    as: 'repository'
  });

  GitPipeline.hasMany(GitPipelineRun, {
    foreignKey: 'pipelineId',
    as: 'runs',
    onDelete: 'CASCADE'
  });

  // Pipeline Run associations
  GitPipelineRun.belongsTo(GitPipeline, {
    foreignKey: 'pipelineId',
    as: 'pipeline'
  });

  GitPipelineRun.belongsTo(GitRepository, {
    foreignKey: 'repositoryId',
    as: 'repository'
  });

  GitPipelineRun.belongsTo(GitPullRequest, {
    foreignKey: 'prId',
    as: 'pullRequest'
  });

  // Webhook associations
  GitWebhook.belongsTo(GitRepository, {
    foreignKey: 'repositoryId',
    as: 'repository'
  });

  // Deployment Target associations
  GitDeploymentTarget.belongsTo(GitRepository, {
    foreignKey: 'repositoryId',
    as: 'repository'
  });
}

module.exports = {
  setupGitAssociations,
  GitRepository,
  GitBranch,
  GitCommit,
  GitIssue,
  GitPullRequest,
  GitPipeline,
  GitPipelineRun,
  GitDeploymentTarget,
  GitWebhook
};
