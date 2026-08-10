/**
 * ═══════════════════════════════════════════════════════════
 * Git Policy Service
 * Manages branch protection, merge policies, and code owners
 * ═══════════════════════════════════════════════════════════
 */

class GitPolicyService {
  constructor(models) {
    this.GitRepositoryPolicy = models.GitRepositoryPolicy;
    this.GitCodeOwner = models.GitCodeOwner;
    this.GitMergeTrain = models.GitMergeTrain;
    this.GitRepository = models.GitRepository;
    this.GitPullRequest = models.GitPullRequest;
    this.GitAuditLog = models.GitAuditLog;
  }

  // ═══════════════════════════════════════════════════════════
  // Repository Policy Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Create or update repository policy
   */
  async setRepositoryPolicy(repositoryId, branchPattern, policyData, userId) {
    const {
      requireApprovals = 1,
      requireCodeOwnerReview = false,
      requireStatusChecks = true,
      requiredStatusChecks = [],
      allowForcePush = false,
      allowDeletions = false,
      requireLinearHistory = false,
      mergeMethod = 'merge'
    } = policyData;

    // Validate repository exists
    await this.validateRepository(repositoryId);

    // Validate merge method
    const validMethods = ['merge', 'squash', 'rebase'];
    if (!validMethods.includes(mergeMethod)) {
      throw new Error(`Invalid merge method. Must be one of: ${validMethods.join(', ')}`);
    }

    const [policy, created] = await this.GitRepositoryPolicy.findOrCreate({
      where: { repositoryId, branchPattern },
      defaults: {
        repositoryId,
        branchPattern,
        requireApprovals,
        requireCodeOwnerReview,
        requireStatusChecks,
        requiredStatusChecks,
        allowForcePush,
        allowDeletions,
        requireLinearHistory,
        mergeMethod,
        createdBy: userId
      }
    });

    if (!created) {
      await policy.update({
        requireApprovals,
        requireCodeOwnerReview,
        requireStatusChecks,
        requiredStatusChecks,
        allowForcePush,
        allowDeletions,
        requireLinearHistory,
        mergeMethod
      });
    }

    // Audit log
    await this.createAuditLog({
      userId,
      action: created ? 'policy_created' : 'policy_updated',
      entityType: 'repository_policy',
      entityId: policy.id,
      repositoryId,
      metadata: { branchPattern, mergeMethod }
    });

    return policy;
  }

  /**
   * Get policies for repository
   */
  async getRepositoryPolicies(repositoryId) {
    await this.validateRepository(repositoryId);

    return this.GitRepositoryPolicy.findAll({
      where: { repositoryId },
      order: [['branchPattern', 'ASC']]
    });
  }

  /**
   * Get policy for specific branch
   */
  async getPolicyForBranch(repositoryId, branchName) {
    const policies = await this.getRepositoryPolicies(repositoryId);

    // Find exact match first
    let matchingPolicy = policies.find(p => p.branchPattern === branchName);

    // If no exact match, check wildcard patterns
    if (!matchingPolicy) {
      matchingPolicy = policies.find(p => {
        const pattern = p.branchPattern.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(branchName);
      });
    }

    return matchingPolicy;
  }

