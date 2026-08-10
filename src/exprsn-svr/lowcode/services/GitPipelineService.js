/**
 * ═══════════════════════════════════════════════════════════
 * Git Pipeline Service
 * CI/CD pipeline execution with Docker/K8s/Cloud support
 * ═══════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');
const GitPipeline = require('../models/GitPipeline');
const GitPipelineRun = require('../models/GitPipelineRun');
const GitDeploymentTarget = require('../models/GitDeploymentTarget');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const axios = require('axios');
const path = require('path');
const fs = require('fs').promises;

class GitPipelineService {
  /**
   * Create a new pipeline
   */
  async createPipeline(repositoryId, { name, description, triggerOn, branches, stages, environmentVariables, workflowId, timeoutMinutes, createdBy }) {
    try {
      const pipeline = await GitPipeline.create({
        id: uuidv4(),
        repositoryId,
        name,
        description,
        triggerOn: triggerOn || ['push', 'pull_request'],
        branches: branches || ['*'],
        stages: stages || [],
        environmentVariables: environmentVariables || {},
        workflowId,
        timeoutMinutes: timeoutMinutes || 60,
        active: true,
        createdBy
      });

      logger.info(`Pipeline created: ${name}`, { pipelineId: pipeline.id, repositoryId });

      return pipeline;
    } catch (error) {
      logger.error('Failed to create pipeline:', error);
      throw error;
    }
  }

  /**
   * Get pipeline by ID
   */
  async getPipeline(pipelineId) {
    return await GitPipeline.findByPk(pipelineId);
  }

  /**
   * List pipelines for repository
   */
  async listPipelines(repositoryId, { active, limit = 50, offset = 0 }) {
    const where = { repositoryId };
    if (active !== undefined) where.active = active;

    const { count, rows } = await GitPipeline.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });

    return { total: count, pipelines: rows, limit, offset };
  }

  /**
   * Update pipeline
   */
  async updatePipeline(pipelineId, updates) {
    const pipeline = await this.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error('Pipeline not found');
    }

    await pipeline.update(updates);

    logger.info('Pipeline updated', { pipelineId, updates });

    return pipeline;
  }

  /**
   * Delete pipeline
   */
  async deletePipeline(pipelineId) {
    const pipeline = await this.getPipeline(pipelineId);
    if (!pipeline) {
      throw new Error('Pipeline not found');
    }

    await pipeline.destroy();

    logger.info('Pipeline deleted', { pipelineId });
  }

  /**
   * Trigger pipeline run
   */
  async triggerPipeline(pipelineId, { trigger, branch, commitSha, prId, startedBy }) {
    try {
      const pipeline = await this.getPipeline(pipelineId);
      if (!pipeline) {
        throw new Error('Pipeline not found');
      }

      if (!pipeline.active) {
        throw new Error('Pipeline is not active');
      }

      // Check if trigger matches configuration
      if (!pipeline.triggerOn.includes(trigger)) {
        logger.debug('Pipeline trigger not configured', { pipelineId, trigger });
        return null;
      }

      // Check if branch matches
      if (!this.branchMatches(branch, pipeline.branches)) {
        logger.debug('Branch does not match pipeline configuration', { pipelineId, branch });
        return null;
      }

      // Get next run number
      const lastRun = await GitPipelineRun.findOne({
        where: { repositoryId: pipeline.repositoryId },
        order: [['runNumber', 'DESC']],
        attributes: ['runNumber']
      });

      const runNumber = lastRun ? lastRun.runNumber + 1 : 1;

      // Create pipeline run
      const run = await GitPipelineRun.create({
        id: uuidv4(),
        pipelineId,
        repositoryId: pipeline.repositoryId,
        runNumber,
        status: 'pending',
        trigger,
        branch,
        commitSha,
        prId,
        startedBy,
        stagesStatus: {}
      });

      logger.info(`Pipeline triggered: ${pipeline.name} #${runNumber}`, { runId: run.id, pipelineId });

      // Execute pipeline asynchronously
      this.executePipeline(run.id, pipeline).catch(error => {
        logger.error('Pipeline execution failed:', error);
      });

      return run;
    } catch (error) {
      logger.error('Failed to trigger pipeline:', error);
      throw error;
    }
  }

  /**
   * Check if branch matches pipeline configuration
   */
  branchMatches(branch, configuredBranches) {
    if (configuredBranches.includes('*')) return true;
    if (configuredBranches.includes(branch)) return true;

    // Check for glob patterns
    for (const pattern of configuredBranches) {
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
        if (regex.test(branch)) return true;
      }
    }

    return false;
  }

  /**
   * Execute pipeline
   */
  async executePipeline(runId, pipeline) {
    const run = await GitPipelineRun.findByPk(runId);
    if (!run) return;

    const startTime = Date.now();

    try {
      // Update status to running
      await run.update({
        status: 'running',
        startedAt: new Date()
      });

      const stagesStatus = {};

      // Execute each stage
      for (const stage of pipeline.stages) {
        logger.info(`Executing stage: ${stage.name}`, { runId, stage: stage.name });

        stagesStatus[stage.name] = { status: 'running', startedAt: new Date() };
        await run.update({ stagesStatus });

        try {
          await this.executeStage(run, pipeline, stage);

          stagesStatus[stage.name] = {
            status: 'success',
            startedAt: stagesStatus[stage.name].startedAt,
            finishedAt: new Date()
          };
        } catch (error) {
          logger.error(`Stage failed: ${stage.name}`, error);

          stagesStatus[stage.name] = {
            status: 'failure',
            startedAt: stagesStatus[stage.name].startedAt,
            finishedAt: new Date(),
            error: error.message
          };

          // Fail entire pipeline
          await run.update({
            status: 'failure',
            stagesStatus,
            finishedAt: new Date(),
            durationSeconds: Math.floor((Date.now() - startTime) / 1000)
          });

          // Notify failure
          await this.notifyPipelineStatus(run, 'failure');

          return;
        }

        await run.update({ stagesStatus });
      }

      // All stages succeeded
      await run.update({
        status: 'success',
        stagesStatus,
        finishedAt: new Date(),
        durationSeconds: Math.floor((Date.now() - startTime) / 1000)
      });

      // Notify success
      await this.notifyPipelineStatus(run, 'success');

      logger.info('Pipeline completed successfully', { runId });
    } catch (error) {
      logger.error('Pipeline execution error:', error);

      await run.update({
        status: 'failure',
        finishedAt: new Date(),
        durationSeconds: Math.floor((Date.now() - startTime) / 1000)
      });

      await this.notifyPipelineStatus(run, 'failure');
    }
  }

  /**
   * Execute a single stage
   */
  async executeStage(run, pipeline, stage) {
    const repoPath = path.join(__dirname, '../../../git-repositories', run.branch);

    // Execute each step in the stage
    for (const step of stage.steps) {
      logger.debug(`Executing step: ${step.name}`, { runId: run.id, step: step.name });

      switch (step.type) {
        case 'shell':
          await this.executeShellStep(run, repoPath, step, pipeline.environmentVariables);
          break;

        case 'docker_build':
          await this.executeDockerBuild(run, repoPath, step);
          break;

        case 'docker_push':
          await this.executeDockerPush(run, step);
          break;

        case 'kubernetes_deploy':
          await this.executeKubernetesDeploy(run, step);
          break;

        case 'workflow':
          await this.executeWorkflowStep(run, step);
          break;

        default:
          logger.warn(`Unknown step type: ${step.type}`, { runId: run.id });
      }
    }
  }

  /**
   * Execute shell command step
   */
  async executeShellStep(run, workDir, step, envVars) {
    const env = { ...process.env, ...envVars, ...step.env };

    const { stdout, stderr } = await execPromise(step.command, {
      cwd: workDir,
      env,
      timeout: step.timeout || 300000 // 5 minutes default
    });

    // Log output
    await this.logBuildOutput(run.id, step.name, stdout);
    if (stderr) {
      await this.logBuildOutput(run.id, step.name, stderr, 'warning');
    }
  }

  /**
   * Execute Docker build step
   */
  async executeDockerBuild(run, workDir, step) {
    const tag = step.tag || `${run.repositoryId}:${run.commitSha.substring(0, 7)}`;
    const dockerfile = step.dockerfile || 'Dockerfile';

    const buildCommand = `docker build -t ${tag} -f ${dockerfile} ${step.buildArgs || ''} .`;

    logger.info('Building Docker image', { runId: run.id, tag });

    const { stdout, stderr } = await execPromise(buildCommand, {
      cwd: workDir,
      timeout: step.timeout || 600000 // 10 minutes default
    });

    await this.logBuildOutput(run.id, step.name, stdout);

    return { tag, image: tag };
  }

  /**
   * Execute Docker push step
   */
  async executeDockerPush(run, step) {
    const pushCommand = `docker push ${step.image}`;

    logger.info('Pushing Docker image', { runId: run.id, image: step.image });

    const { stdout, stderr } = await execPromise(pushCommand, {
      timeout: step.timeout || 300000
    });

    await this.logBuildOutput(run.id, step.name, stdout);
  }

  /**
   * Execute Kubernetes deployment
   */
  async executeKubernetesDeploy(run, step) {
    const manifestPath = step.manifestPath || 'k8s/deployment.yaml';
    const namespace = step.namespace || 'default';

    const deployCommand = `kubectl apply -f ${manifestPath} -n ${namespace}`;

    logger.info('Deploying to Kubernetes', { runId: run.id, namespace });

    const { stdout, stderr } = await execPromise(deployCommand, {
      timeout: step.timeout || 180000
    });

    await this.logBuildOutput(run.id, step.name, stdout);
  }

  /**
   * Execute workflow step
   */
  async executeWorkflowStep(run, step) {
    try {
      const workflowUrl = process.env.WORKFLOW_URL || 'http://localhost:3017';

      await axios.post(`${workflowUrl}/api/workflows/${step.workflowId}/trigger`, {
        eventType: 'pipeline_step',
        data: {
          runId: run.id,
          repositoryId: run.repositoryId,
          commitSha: run.commitSha,
          branch: run.branch,
          stepName: step.name,
          stepData: step.data || {}
        }
      });

      logger.info('Workflow step triggered', { runId: run.id, workflowId: step.workflowId });
    } catch (error) {
      logger.error('Failed to trigger workflow step:', error);
      throw error;
    }
  }

  /**
   * Log build output
   */
  async logBuildOutput(runId, stageName, message, level = 'info') {
    const GitBuildLog = require('../models/GitBuildLog');

    try {
      await GitBuildLog.create({
        id: uuidv4(),
        pipelineRunId: runId,
        stageName,
        logLevel: level,
        message,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error('Failed to log build output:', error);
    }
  }

  /**
   * Notify pipeline status
   */
  async notifyPipelineStatus(run, status) {
    try {
      const heraldUrl = process.env.HERALD_URL || 'http://localhost:3014';

      await axios.post(`${heraldUrl}/api/notifications`, {
        type: `git.pipeline.${status}`,
        title: `Pipeline ${status}`,
        message: `Pipeline run #${run.runNumber} ${status}`,
        data: {
          runId: run.id,
          runNumber: run.runNumber,
          repositoryId: run.repositoryId,
          status
        },
        recipients: run.startedBy ? [run.startedBy] : [],
        channels: ['in_app', 'push'],
        priority: status === 'failure' ? 'high' : 'normal'
      });

      // Update PR status if this was triggered by a PR
      if (run.prId) {
        const GitPullRequestService = require('./GitPullRequestService');
        await GitPullRequestService.updateCIStatus(run.prId, {
          status,
          pipelineRunId: run.id
        });
      }
    } catch (error) {
      logger.error('Failed to notify pipeline status:', error);
    }
  }

  /**
   * Cancel pipeline run
   */
  async cancelPipeline(runId) {
    const run = await GitPipelineRun.findByPk(runId);
    if (!run) {
      throw new Error('Pipeline run not found');
    }

    if (run.status !== 'running' && run.status !== 'pending') {
      throw new Error('Pipeline is not running');
    }

    await run.update({
      status: 'cancelled',
      finishedAt: new Date()
    });

    logger.info('Pipeline cancelled', { runId });

    return run;
  }

  /**
   * Get pipeline run logs
   */
  async getPipelineLogs(runId) {
    const GitBuildLog = require('../models/GitBuildLog');

    const logs = await GitBuildLog.findAll({
      where: { pipelineRunId: runId },
      order: [['timestamp', 'ASC']]
    });

    return logs;
  }

  /**
   * Get pipeline statistics
   */
  async getPipelineStats(pipelineId) {
    const runs = await GitPipelineRun.findAll({
      where: { pipelineId },
      order: [['createdAt', 'DESC']],
      limit: 100
    });

    const total = runs.length;
    const success = runs.filter(r => r.status === 'success').length;
    const failure = runs.filter(r => r.status === 'failure').length;
    const avgDuration = runs
      .filter(r => r.durationSeconds)
      .reduce((sum, r) => sum + r.durationSeconds, 0) / (total || 1);

    return {
      total,
      success,
      failure,
      successRate: total > 0 ? (success / total) * 100 : 0,
      avgDurationSeconds: Math.floor(avgDuration)
    };
  }
}

module.exports = new GitPipelineService();
