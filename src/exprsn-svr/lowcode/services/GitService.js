/**
 * ═══════════════════════════════════════════════════════════
 * Git Service
 * Core Git operations and repository management
 * ═══════════════════════════════════════════════════════════
 */

const simpleGit = require('simple-git');
const path = require('path');
const fs = require('fs').promises;
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');
const GitRepository = require('../models/GitRepository');
const GitBranch = require('../models/GitBranch');
const GitCommit = require('../models/GitCommit');
const { Op } = require('sequelize');

class GitService {
  constructor() {
    this.reposBasePath = path.join(__dirname, '../../../git-repositories');
  }

  /**
   * Initialize a new Git repository
   */
  async createRepository({ name, description, visibility, ownerId, applicationId, htmlProjectId }) {
    try {
      // Generate slug from name
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

      // Check if slug already exists
      const existing = await GitRepository.findOne({ where: { slug } });
      if (existing) {
        throw new Error('Repository with this name already exists');
      }

      // Create repository record
      const repository = await GitRepository.create({
        id: uuidv4(),
        name,
        slug,
        description,
        visibility,
        ownerId,
        applicationId,
        htmlProjectId,
        defaultBranch: 'main',
        cloneUrl: `/git/${slug}.git`,
        sshUrl: `git@exprsn.io:${slug}.git`
      });

      // Create physical repository
      const repoPath = path.join(this.reposBasePath, slug);
      await fs.mkdir(repoPath, { recursive: true });

      const git = simpleGit(repoPath);
      await git.init();
      await git.checkoutLocalBranch('main');

      // Create initial commit
      const readmePath = path.join(repoPath, 'README.md');
      await fs.writeFile(readmePath, `# ${name}\n\n${description || 'No description provided.'}\n`);

      await git.add('README.md');
      const commitResult = await git.commit('Initial commit', ['README.md']);

      // Record the commit
      await this.recordCommit(repository.id, commitResult.commit, 'Initial commit', {
        authorName: 'System',
        authorEmail: 'system@exprsn.io'
      });

      // Create main branch record
      await GitBranch.create({
        id: uuidv4(),
        repositoryId: repository.id,
        name: 'main',
        commitSha: commitResult.commit,
        createdBy: ownerId
      });

      logger.info(`Git repository created: ${slug}`, { repositoryId: repository.id });

      return repository;
    } catch (error) {
      logger.error('Failed to create Git repository:', error);
      throw error;
    }
  }

  /**
   * Get repository by ID or slug
   */
  async getRepository(identifier) {
    const where = identifier.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      ? { id: identifier }
      : { slug: identifier };

    return await GitRepository.findOne({ where });
  }

  /**
   * List repositories with filters
   */
  async listRepositories({ ownerId, applicationId, htmlProjectId, visibility, archived, limit = 50, offset = 0 }) {
    const where = {};

    if (ownerId) where.ownerId = ownerId;
    if (applicationId) where.applicationId = applicationId;
    if (htmlProjectId) where.htmlProjectId = htmlProjectId;
    if (visibility) where.visibility = visibility;
    if (archived !== undefined) where.archived = archived;

    const { count, rows } = await GitRepository.findAndCountAll({
      where,
      limit,
      offset,
      order: [['updatedAt', 'DESC']]
    });

    return { total: count, repositories: rows, limit, offset };
  }

  /**
   * Create a new branch
   */
  async createBranch(repositoryId, { name, sourceBranch = 'main', createdBy }) {
    try {
      const repository = await this.getRepository(repositoryId);
      if (!repository) {
        throw new Error('Repository not found');
      }

      const repoPath = path.join(this.reposBasePath, repository.slug);
      const git = simpleGit(repoPath);

      // Checkout source branch first
      await git.checkout(sourceBranch);
      const log = await git.log(['-1']);
      const commitSha = log.latest.hash;

      // Create new branch
      await git.checkoutLocalBranch(name);

      // Record branch
      const branch = await GitBranch.create({
        id: uuidv4(),
        repositoryId: repository.id,
        name,
        commitSha,
        createdBy
      });

      logger.info(`Branch created: ${name}`, { repositoryId, branchId: branch.id });

      return branch;
    } catch (error) {
      logger.error('Failed to create branch:', error);
      throw error;
    }
  }

  /**
   * List branches for a repository
   */
  async listBranches(repositoryId) {
    const branches = await GitBranch.findAll({
      where: { repositoryId },
      order: [['createdAt', 'DESC']]
    });

    return branches;
  }

