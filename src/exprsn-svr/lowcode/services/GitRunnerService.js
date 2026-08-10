/**
 * ═══════════════════════════════════════════════════════════
 * Git Runner Service
 * Manages CI/CD runners and pipeline cache
 * ═══════════════════════════════════════════════════════════
 */

const axios = require('axios');

class GitRunnerService {
  constructor(models) {
    this.GitRunner = models.GitRunner;
    this.GitPipelineCache = models.GitPipelineCache;
    this.GitPipelineArtifact = models.GitPipelineArtifact;
    this.GitAuditLog = models.GitAuditLog;
  }

  // ═══════════════════════════════════════════════════════════
  // Runner Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Register new runner
   */
  async registerRunner(runnerData, userId) {
    const {
      name,
      description,
      runnerType,
      tags = [],
      configuration = {},
      maxConcurrentJobs = 1,
      platform,
      architecture,
      version,
      ipAddress
    } = runnerData;

    // Validate runner type
    const validTypes = ['docker', 'kubernetes', 'shell', 'ssh', 'digitalocean', 'aws', 'azure', 'gcp'];
    if (!validTypes.includes(runnerType)) {
      throw new Error(`Invalid runner type. Must be one of: ${validTypes.join(', ')}`);
    }

    const runner = await this.GitRunner.create({
      name,
      description,
      runnerType,
      tags,
      configuration,
      maxConcurrentJobs,
      platform,
      architecture,
      version,
      ipAddress,
      active: true,
      lastContactedAt: new Date(),
      createdBy: userId
    });

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'runner_registered',
      entityType: 'runner',
      entityId: runner.id,
      metadata: { name, runnerType, tags }
    });

    return runner;
  }

  /**
   * Get all runners
   */
  async getRunners(filters = {}) {
    const where = {};

    if (filters.runnerType) {
      where.runnerType = filters.runnerType;
    }

    if (filters.active !== undefined) {
      where.active = filters.active;
    }

    if (filters.tags && filters.tags.length > 0) {
      where.tags = {
        [this.GitRunner.sequelize.Sequelize.Op.overlap]: filters.tags
      };
    }

    return this.GitRunner.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Get runner by ID
   */
  async getRunner(id) {
    const runner = await this.GitRunner.findByPk(id);

    if (!runner) {
      throw new Error('Runner not found');
    }

    return runner;
  }

  /**
   * Update runner
   */
  async updateRunner(id, updates, userId) {
    const runner = await this.getRunner(id);

    await runner.update(updates);

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'runner_updated',
      entityType: 'runner',
      entityId: id,
      metadata: { name: runner.name }
    });

    return runner;
  }

  /**
   * Delete runner
   */
  async deleteRunner(id, userId) {
    const runner = await this.getRunner(id);

    await runner.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'runner_deleted',
      entityType: 'runner',
      entityId: id,
      metadata: { name: runner.name, runnerType: runner.runnerType }
    });

    return { success: true, message: 'Runner deleted' };
  }

  /**
   * Update runner heartbeat
   */
  async updateRunnerHeartbeat(id, runnerInfo = {}) {
    const runner = await this.getRunner(id);

    const updates = {
      lastContactedAt: new Date()
    };

    if (runnerInfo.version) updates.version = runnerInfo.version;
    if (runnerInfo.platform) updates.platform = runnerInfo.platform;
    if (runnerInfo.architecture) updates.architecture = runnerInfo.architecture;

    await runner.update(updates);

    return runner;
  }

  /**
   * Get available runner for job
   */
  async getAvailableRunner(requiredTags = [], runnerType = null) {
    const where = { active: true };

    if (runnerType) {
      where.runnerType = runnerType;
    }

    const runners = await this.GitRunner.findAll({ where });

    // Filter by tags if required
    let matchingRunners = runners;
    if (requiredTags.length > 0) {
      matchingRunners = runners.filter(runner => {
        return requiredTags.every(tag => runner.tags.includes(tag));
      });
    }

    // Check for stale runners (no contact in 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeRunners = matchingRunners.filter(runner => {
      return runner.lastContactedAt && new Date(runner.lastContactedAt) > fiveMinutesAgo;
    });

    if (activeRunners.length === 0) {
      return null;
    }

    // Return first available (could implement load balancing here)
    return activeRunners[0];
  }

  /**
   * Get runner statistics
   */
  async getRunnerStats() {
    const runners = await this.GitRunner.findAll();

    const stats = {
      total: runners.length,
      active: 0,
      byType: {},
      offline: 0
    };

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    for (const runner of runners) {
      // Count by type
      stats.byType[runner.runnerType] = (stats.byType[runner.runnerType] || 0) + 1;

      // Count active
      if (runner.active && runner.lastContactedAt && new Date(runner.lastContactedAt) > fiveMinutesAgo) {
        stats.active++;
      } else {
        stats.offline++;
      }
    }

    return stats;
  }

  // ═══════════════════════════════════════════════════════════
  // Pipeline Cache Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Store cache entry
   */
  async storeCache(repositoryId, cacheData) {
    const {
      key,
      scope = 'branch',
      scopeValue,
      storagePath,
      size,
      checksum,
      expiresAt = null
    } = cacheData;

    // Check if cache entry exists
    const [cache, created] = await this.GitPipelineCache.findOrCreate({
      where: { repositoryId, key, scope, scopeValue },
      defaults: {
        repositoryId,
        key,
        scope,
        scopeValue,
        storagePath,
        size,
        checksum,
        expiresAt,
        lastAccessedAt: new Date(),
        accessCount: 0
      }
    });

    if (!created) {
      await cache.update({
        storagePath,
        size,
        checksum,
        expiresAt,
        lastAccessedAt: new Date(),
        accessCount: cache.accessCount + 1
      });
    }

    return cache;
  }

  /**
   * Get cache entry
   */
  async getCache(repositoryId, key, scope = 'branch', scopeValue = null) {
    const cache = await this.GitPipelineCache.findOne({
      where: { repositoryId, key, scope, scopeValue }
    });

    if (!cache) {
      return null;
    }

    // Check expiration
    if (cache.expiresAt && new Date(cache.expiresAt) < new Date()) {
      await cache.destroy();
      return null;
    }

    // Update access
    await cache.update({
      lastAccessedAt: new Date(),
      accessCount: cache.accessCount + 1
    });

    return cache;
  }

  /**
   * Delete cache entry
   */
  async deleteCache(cacheId) {
    const cache = await this.GitPipelineCache.findByPk(cacheId);

    if (!cache) {
      throw new Error('Cache entry not found');
    }

    await cache.destroy();

    return { success: true, message: 'Cache deleted' };
  }

  /**
   * Clear repository cache
   */
  async clearRepositoryCache(repositoryId, scope = null) {
    const where = { repositoryId };

    if (scope) {
      where.scope = scope;
    }

    const deleted = await this.GitPipelineCache.destroy({ where });

    return { success: true, deleted };
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanupExpiredCache() {
    const deleted = await this.GitPipelineCache.destroy({
      where: {
        expiresAt: {
          [this.GitPipelineCache.sequelize.Sequelize.Op.lt]: new Date()
        }
      }
    });

    return { success: true, deleted };
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(repositoryId = null) {
    const where = repositoryId ? { repositoryId } : {};

    const caches = await this.GitPipelineCache.findAll({ where });

    const stats = {
      totalEntries: caches.length,
      totalSize: 0,
      byScope: {},
      mostAccessed: null
    };

    let maxAccess = 0;

    for (const cache of caches) {
      stats.totalSize += cache.size;

      // Count by scope
      stats.byScope[cache.scope] = (stats.byScope[cache.scope] || 0) + 1;

      // Track most accessed
      if (cache.accessCount > maxAccess) {
        maxAccess = cache.accessCount;
        stats.mostAccessed = {
          key: cache.key,
          accessCount: cache.accessCount
        };
      }
    }

    return stats;
  }

  // ═══════════════════════════════════════════════════════════
  // Pipeline Artifact Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Store pipeline artifact
   */
  async storeArtifact(pipelineRunId, artifactData) {
    const {
      name,
      artifactType = 'archive',
      storagePath,
      size,
      mimeType,
      checksum,
      expiresAt = null
    } = artifactData;

    const artifact = await this.GitPipelineArtifact.create({
      pipelineRunId,
      name,
      artifactType,
      storagePath,
      size,
      mimeType,
      checksum,
      expiresAt,
      downloadCount: 0
    });

    return artifact;
  }

  /**
   * Get artifacts for pipeline run
   */
  async getArtifacts(pipelineRunId) {
    return this.GitPipelineArtifact.findAll({
      where: { pipelineRunId },
      order: [['createdAt', 'DESC']]
    });
  }

  /**
   * Get artifact by ID
   */
  async getArtifact(artifactId) {
    const artifact = await this.GitPipelineArtifact.findByPk(artifactId);

    if (!artifact) {
      throw new Error('Artifact not found');
    }

    // Check expiration
    if (artifact.expiresAt && new Date(artifact.expiresAt) < new Date()) {
      throw new Error('Artifact has expired');
    }

    // Increment download count
    await artifact.update({
      downloadCount: artifact.downloadCount + 1
    });

    return artifact;
  }

  /**
   * Delete artifact
   */
  async deleteArtifact(artifactId) {
    const artifact = await this.GitPipelineArtifact.findByPk(artifactId);

    if (!artifact) {
      throw new Error('Artifact not found');
    }

    await artifact.destroy();

    return { success: true, message: 'Artifact deleted' };
  }

  /**
   * Cleanup expired artifacts
   */
  async cleanupExpiredArtifacts() {
    const deleted = await this.GitPipelineArtifact.destroy({
      where: {
        expiresAt: {
          [this.GitPipelineArtifact.sequelize.Sequelize.Op.lt]: new Date()
        }
      }
    });

    return { success: true, deleted };
  }

  // ═══════════════════════════════════════════════════════════
  // Audit Logging
  // ═══════════════════════════════════════════════════════════

  /**
   * Create audit log entry
   */
  async createAuditLog(logData) {
    const {
      userId,
      action,
      entityType,
      entityId,
      repositoryId = null,
      metadata = {}
    } = logData;

    return this.GitAuditLog.create({
      userId,
      action,
      entityType,
      entityId,
      repositoryId,
      metadata,
      timestamp: new Date()
    });
  }
}

module.exports = GitRunnerService;