  /**
   * Delete repository policy
   */
  async deleteRepositoryPolicy(policyId, userId) {
    const policy = await this.GitRepositoryPolicy.findByPk(policyId);

    if (!policy) {
      throw new Error('Policy not found');
    }

    await policy.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'policy_deleted',
      entityType: 'repository_policy',
      entityId: policyId,
      repositoryId: policy.repositoryId,
      metadata: { branchPattern: policy.branchPattern }
    });

    return { success: true, message: 'Policy deleted' };
  }

  /**
   * Check if operation is allowed by policy
   */
  async checkPolicyCompliance(repositoryId, branchName, operation, context = {}) {
    const policy = await this.getPolicyForBranch(repositoryId, branchName);

    if (!policy) {
      // No policy = allow all
      return { allowed: true };
    }

    const violations = [];

    // Check force push
    if (operation === 'force_push' && !policy.allowForcePush) {
      violations.push('Force push is not allowed on this branch');
    }

    // Check deletion
    if (operation === 'delete' && !policy.allowDeletions) {
      violations.push('Branch deletion is not allowed');
    }

    // Check merge requirements
    if (operation === 'merge' && context.pullRequest) {
      const pr = context.pullRequest;

      if (policy.requireApprovals > 0 && pr.approvalsCount < policy.requireApprovals) {
        violations.push(`Requires ${policy.requireApprovals} approval(s), has ${pr.approvalsCount}`);
      }

      if (policy.requireStatusChecks && policy.requiredStatusChecks.length > 0) {
        const missingChecks = policy.requiredStatusChecks.filter(
          check => !context.passedStatusChecks?.includes(check)
        );
        if (missingChecks.length > 0) {
          violations.push(`Missing required status checks: ${missingChecks.join(', ')}`);
        }
      }

      if (policy.requireCodeOwnerReview && !context.codeOwnerApproved) {
        violations.push('Requires code owner approval');
      }
    }

    return {
      allowed: violations.length === 0,
      violations,
      policy
    };
  }

  // ═══════════════════════════════════════════════════════════
  // Code Owners Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Set code owner rule
   */
  async setCodeOwner(repositoryId, pathPattern, owners, options = {}) {
    const {
      teams = [],
      section = null,
      order = 0,
      userId
    } = options;

    await this.validateRepository(repositoryId);

    const [codeOwner, created] = await this.GitCodeOwner.findOrCreate({
      where: { repositoryId, pathPattern },
      defaults: {
        repositoryId,
        pathPattern,
        owners,
        teams,
        section,
        order,
        createdBy: userId
      }
    });

    if (!created) {
      await codeOwner.update({ owners, teams, section, order });
    }

    // Audit log
    await this.createAuditLog({
      userId,
      action: created ? 'code_owner_created' : 'code_owner_updated',
      entityType: 'code_owner',
      entityId: codeOwner.id,
      repositoryId,
      metadata: { pathPattern, ownerCount: owners.length }
    });

    return codeOwner;
  }

  /**
   * Get code owners for repository
   */
  async getCodeOwners(repositoryId) {
    await this.validateRepository(repositoryId);

    return this.GitCodeOwner.findAll({
      where: { repositoryId },
      order: [['order', 'ASC'], ['pathPattern', 'ASC']]
    });
  }

  /**
   * Get code owners for specific file path
   */
  async getOwnersForPath(repositoryId, filePath) {
    const codeOwners = await this.getCodeOwners(repositoryId);

    const matchingOwners = codeOwners
      .filter(co => {
        const pattern = co.pathPattern.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(filePath);
      })
      .sort((a, b) => b.order - a.order); // Higher order = higher priority

    // Get the highest priority match
    return matchingOwners[0] || null;
  }

  /**
   * Delete code owner rule
   */
  async deleteCodeOwner(codeOwnerId, userId) {
    const codeOwner = await this.GitCodeOwner.findByPk(codeOwnerId);

    if (!codeOwner) {
      throw new Error('Code owner rule not found');
    }

    await codeOwner.destroy();

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'code_owner_deleted',
      entityType: 'code_owner',
      entityId: codeOwnerId,
      repositoryId: codeOwner.repositoryId,
      metadata: { pathPattern: codeOwner.pathPattern }
    });

    return { success: true, message: 'Code owner rule deleted' };
  }

  /**
   * Generate CODEOWNERS file content
   */
  async generateCodeOwnersFile(repositoryId) {
    const codeOwners = await this.getCodeOwners(repositoryId);

    if (codeOwners.length === 0) {
      return null;
    }

    let content = '# CODEOWNERS\n# Auto-generated by Exprsn Git System\n\n';

    let currentSection = null;

    for (const co of codeOwners) {
      if (co.section && co.section !== currentSection) {
        content += `\n# ${co.section}\n`;
        currentSection = co.section;
      }

      const owners = [
        ...co.owners.map(id => `@user-${id}`),
        ...co.teams.map(team => `@team/${team}`)
      ].join(' ');

      content += `${co.pathPattern} ${owners}\n`;
    }

    return content;
  }

  // ═══════════════════════════════════════════════════════════
  // Merge Train Management
  // ═══════════════════════════════════════════════════════════

  /**
   * Add PR to merge train
   */
  async addToMergeTrain(repositoryId, pullRequestId, targetBranch, userId) {
    await this.validateRepository(repositoryId);

    // Get current position (last in queue)
    const lastEntry = await this.GitMergeTrain.findOne({
      where: { repositoryId, targetBranch, status: 'queued' },
      order: [['position', 'DESC']]
    });

    const position = lastEntry ? lastEntry.position + 1 : 1;

    const entry = await this.GitMergeTrain.create({
      repositoryId,
      pullRequestId,
      targetBranch,
      position,
      status: 'queued',
      enqueuedAt: new Date()
    });

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'merge_train_enqueued',
      entityType: 'merge_train',
      entityId: entry.id,
      repositoryId,
      metadata: { pullRequestId, targetBranch, position }
    });

    return entry;
  }

  /**
   * Get merge train for branch
   */
  async getMergeTrain(repositoryId, targetBranch) {
    return this.GitMergeTrain.findAll({
      where: {
        repositoryId,
        targetBranch,
        status: ['queued', 'processing']
      },
      include: [{
        model: this.GitPullRequest,
        as: 'pullRequest',
        attributes: ['id', 'number', 'title', 'createdBy']
      }],
      order: [['position', 'ASC']]
    });
  }

  /**
   * Process merge train (move to next PR)
   */
  async processNextInTrain(repositoryId, targetBranch) {
    const queue = await this.getMergeTrain(repositoryId, targetBranch);

    if (queue.length === 0) {
      return null;
    }

    const nextEntry = queue[0];

    // Update to processing
    await nextEntry.update({ status: 'processing' });

    return nextEntry;
  }

  /**
   * Complete merge train entry
   */
  async completeMergeTrainEntry(entryId, status, errorMessage = null, userId) {
    const entry = await this.GitMergeTrain.findByPk(entryId);

    if (!entry) {
      throw new Error('Merge train entry not found');
    }

    await entry.update({
      status,
      mergedAt: status === 'merged' ? new Date() : null,
      errorMessage
    });

    // Audit log
    await this.createAuditLog({
      userId,
      action: `merge_train_${status}`,
      entityType: 'merge_train',
      entityId: entryId,
      repositoryId: entry.repositoryId,
      metadata: { pullRequestId: entry.pullRequestId }
    });

    // Process next in queue if this one succeeded
    if (status === 'merged') {
      await this.processNextInTrain(entry.repositoryId, entry.targetBranch);
    }

    return entry;
  }

  /**
   * Remove from merge train
   */
  async removeFromMergeTrain(entryId, userId) {
    const entry = await this.GitMergeTrain.findByPk(entryId);

    if (!entry) {
      throw new Error('Merge train entry not found');
    }

    await entry.update({ status: 'cancelled' });

    // Reorder remaining entries
    await this.reorderMergeTrain(entry.repositoryId, entry.targetBranch);

    // Audit log
    await this.createAuditLog({
      userId,
      action: 'merge_train_cancelled',
      entityType: 'merge_train',
      entityId: entryId,
      repositoryId: entry.repositoryId,
      metadata: { pullRequestId: entry.pullRequestId }
    });

    return { success: true, message: 'Removed from merge train' };
  }

  /**
   * Reorder merge train positions
   */
  async reorderMergeTrain(repositoryId, targetBranch) {
    const entries = await this.GitMergeTrain.findAll({
      where: {
        repositoryId,
        targetBranch,
        status: 'queued'
      },
      order: [['position', 'ASC']]
    });

    for (let i = 0; i < entries.length; i++) {
      await entries[i].update({ position: i + 1 });
    }
  }

  // ═══════════════════════════════════════════════════════════
  // Helper Methods
  // ═══════════════════════════════════════════════════════════

  /**
   * Validate repository exists
   */
  async validateRepository(repositoryId) {
    const repo = await this.GitRepository.findByPk(repositoryId);
    if (!repo) {
      throw new Error('Repository not found');
    }
    return repo;
  }

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
      changes = {},
      metadata = {}
    } = logData;

    return this.GitAuditLog.create({
      userId,
      action,
      entityType,
      entityId,
      repositoryId,
      changes,
      metadata,
      timestamp: new Date()
    });
  }
}

module.exports = GitPolicyService;