  /**
   * Get branch by name
   */
  async getBranch(repositoryId, branchName) {
    return await GitBranch.findOne({
      where: { repositoryId, name: branchName }
    });
  }

  /**
   * Delete a branch
   */
  async deleteBranch(repositoryId, branchName) {
    const repository = await this.getRepository(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    if (branchName === repository.defaultBranch) {
      throw new Error('Cannot delete default branch');
    }

    const branch = await this.getBranch(repositoryId, branchName);
    if (!branch) {
      throw new Error('Branch not found');
    }

    if (branch.isProtected) {
      throw new Error('Cannot delete protected branch');
    }

    // Delete from Git
    const repoPath = path.join(this.reposBasePath, repository.slug);
    const git = simpleGit(repoPath);
    await git.deleteLocalBranch(branchName);

    // Delete record
    await branch.destroy();

    logger.info(`Branch deleted: ${branchName}`, { repositoryId, branchId: branch.id });
  }

  /**
   * Commit changes to a branch
   */
  async commit(repositoryId, { branch, message, files, author }) {
    try {
      const repository = await this.getRepository(repositoryId);
      if (!repository) {
        throw new Error('Repository not found');
      }

      const repoPath = path.join(this.reposBasePath, repository.slug);
      const git = simpleGit(repoPath);

      // Checkout branch
      await git.checkout(branch);

      // Write files
      for (const file of files) {
        const filePath = path.join(repoPath, file.path);
        const fileDir = path.dirname(filePath);
        await fs.mkdir(fileDir, { recursive: true });
        await fs.writeFile(filePath, file.content);
      }

      // Stage and commit
      await git.add('.');
      const commitResult = await git.commit(message, files.map(f => f.path), {
        '--author': `${author.name} <${author.email}>`
      });

      // Record commit
      const commit = await this.recordCommit(repository.id, commitResult.commit, message, author);

      // Update branch
      await GitBranch.update(
        { commitSha: commitResult.commit },
        { where: { repositoryId: repository.id, name: branch } }
      );

      logger.info(`Commit created: ${commitResult.commit}`, { repositoryId, branch });

      return commit;
    } catch (error) {
      logger.error('Failed to commit:', error);
      throw error;
    }
  }

  /**
   * Record a commit in the database
   */
  async recordCommit(repositoryId, sha, message, author) {
    const repository = await this.getRepository(repositoryId);
    const repoPath = path.join(this.reposBasePath, repository.slug);
    const git = simpleGit(repoPath);

    const log = await git.show([sha, '--numstat', '--format=%H%n%P%n%T%n%an%n%ae%n%cn%n%ce%n%ct']);
    const lines = log.split('\n');

    let additions = 0;
    let deletions = 0;
    let filesChanged = 0;

    // Parse numstat output
    for (const line of lines) {
      const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
      if (match) {
        additions += parseInt(match[1]);
        deletions += parseInt(match[2]);
        filesChanged++;
      }
    }

    const commit = await GitCommit.create({
      id: uuidv4(),
      repositoryId,
      sha,
      message,
      authorName: author.name,
      authorEmail: author.email,
      authorId: author.id || null,
      committerName: author.name,
      committerEmail: author.email,
      parentShas: lines[1] ? lines[1].split(' ') : [],
      treeSha: lines[2],
      additions,
      deletions,
      filesChanged,
      committedAt: new Date(parseInt(lines[7]) * 1000)
    });

    return commit;
  }

  /**
   * Get commit history
   */
  async getCommits(repositoryId, { branch, limit = 50, offset = 0 }) {
    const where = { repositoryId };

    if (branch) {
      const branchRecord = await this.getBranch(repositoryId, branch);
      if (!branchRecord) {
        throw new Error('Branch not found');
      }
      // In a full implementation, we'd filter commits reachable from this branch
    }

    const { count, rows } = await GitCommit.findAndCountAll({
      where,
      limit,
      offset,
      order: [['committedAt', 'DESC']]
    });

    return { total: count, commits: rows, limit, offset };
  }

  /**
   * Get file tree at a specific commit
   */
  async getTree(repositoryId, { ref = 'main', path: filePath = '' }) {
    const repository = await this.getRepository(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    const repoPath = path.join(this.reposBasePath, repository.slug);
    const git = simpleGit(repoPath);

    const tree = await git.raw(['ls-tree', '-l', ref, filePath]);
    const entries = tree.split('\n').filter(line => line.trim()).map(line => {
      const match = line.match(/^(\d+)\s+(\w+)\s+([a-f0-9]+)\s+(\d+|-)\s+(.+)$/);
      if (!match) return null;

      return {
        mode: match[1],
        type: match[2],
        sha: match[3],
        size: match[4] === '-' ? 0 : parseInt(match[4]),
        path: match[5]
      };
    }).filter(Boolean);

    return entries;
  }

  /**
   * Get file content
   */
  async getFileContent(repositoryId, { ref = 'main', path: filePath }) {
    const repository = await this.getRepository(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    const repoPath = path.join(this.reposBasePath, repository.slug);
    const git = simpleGit(repoPath);

    const content = await git.show([`${ref}:${filePath}`]);

    return {
      content,
      path: filePath,
      ref
    };
  }

  /**
   * Get diff between two refs
   */
  async getDiff(repositoryId, { base, head, filePath }) {
    const repository = await this.getRepository(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    const repoPath = path.join(this.reposBasePath, repository.slug);
    const git = simpleGit(repoPath);

    const args = ['diff', base, head];
    if (filePath) {
      args.push('--', filePath);
    }

    const diff = await git.raw(args);

    return {
      base,
      head,
      diff
    };
  }

  /**
   * Merge branches
   */
  async mergeBranches(repositoryId, { sourceBranch, targetBranch, message, mergedBy }) {
    const repository = await this.getRepository(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    const repoPath = path.join(this.reposBasePath, repository.slug);
    const git = simpleGit(repoPath);

    // Checkout target branch
    await git.checkout(targetBranch);

    // Attempt merge
    try {
      await git.merge([sourceBranch, '-m', message]);

      const log = await git.log(['-1']);
      const mergeCommit = log.latest.hash;

      // Update target branch record
      await GitBranch.update(
        { commitSha: mergeCommit },
        { where: { repositoryId: repository.id, name: targetBranch } }
      );

      logger.info(`Branches merged: ${sourceBranch} -> ${targetBranch}`, { repositoryId });

      return { success: true, commitSha: mergeCommit };
    } catch (error) {
      // Check for conflicts
      const status = await git.status();
      if (status.conflicted.length > 0) {
        return {
          success: false,
          conflicts: status.conflicted,
          message: 'Merge conflicts detected'
        };
      }
      throw error;
    }
  }

  /**
   * Clone repository (for forks)
   */
  async cloneRepository(sourceRepositoryId, { name, ownerId }) {
    const sourceRepo = await this.getRepository(sourceRepositoryId);
    if (!sourceRepo) {
      throw new Error('Source repository not found');
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const sourceRepoPath = path.join(this.reposBasePath, sourceRepo.slug);
    const targetRepoPath = path.join(this.reposBasePath, slug);

    // Clone physically
    await simpleGit().clone(sourceRepoPath, targetRepoPath);

    // Create repository record
    const repository = await GitRepository.create({
      id: uuidv4(),
      name,
      slug,
      description: sourceRepo.description,
      visibility: sourceRepo.visibility,
      ownerId,
      defaultBranch: sourceRepo.defaultBranch,
      isFork: true,
      parentId: sourceRepo.id,
      cloneUrl: `/git/${slug}.git`,
      sshUrl: `git@exprsn.io:${slug}.git`
    });

    // Update fork count
    await GitRepository.increment('forksCount', { where: { id: sourceRepo.id } });

    logger.info(`Repository forked: ${sourceRepo.slug} -> ${slug}`, { repositoryId: repository.id });

    return repository;
  }

  /**
   * Archive/unarchive repository
   */
  async archiveRepository(repositoryId, archived = true) {
    await GitRepository.update(
      { archived },
      { where: { id: repositoryId } }
    );

    logger.info(`Repository ${archived ? 'archived' : 'unarchived'}`, { repositoryId });
  }

  /**
   * Delete repository
   */
  async deleteRepository(repositoryId) {
    const repository = await this.getRepository(repositoryId);
    if (!repository) {
      throw new Error('Repository not found');
    }

    const repoPath = path.join(this.reposBasePath, repository.slug);

    // Delete physical repository
    await fs.rm(repoPath, { recursive: true, force: true });

    // Delete database record (cascades to branches, commits, etc.)
    await repository.destroy();

    logger.info(`Repository deleted: ${repository.slug}`, { repositoryId });
  }
}

module.exports = new GitService();
