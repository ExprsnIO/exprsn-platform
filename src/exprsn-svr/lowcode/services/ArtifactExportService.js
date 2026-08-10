/**
 * Artifact Export Service
 *
 * Converts database JSONB artifacts to file-based format for Git integration.
 * Supports all low-code artifact types with metadata preservation.
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

class ArtifactExportService {
  constructor() {
    this.gitReposPath = path.join(__dirname, '../../../../git-repositories');
  }

  /**
   * Export a single artifact to file
   * @param {String} artifactType - 'entity', 'form', 'grid', etc.
   * @param {String} artifactId - UUID of artifact
   * @param {String} repositoryId - Git repository UUID
   * @returns {Object} { success, filePath, relativePath }
   */
  async exportArtifact(artifactType, artifactId, repositoryId) {
    try {
      // Get repository
      const repository = await GitRepository.findByPk(repositoryId);
      if (!repository) {
        throw new Error(`Repository not found: ${repositoryId}`);
      }

      const repoPath = path.join(this.gitReposPath, repository.name);

      // Get artifact data
      const artifact = await this._getArtifact(artifactType, artifactId);
      if (!artifact) {
        throw new Error(`${artifactType} not found: ${artifactId}`);
      }

      // Convert to file format
      const fileData = this._convertToFileFormat(artifactType, artifact);

      // Determine file path
      const relativePath = this._getRelativePath(artifactType, artifact);
      const absolutePath = path.join(repoPath, relativePath);

      // Ensure directory exists
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });

      // Write file
      await fs.writeFile(
        absolutePath,
        JSON.stringify(fileData, null, 2),
        'utf8'
      );

      logger.info(`Exported ${artifactType}:${artifactId} to ${relativePath}`);

      return {
        success: true,
        filePath: absolutePath,
        relativePath,
        artifactId,
        artifactType
      };

    } catch (error) {
      logger.error(`Export failed for ${artifactType}:${artifactId}`, error);
      throw error;
    }
  }

  /**
   * Export entire application to Git repository
   * @param {String} applicationId - Application UUID
   * @param {String} repositoryId - Git repository UUID
   * @returns {Object} { success, exportedFiles, errors }
   */
  async exportApplication(applicationId, repositoryId) {
    const results = {
      success: true,
      exportedFiles: [],
      errors: []
    };

    try {
      // Get application
      const application = await Application.findByPk(applicationId);
      if (!application) {
        throw new Error(`Application not found: ${applicationId}`);
      }

      // Export application metadata
      const appResult = await this._exportApplicationMetadata(
        application,
        repositoryId
      );
      results.exportedFiles.push(appResult);

      // Export all entities
      const entities = await Entity.findAll({
        where: { applicationId }
      });
      for (const entity of entities) {
        try {
          const result = await this.exportArtifact('entity', entity.id, repositoryId);
          results.exportedFiles.push(result);
        } catch (error) {
          results.errors.push({
            artifactType: 'entity',
            artifactId: entity.id,
            error: error.message
          });
        }
      }

      // Export all forms
      const forms = await AppForm.findAll({
        where: { applicationId }
      });
      for (const form of forms) {
        try {
          const result = await this.exportArtifact('form', form.id, repositoryId);
          results.exportedFiles.push(result);
        } catch (error) {
          results.errors.push({
            artifactType: 'form',
            artifactId: form.id,
            error: error.message
          });
        }
      }

      // Export all grids
      const grids = await Grid.findAll({
        where: { applicationId }
      });
      for (const grid of grids) {
        try {
          const result = await this.exportArtifact('grid', grid.id, repositoryId);
          results.exportedFiles.push(result);
        } catch (error) {
          results.errors.push({
            artifactType: 'grid',
            artifactId: grid.id,
            error: error.message
          });
        }
      }

      // Export all dashboards
      const dashboards = await Dashboard.findAll({
        where: { applicationId }
      });
      for (const dashboard of dashboards) {
        try {
          const result = await this.exportArtifact('dashboard', dashboard.id, repositoryId);
          results.exportedFiles.push(result);
        } catch (error) {
          results.errors.push({
            artifactType: 'dashboard',
            artifactId: dashboard.id,
            error: error.message
          });
        }
      }

      // Export all queries - TODO: Query model doesn't exist yet
      // const queries = await Query.findAll({
      //   where: { applicationId }
      // });
      // for (const query of queries) {
      //   try {
      //     const result = await this.exportArtifact('query', query.id, repositoryId);
      //     results.exportedFiles.push(result);
      //   } catch (error) {
      //     results.errors.push({
      //       artifactType: 'query',
      //       artifactId: query.id,
      //       error: error.message
      //     });
      //   }
      // }

      // Export all APIs
      const apis = await Api.findAll({
        where: { applicationId }
      });
      for (const api of apis) {
        try {
          const result = await this.exportArtifact('api', api.id, repositoryId);
          results.exportedFiles.push(result);
        } catch (error) {
          results.errors.push({
            artifactType: 'api',
            artifactId: api.id,
            error: error.message
          });
        }
      }

      // Export all processes
      const processes = await Process.findAll({
        where: { applicationId }
      });
      for (const process of processes) {
        try {
          const result = await this.exportArtifact('process', process.id, repositoryId);
          results.exportedFiles.push(result);
        } catch (error) {
          results.errors.push({
            artifactType: 'process',
            artifactId: process.id,
            error: error.message
          });
        }
      }

      // Export all data sources
      const dataSources = await DataSource.findAll({
        where: { applicationId }
      });
      for (const dataSource of dataSources) {
        try {
          const result = await this.exportArtifact('datasource', dataSource.id, repositoryId);
          results.exportedFiles.push(result);
        } catch (error) {
          results.errors.push({
            artifactType: 'datasource',
            artifactId: dataSource.id,
            error: error.message
          });
        }
      }

      logger.info(`Exported application ${applicationId}: ${results.exportedFiles.length} files, ${results.errors.length} errors`);

      return results;

    } catch (error) {
      logger.error(`Application export failed: ${applicationId}`, error);
      results.success = false;
      results.errors.push({
        artifactType: 'application',
        error: error.message
      });
      return results;
    }
  }

  /**
   * Get artifact from database by type
   * @private
   */
  async _getArtifact(artifactType, artifactId) {
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
   * Convert database artifact to file format
   * @private
   */
  _convertToFileFormat(artifactType, artifact) {
    const baseFormat = {
      id: artifact.id,
      name: artifact.name,
      type: artifactType,
      version: artifact.version || '1.0.0',
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
      createdBy: artifact.createdBy,
      updatedBy: artifact.updatedBy
    };

    switch (artifactType) {
      case 'entity':
        return {
          ...baseFormat,
          tableName: artifact.tableName,
          schema: artifact.schema,
          indexes: artifact.indexes,
          relationships: artifact.relationships,
          description: artifact.description
        };

      case 'form':
        return {
          ...baseFormat,
          entityId: artifact.entityId,
          structure: artifact.structure,
          validation: artifact.validation,
          events: artifact.events,
          styling: artifact.styling,
          description: artifact.description
        };

      case 'grid':
        return {
          ...baseFormat,
          entityId: artifact.entityId,
          columns: artifact.columns,
          filters: artifact.filters,
          sorting: artifact.sorting,
          pagination: artifact.pagination,
          actions: artifact.actions
        };

      case 'dashboard':
        return {
          ...baseFormat,
          layout: artifact.layout,
          widgets: artifact.widgets,
          refreshInterval: artifact.refreshInterval,
          filters: artifact.filters
        };

      case 'query':
        return {
          ...baseFormat,
          dataSourceId: artifact.dataSourceId,
          queryConfig: artifact.queryConfig,
          parameters: artifact.parameters,
          caching: artifact.caching,
          timeout: artifact.timeout
        };

      case 'api':
        return {
          ...baseFormat,
          method: artifact.method,
          endpoint: artifact.endpoint,
          definition: artifact.definition,
          authentication: artifact.authentication,
          rateLimit: artifact.rateLimit
        };

      case 'process':
        return {
          ...baseFormat,
          processType: artifact.processType,
          definition: artifact.definition,
          triggers: artifact.triggers,
          enabled: artifact.enabled
        };

      case 'datasource':
        return {
          ...baseFormat,
          type: artifact.type,
          connectionConfig: this._sanitizeConnectionConfig(artifact.connectionConfig),
          description: artifact.description
        };

      default:
        return baseFormat;
    }
  }

  /**
   * Sanitize connection config (remove passwords, secrets)
   * @private
   */
  _sanitizeConnectionConfig(config) {
    if (!config) return config;

    const sanitized = { ...config };

    // Remove sensitive fields
    const sensitiveFields = ['password', 'apiKey', 'secret', 'token', 'credentials'];
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '***REDACTED***';
      }
    });

    return sanitized;
  }

  /**
   * Get relative file path for artifact
   * @private
   */
  _getRelativePath(artifactType, artifact) {
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
    const fileName = this._sanitizeFileName(artifact.name);

    return `${folder}/${fileName}.json`;
  }

  /**
   * Sanitize filename (convert to kebab-case, remove special chars)
   * @private
   */
  _sanitizeFileName(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * Export application metadata
   * @private
   */
  async _exportApplicationMetadata(application, repositoryId) {
    const repository = await GitRepository.findByPk(repositoryId);
    const repoPath = path.join(this.gitReposPath, repository.name);

    const metadata = {
      id: application.id,
      name: application.name,
      type: 'application',
      version: application.version,
      description: application.description,
      createdAt: application.createdAt,
      updatedAt: application.updatedAt,
      settings: application.settings,
      dependencies: application.dependencies || []
    };

    const filePath = path.join(repoPath, 'application.json');
    await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf8');

    return {
      success: true,
      filePath,
      relativePath: 'application.json',
      artifactType: 'application'
    };
  }

  /**
   * Generate .gitignore for repository
   */
  async generateGitignore(repositoryId) {
    const repository = await GitRepository.findByPk(repositoryId);
    const repoPath = path.join(this.gitReposPath, repository.name);

    const gitignoreContent = `# Exprsn Low-Code Platform
# Generated automatically

# Node modules (if NPM enabled)
node_modules/
package-lock.json

# Environment files
.env
.env.local
.env.*.local

# Logs
logs/
*.log

# Temporary files
.tmp/
temp/
*.tmp

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Build outputs (if applicable)
dist/
build/
.cache/
`;

    const filePath = path.join(repoPath, '.gitignore');
    await fs.writeFile(filePath, gitignoreContent, 'utf8');

    return { success: true, filePath };
  }

  /**
   * Generate README for repository
   */
  async generateReadme(repositoryId, applicationId) {
    const repository = await GitRepository.findByPk(repositoryId);
    const application = await Application.findByPk(applicationId);
    const repoPath = path.join(this.gitReposPath, repository.name);

    const readmeContent = `# ${application.name}

${application.description || 'Low-code application built with Exprsn Platform'}

## Application Info

- **Version:** ${application.version}
- **Created:** ${application.createdAt}
- **Last Updated:** ${application.updatedAt}

## Structure

- \`entities/\` - Data models and database schemas
- \`forms/\` - Form definitions and layouts
- \`grids/\` - Grid/table configurations
- \`dashboards/\` - Dashboard layouts
- \`queries/\` - Database queries
- \`apis/\` - API endpoint definitions
- \`processes/\` - Business process workflows
- \`datasources/\` - Data source connections

## Development

This application is managed by Exprsn Low-Code Platform.

### Importing Changes

To import changes from this repository back to the platform:

1. Commit your changes to Git
2. Open the application in Exprsn Low-Code Platform
3. Click "Git" → "Pull Changes"
4. Review and accept the import

### Deploying

Deploy this application using the CI/CD pipeline configured in the Git settings.

---

*Generated by Exprsn Low-Code Platform*
`;

    const filePath = path.join(repoPath, 'README.md');
    await fs.writeFile(filePath, readmeContent, 'utf8');

    return { success: true, filePath };
  }
}

module.exports = new ArtifactExportService();
