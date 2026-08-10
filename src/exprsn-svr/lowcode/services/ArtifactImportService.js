/**
 * Artifact Import Service
 *
 * Imports file-based artifacts from Git repository back into database.
 * Handles conflict detection and merge strategies.
 */

const fs = require('fs').promises;
const path = require('path');
const { Op } = require('sequelize');
const logger = require('@exprsn/shared').logger;

// Models
const Application = require('../models/Application');
const Entity = require('../models/Entity');
const AppForm = require('../models/AppForm');
const Grid = require('../models/Grid');
const Dashboard = require('../models/Dashboard');
// const Query = require('../models/Query'); // TODO: Query model doesn't exist yet
const Api = require('../models/Api');
const Process = require('../models/Process');
const DataSource = require('../models/DataSource');
const GitRepository = require('../models/GitRepository');

class ArtifactImportService {
  constructor() {
    this.gitReposPath = path.join(__dirname, '../../../../git-repositories');
  }

  /**
   * Import single artifact from file to database
   * @param {String} repositoryId - Git repository UUID
   * @param {String} relativePath - Path to artifact file (e.g., 'forms/contact-form.json')
   * @param {Object} options - { overwrite: boolean, createNew: boolean, applicationId: string }
   * @returns {Object} { success, artifact, conflict }
   */
  async importArtifact(repositoryId, relativePath, options = {}) {
    const { overwrite = false, createNew = false, applicationId = null } = options;

    try {
      // Get repository
      const repository = await GitRepository.findByPk(repositoryId);
      if (!repository) {
        throw new Error(`Repository not found: ${repositoryId}`);
      }

      const repoPath = path.join(this.gitReposPath, repository.name);
      const filePath = path.join(repoPath, relativePath);

      // Read file
      const fileContent = await fs.readFile(filePath, 'utf8');
      const fileData = JSON.parse(fileContent);

      // Detect artifact type from path or data
      const artifactType = this._detectArtifactType(relativePath, fileData);

      // Check for existing artifact
      const existing = await this._findExistingArtifact(artifactType, fileData.id);

      // Conflict detection
      if (existing && !overwrite && !createNew) {
        const conflict = await this._detectConflict(existing, fileData);
        if (conflict.hasConflict) {
          return {
            success: false,
            conflict: true,
            conflictDetails: conflict,
            artifact: existing
          };
        }
      }

      // Import artifact
      let artifact;
      if (createNew || !existing) {
        artifact = await this._createArtifact(artifactType, fileData, applicationId);
      } else {
        artifact = await this._updateArtifact(artifactType, existing, fileData);
      }

      logger.info(`Imported ${artifactType} from ${relativePath}`);

      return {
        success: true,
        artifact,
        created: !existing,
        updated: !!existing
      };

    } catch (error) {
      logger.error(`Import failed for ${relativePath}`, error);
      throw error;
    }
  }

