/**
 * ═══════════════════════════════════════════════════════════
 * Model Associations
 * Defines relationships between Git system models
 * ═══════════════════════════════════════════════════════════
 */

module.exports = (models) => {
  const {
    GitRepository,
    GitBranch,
    GitCommit,
    GitIssue,
    GitPullRequest,
    GitPipeline,
    GitPipelineRun,
    GitDeploymentTarget,
    GitWebhook,
    GitSystemConfig,
    GitRepositoryTemplate,
    GitSSHKey,
    GitPersonalAccessToken,
    GitRepositoryPolicy,
    GitRunner,
    GitEnvironmentVariable,
    GitCodeOwner,
    GitIssueTemplate,
    GitDeploymentEnvironment,
    GitRegistryConfig,
    GitSecurityScanConfig,
    GitSecurityScanResult,
    GitMergeTrain,
    GitOAuthApplication,
    GitPipelineArtifact,
    GitPipelineCache,
    GitAuditLog
  } = models;

  // GitRepository associations
  if (GitRepository) {
    GitRepository.hasMany(GitBranch, { foreignKey: 'repositoryId', as: 'branches' });
    GitRepository.hasMany(GitCommit, { foreignKey: 'repositoryId', as: 'commits' });
    GitRepository.hasMany(GitIssue, { foreignKey: 'repositoryId', as: 'issues' });
    GitRepository.hasMany(GitPullRequest, { foreignKey: 'repositoryId', as: 'pullRequests' });
    GitRepository.hasMany(GitPipeline, { foreignKey: 'repositoryId', as: 'pipelines' });
    GitRepository.hasMany(GitWebhook, { foreignKey: 'repositoryId', as: 'webhooks' });
    GitRepository.hasMany(GitRepositoryPolicy, { foreignKey: 'repositoryId', as: 'policies' });
    GitRepository.hasMany(GitEnvironmentVariable, { foreignKey: 'repositoryId', as: 'environmentVariables' });
    GitRepository.hasMany(GitCodeOwner, { foreignKey: 'repositoryId', as: 'codeOwners' });
    GitRepository.hasMany(GitIssueTemplate, { foreignKey: 'repositoryId', as: 'issueTemplates' });
    GitRepository.hasMany(GitDeploymentEnvironment, { foreignKey: 'repositoryId', as: 'deploymentEnvironments' });
    GitRepository.hasMany(GitRegistryConfig, { foreignKey: 'repositoryId', as: 'registryConfigs' });
    GitRepository.hasMany(GitSecurityScanConfig, { foreignKey: 'repositoryId', as: 'securityScanConfigs' });
    GitRepository.hasMany(GitMergeTrain, { foreignKey: 'repositoryId', as: 'mergeTrains' });
    GitRepository.hasMany(GitPipelineCache, { foreignKey: 'repositoryId', as: 'pipelineCaches' });
    GitRepository.hasMany(GitAuditLog, { foreignKey: 'repositoryId', as: 'auditLogs' });
  }

  // GitBranch associations
  if (GitBranch) {
    GitBranch.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
  }

  // GitCommit associations
  if (GitCommit) {
    GitCommit.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
  }

  // GitIssue associations
  if (GitIssue) {
    GitIssue.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
  }

  // GitPullRequest associations
  if (GitPullRequest) {
    GitPullRequest.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
    GitPullRequest.hasMany(GitMergeTrain, { foreignKey: 'pullRequestId', as: 'mergeTrainEntries' });
  }

  // GitPipeline associations
  if (GitPipeline) {
    GitPipeline.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
    GitPipeline.hasMany(GitPipelineRun, { foreignKey: 'pipelineId', as: 'runs' });
  }

  // GitPipelineRun associations
  if (GitPipelineRun) {
    GitPipelineRun.belongsTo(GitPipeline, { foreignKey: 'pipelineId', as: 'pipeline' });
    GitPipelineRun.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
    GitPipelineRun.belongsTo(GitPullRequest, { foreignKey: 'prId', as: 'pullRequest' });
    GitPipelineRun.hasMany(GitPipelineArtifact, { foreignKey: 'pipelineRunId', as: 'artifacts' });
    GitPipelineRun.hasMany(GitSecurityScanResult, { foreignKey: 'pipelineRunId', as: 'securityScanResults' });
    GitPipelineRun.hasMany(GitMergeTrain, { foreignKey: 'pipelineRunId', as: 'mergeTrainEntries' });
  }

  // GitDeploymentTarget associations
  if (GitDeploymentTarget) {
    GitDeploymentTarget.hasMany(GitDeploymentEnvironment, { foreignKey: 'deploymentTargetId', as: 'environments' });
  }

  // GitWebhook associations
  if (GitWebhook) {
    GitWebhook.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
  }

  // GitRepositoryPolicy associations
  if (GitRepositoryPolicy) {
    GitRepositoryPolicy.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
  }

  // GitEnvironmentVariable associations
  if (GitEnvironmentVariable) {
    GitEnvironmentVariable.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
    GitEnvironmentVariable.belongsTo(GitDeploymentEnvironment, { foreignKey: 'environmentId', as: 'environment' });
  }

  // GitCodeOwner associations
  if (GitCodeOwner) {
    GitCodeOwner.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
  }

  // GitIssueTemplate associations
  if (GitIssueTemplate) {
    GitIssueTemplate.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
  }

  // GitDeploymentEnvironment associations
  if (GitDeploymentEnvironment) {
    GitDeploymentEnvironment.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
    GitDeploymentEnvironment.belongsTo(GitDeploymentTarget, { foreignKey: 'deploymentTargetId', as: 'deploymentTarget' });
    GitDeploymentEnvironment.hasMany(GitEnvironmentVariable, { foreignKey: 'environmentId', as: 'environmentVariables' });
  }

  // GitRegistryConfig associations
  if (GitRegistryConfig) {
    GitRegistryConfig.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
  }

  // GitSecurityScanConfig associations
  if (GitSecurityScanConfig) {
    GitSecurityScanConfig.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
    GitSecurityScanConfig.hasMany(GitSecurityScanResult, { foreignKey: 'configId', as: 'results' });
  }

  // GitSecurityScanResult associations
  if (GitSecurityScanResult) {
    GitSecurityScanResult.belongsTo(GitSecurityScanConfig, { foreignKey: 'configId', as: 'config' });
    GitSecurityScanResult.belongsTo(GitPipelineRun, { foreignKey: 'pipelineRunId', as: 'pipelineRun' });
  }

  // GitMergeTrain associations
  if (GitMergeTrain) {
    GitMergeTrain.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
    GitMergeTrain.belongsTo(GitPullRequest, { foreignKey: 'pullRequestId', as: 'pullRequest' });
    GitMergeTrain.belongsTo(GitPipelineRun, { foreignKey: 'pipelineRunId', as: 'pipelineRun' });
  }

  // GitPipelineArtifact associations
  if (GitPipelineArtifact) {
    GitPipelineArtifact.belongsTo(GitPipelineRun, { foreignKey: 'pipelineRunId', as: 'pipelineRun' });
  }

  // GitPipelineCache associations
  if (GitPipelineCache) {
    GitPipelineCache.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
  }

  // GitAuditLog associations
  if (GitAuditLog) {
    GitAuditLog.belongsTo(GitRepository, { foreignKey: 'repositoryId', as: 'repository' });
  }
};