  /**
   * Import entire application from Git repository
   * @param {String} repositoryId - Git repository UUID
   * @param {String} applicationId - Target application UUID (optional, creates new if not provided)
   * @param {Object} options - { overwrite: boolean }
   * @returns {Object} { success, importedArtifacts, conflicts, errors }
   */
  async importApplication(repositoryId, applicationId = null, options = {}) {
    const { overwrite = false } = options;

    const results = {
      success: true,
      importedArtifacts: [],
      conflicts: [],
      errors: []
    };

    try {
      const repository = await GitRepository.findByPk(repositoryId);
      if (!repository) {
        throw new Error(`Repository not found: ${repositoryId}`);
      }

      const repoPath = path.join(this.gitReposPath, repository.name);

      // Import application metadata
      const appMetadataPath = path.join(repoPath, 'application.json');
      const appMetadata = JSON.parse(await fs.readFile(appMetadataPath, 'utf8'));

      let application;
      if (applicationId) {
        application = await Application.findByPk(applicationId);
        await application.update({
          name: appMetadata.name,
          description: appMetadata.description,
          version: appMetadata.version,
          settings: appMetadata.settings
        });
      } else {
        application = await Application.create({
          name: appMetadata.name,
          description: appMetadata.description,
          version: appMetadata.version,
          settings: appMetadata.settings,
          gitRepository: repository.remoteUrl || repository.name,
          gitBranch: 'main'
        });
      }

      // Import artifacts by type
      const artifactFolders = [
        'entities',
        'forms',
        'grids',
        'dashboards',
        'queries',
        'apis',
        'processes',
        'datasources'
      ];

      for (const folder of artifactFolders) {
        const folderPath = path.join(repoPath, folder);

        try {
          const files = await fs.readdir(folderPath);

          for (const file of files) {
            if (!file.endsWith('.json')) continue;

            const relativePath = `${folder}/${file}`;

            try {
              const result = await this.importArtifact(
                repositoryId,
                relativePath,
                { overwrite, applicationId: application.id }
              );

              if (result.conflict) {
                results.conflicts.push({
                  relativePath,
                  conflictDetails: result.conflictDetails
                });
              } else {
                results.importedArtifacts.push({
                  relativePath,
                  artifactId: result.artifact.id,
                  artifactType: result.artifact.type || folder.slice(0, -1),
                  created: result.created,
                  updated: result.updated
                });
              }

            } catch (error) {
              results.errors.push({
                relativePath,
                error: error.message
              });
            }
          }

        } catch (error) {
          // Folder doesn't exist, skip
          if (error.code !== 'ENOENT') {
            results.errors.push({
              folder,
              error: error.message
            });
          }
        }
      }

      logger.info(`Imported application: ${results.importedArtifacts.length} artifacts, ${results.conflicts.length} conflicts, ${results.errors.length} errors`);

      return results;

    } catch (error) {
      logger.error(`Application import failed`, error);
      results.success = false;
      results.errors.push({
        type: 'application',
        error: error.message
      });
      return results;
    }
  }

  /**
   * Detect artifact type from path or file data
   * @private
   */
  _detectArtifactType(relativePath, fileData) {
    // Try from file data first
    if (fileData.type) {
      return fileData.type;
    }

    // Detect from path
    const folderMap = {
      'entities': 'entity',
      'forms': 'form',
      'grids': 'grid',
      'dashboards': 'dashboard',
      'queries': 'query',
      'apis': 'api',
      'processes': 'process',
      'datasources': 'datasource'
    };

    const folder = relativePath.split('/')[0];
    return folderMap[folder] || 'unknown';
  }

  /**
   * Find existing artifact in database
   * @private
   */
  async _findExistingArtifact(artifactType, artifactId) {
    const modelMap = {
      'entity': Entity,
      'form': AppForm,
      'grid': Grid,
      'dashboard': Dashboard,
      // 'query': Query, // TODO: Query model doesn't exist yet
      'api': Api,
      'process': Process,
      'datasource': DataSource
    };

    const Model = modelMap[artifactType];
    if (!Model) {
      throw new Error(`Unknown artifact type: ${artifactType}`);
    }

    return await Model.findByPk(artifactId);
  }

  /**
   * Detect conflicts between existing and file data
   * @private
   */
  async _detectConflict(existing, fileData) {
    const conflict = {
      hasConflict: false,
      type: null,
      existingVersion: existing.version,
      fileVersion: fileData.version,
      existingUpdatedAt: existing.updatedAt,
      fileUpdatedAt: new Date(fileData.updatedAt)
    };

    // Version conflict
    if (existing.version !== fileData.version) {
      conflict.hasConflict = true;
      conflict.type = 'version_mismatch';
      return conflict;
    }

    // Timestamp conflict (file is older than database)
    const existingTime = new Date(existing.updatedAt).getTime();
    const fileTime = new Date(fileData.updatedAt).getTime();

    if (fileTime < existingTime) {
      conflict.hasConflict = true;
      conflict.type = 'database_newer';
      return conflict;
    }

    return conflict;
  }

  /**
   * Create new artifact in database
   * @private
   */
  async _createArtifact(artifactType, fileData, applicationId) {
    const modelMap = {
      'entity': Entity,
      'form': AppForm,
      'grid': Grid,
      'dashboard': Dashboard,
      // 'query': Query, // TODO: Query model doesn't exist yet
      'api': Api,
      'process': Process,
      'datasource': DataSource
    };

    const Model = modelMap[artifactType];
    if (!Model) {
      throw new Error(`Unknown artifact type: ${artifactType}`);
    }

    // Convert file data to database format
    const dbData = this._convertFromFileFormat(artifactType, fileData);

    // Add applicationId if provided
    if (applicationId) {
      dbData.applicationId = applicationId;
    }

    return await Model.create(dbData);
  }

  /**
   * Update existing artifact in database
   * @private
   */
  async _updateArtifact(artifactType, existing, fileData) {
    const dbData = this._convertFromFileFormat(artifactType, fileData);
    await existing.update(dbData);
    return existing;
  }

  /**
   * Convert file format to database format
   * @private
   */
  _convertFromFileFormat(artifactType, fileData) {
    // Remove metadata fields that shouldn't be updated
    const { id, createdAt, type, ...data } = fileData;

    return data;
  }

  /**
   * Get changed files between database and Git
   * @param {String} repositoryId - Git repository UUID
   * @param {String} applicationId - Application UUID
   * @returns {Array} List of changed files
   */
  async getChangedFiles(repositoryId, applicationId) {
    const changedFiles = [];

    try {
      const repository = await GitRepository.findByPk(repositoryId);
      const repoPath = path.join(this.gitReposPath, repository.name);

      // Get all artifacts for application
      const entities = await Entity.findAll({ where: { applicationId } });
      const forms = await AppForm.findAll({ where: { applicationId } });
      const grids = await Grid.findAll({ where: { applicationId } });
      const dashboards = await Dashboard.findAll({ where: { applicationId } });
      // const queries = await Query.findAll({ where: { applicationId } }); // TODO: Query model doesn't exist
      const apis = await Api.findAll({ where: { applicationId } });
      const processes = await Process.findAll({ where: { applicationId } });
      const dataSources = await DataSource.findAll({ where: { applicationId } });

      const allArtifacts = [
        ...entities.map(e => ({ type: 'entity', artifact: e })),
        ...forms.map(f => ({ type: 'form', artifact: f })),
        ...grids.map(g => ({ type: 'grid', artifact: g })),
        ...dashboards.map(d => ({ type: 'dashboard', artifact: d })),
        // ...queries.map(q => ({ type: 'query', artifact: q })), // TODO: Query model doesn't exist
        ...apis.map(a => ({ type: 'api', artifact: a })),
        ...processes.map(p => ({ type: 'process', artifact: p })),
        ...dataSources.map(ds => ({ type: 'datasource', artifact: ds }))
      ];

      // Check each artifact for changes
      for (const { type, artifact } of allArtifacts) {
        const relativePath = this._getRelativePathForArtifact(type, artifact);
        const filePath = path.join(repoPath, relativePath);

        try {
          const fileContent = await fs.readFile(filePath, 'utf8');
          const fileData = JSON.parse(fileContent);

          // Compare timestamps
          const dbTime = new Date(artifact.updatedAt).getTime();
          const fileTime = new Date(fileData.updatedAt).getTime();

          if (dbTime !== fileTime) {
            changedFiles.push({
              path: relativePath,
              type,
              status: dbTime > fileTime ? 'modified' : 'outdated',
              dbUpdatedAt: artifact.updatedAt,
              fileUpdatedAt: fileData.updatedAt
            });
          }
        } catch (error) {
          // File doesn't exist - artifact is new
          if (error.code === 'ENOENT') {
            changedFiles.push({
              path: relativePath,
              type,
              status: 'added',
              dbUpdatedAt: artifact.updatedAt,
              fileUpdatedAt: null
            });
          }
        }
      }

      return changedFiles;

    } catch (error) {
      logger.error('Failed to get changed files', error);
      throw error;
    }
  }

  /**
   * Get relative path for artifact
   * @private
   */
  _getRelativePathForArtifact(artifactType, artifact) {
    const folderMap = {
      'entity': 'entities',
      'form': 'forms',
      'grid': 'grids',
      'dashboard': 'dashboards',
      'query': 'queries',
      'api': 'apis',
      'process': 'processes',
      'datasource': 'datasources'
    };

    const folder = folderMap[artifactType] || 'artifacts';
    const fileName = artifact.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return `${folder}/${fileName}.json`;
  }
}

module.exports = new ArtifactImportService();
