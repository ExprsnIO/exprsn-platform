/**
 * ═══════════════════════════════════════════════════════════
 * Git Setup Initialization Script
 * Initializes default Git/CI/CD configuration and templates
 * ═══════════════════════════════════════════════════════════
 */

const path = require('path');
const { sequelize, Sequelize } = require('../models');

// Import models dynamically to ensure they're loaded
const getModels = () => require('../models');

const initializeGitSetup = async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Git/CI/CD Setup Initialization');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Test database connection
    console.log('1. Testing database connection...');
    await sequelize.authenticate();
    console.log('   ✓ Database connection successful\n');

    const models = getModels();
    const {
      GitSystemConfig,
      GitRepositoryTemplate,
      GitIssueTemplate,
      GitRunner
    } = models;

    // 2. Create system-wide configurations
    console.log('2. Creating system-wide configurations...');

    const systemConfigs = [
      {
        key: 'git.default_branch',
        value: { branch: 'main' },
        type: 'system',
        encrypted: false
      },
      {
        key: 'git.max_repository_size_mb',
        value: { size: 5120 },
        type: 'system',
        encrypted: false
      },
      {
        key: 'git.enable_lfs',
        value: { enabled: true },
        type: 'system',
        encrypted: false
      },
      {
        key: 'cicd.max_pipeline_duration_minutes',
        value: { duration: 120 },
        type: 'cicd',
        encrypted: false
      },
      {
        key: 'cicd.max_concurrent_jobs',
        value: { count: 10 },
        type: 'cicd',
        encrypted: false
      },
      {
        key: 'cicd.artifact_retention_days',
        value: { days: 30 },
        type: 'cicd',
        encrypted: false
      },
      {
        key: 'security.enable_dependency_scanning',
        value: { enabled: true },
        type: 'security',
        encrypted: false
      },
      {
        key: 'security.enable_sast',
        value: { enabled: true },
        type: 'security',
        encrypted: false
      },
      {
        key: 'deployment.enable_auto_deploy',
        value: { enabled: false },
        type: 'deployment',
        encrypted: false
      },
      {
        key: 'integration.herald_url',
        value: { url: process.env.HERALD_URL || 'http://localhost:3014' },
        type: 'integration',
        encrypted: false
      },
      {
        key: 'integration.spark_url',
        value: { url: process.env.SPARK_URL || 'http://localhost:3002' },
        type: 'integration',
        encrypted: false
      },
      {
        key: 'integration.workflow_url',
        value: { url: process.env.WORKFLOW_URL || 'http://localhost:3017' },
        type: 'integration',
        encrypted: false
      }
    ];

    for (const config of systemConfigs) {
      await GitSystemConfig.findOrCreate({
        where: { key: config.key },
        defaults: config
      });
      console.log(`   ✓ ${config.key}`);
    }
    console.log(`   Created ${systemConfigs.length} system configurations\n`);

    // 3. Create default repository templates
    console.log('3. Creating repository templates...');

    const templates = [
      {
        name: 'Node.js Application',
        description: 'Basic Node.js application with Express',
        language: 'nodejs',
        framework: 'express',
        fileStructure: {
          'src/': {},
          'tests/': {},
          'public/': {},
          'config/': {}
        },
        defaultFiles: {
          'package.json': JSON.stringify({
            name: 'app',
            version: '1.0.0',
            main: 'src/index.js',
            scripts: {
              start: 'node src/index.js',
              test: 'jest'
            }
          }, null, 2),
          'src/index.js': '// Application entry point\nconst express = require(\'express\');\nconst app = express();\n\nconst PORT = process.env.PORT || 3000;\n\napp.get(\'/\', (req, res) => {\n  res.json({ message: \'Hello World\' });\n});\n\napp.listen(PORT, () => {\n  console.log(`Server running on port ${PORT}`);\n});'
        },
        gitignoreContent: 'node_modules/\n.env\n.DS_Store\nlogs/\n*.log\ndist/\nbuild/',
        readmeTemplate: '# {{PROJECT_NAME}}\n\n{{PROJECT_DESCRIPTION}}\n\n## Installation\n\n```bash\nnpm install\n```\n\n## Usage\n\n```bash\nnpm start\n```',
        cicdTemplate: {
          stages: ['build', 'test', 'deploy'],
          jobs: {
            build: { script: ['npm install'] },
            test: { script: ['npm test'] }
          }
        },
        dockerfileTemplate: 'FROM node:18-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --only=production\nCOPY . .\nEXPOSE 3000\nCMD ["npm", "start"]',
        isPublic: true,
        createdBy: '00000000-0000-0000-0000-000000000000' // System user
      },
      {
        name: 'Python Flask Application',
        description: 'Flask web application template',
        language: 'python',
        framework: 'flask',
        fileStructure: {
          'app/': {},
          'tests/': {},
          'static/': {},
          'templates/': {}
        },
        defaultFiles: {
          'requirements.txt': 'Flask==2.3.0\ngunicorn==20.1.0',
          'app.py': 'from flask import Flask\n\napp = Flask(__name__)\n\n@app.route(\'/\')\ndef hello():\n    return {\'message\': \'Hello World\'}\n\nif __name__ == \'__main__\':\n    app.run(host=\'0.0.0.0\', port=5000)'
        },
        gitignoreContent: '__pycache__/\n*.pyc\n.env\nvenv/\n.pytest_cache/\n*.log',
        readmeTemplate: '# {{PROJECT_NAME}}\n\n{{PROJECT_DESCRIPTION}}\n\n## Installation\n\n```bash\npip install -r requirements.txt\n```\n\n## Usage\n\n```bash\npython app.py\n```',
        cicdTemplate: {
          stages: ['build', 'test', 'deploy'],
          jobs: {
            build: { script: ['pip install -r requirements.txt'] },
            test: { script: ['pytest'] }
          }
        },
        dockerfileTemplate: 'FROM python:3.11-slim\nWORKDIR /app\nCOPY requirements.txt .\nRUN pip install --no-cache-dir -r requirements.txt\nCOPY . .\nEXPOSE 5000\nCMD ["gunicorn", "-b", "0.0.0.0:5000", "app:app"]',
        isPublic: true,
        createdBy: '00000000-0000-0000-0000-000000000000'
      },
      {
        name: 'React Application',
        description: 'React single-page application with Vite',
        language: 'react',
        framework: 'vite',
        fileStructure: {
          'src/': {
            'components/': {},
            'pages/': {},
            'services/': {},
            'styles/': {}
          },
          'public/': {}
        },
        defaultFiles: {
          'package.json': JSON.stringify({
            name: 'react-app',
            version: '1.0.0',
            scripts: {
              dev: 'vite',
              build: 'vite build',
              preview: 'vite preview'
            },
            dependencies: {
              react: '^18.2.0',
              'react-dom': '^18.2.0'
            },
            devDependencies: {
              '@vitejs/plugin-react': '^4.0.0',
              vite: '^4.3.0'
            }
          }, null, 2)
        },
        gitignoreContent: 'node_modules/\ndist/\n.env\n.DS_Store',
        readmeTemplate: '# {{PROJECT_NAME}}\n\n{{PROJECT_DESCRIPTION}}\n\n## Installation\n\n```bash\nnpm install\n```\n\n## Development\n\n```bash\nnpm run dev\n```\n\n## Build\n\n```bash\nnpm run build\n```',
        cicdTemplate: {
          stages: ['build', 'test', 'deploy'],
          jobs: {
            build: { script: ['npm install', 'npm run build'] }
          }
        },
        dockerfileTemplate: 'FROM node:18-alpine AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM nginx:alpine\nCOPY --from=builder /app/dist /usr/share/nginx/html\nEXPOSE 80\nCMD ["nginx", "-g", "daemon off;"]',
        isPublic: true,
        createdBy: '00000000-0000-0000-0000-000000000000'
      },
      {
        name: 'Blank Repository',
        description: 'Empty repository with basic files',
        language: 'other',
        framework: null,
        fileStructure: {},
        defaultFiles: {},
        gitignoreContent: '.DS_Store\n*.log',
        readmeTemplate: '# {{PROJECT_NAME}}\n\n{{PROJECT_DESCRIPTION}}',
        cicdTemplate: {},
        dockerfileTemplate: null,
        isPublic: true,
        createdBy: '00000000-0000-0000-0000-000000000000'
      }
    ];

    for (const template of templates) {
      await GitRepositoryTemplate.findOrCreate({
        where: { name: template.name },
        defaults: template
      });
      console.log(`   ✓ ${template.name}`);
    }
    console.log(`   Created ${templates.length} repository templates\n`);

    // 4. Create default issue templates
    console.log('4. Creating issue templates...');

    const issueTemplates = [
      {
        repositoryId: null, // Global templates
        name: 'Bug Report',
        title: '[BUG] ',
        description: 'Report a bug or issue',
        templateType: 'bug_report',
        body: '## Description\nA clear and concise description of the bug.\n\n## Steps to Reproduce\n1. Go to \'...\'\n2. Click on \'...\'\n3. Scroll down to \'...\'\n4. See error\n\n## Expected Behavior\nWhat you expected to happen.\n\n## Actual Behavior\nWhat actually happened.\n\n## Screenshots\nIf applicable, add screenshots to help explain your problem.\n\n## Environment\n- OS: [e.g. macOS, Windows, Linux]\n- Browser: [e.g. Chrome, Safari]\n- Version: [e.g. 1.0.0]\n\n## Additional Context\nAdd any other context about the problem here.',
        labels: ['bug'],
        assignees: [],
        isDefault: true,
        createdBy: '00000000-0000-0000-0000-000000000000'
      },
      {
        repositoryId: null,
        name: 'Feature Request',
        title: '[FEATURE] ',
        description: 'Suggest a new feature or enhancement',
        templateType: 'feature_request',
        body: '## Problem Statement\nDescribe the problem or need this feature would address.\n\n## Proposed Solution\nDescribe the solution you\'d like to see.\n\n## Alternative Solutions\nDescribe any alternative solutions or features you\'ve considered.\n\n## Use Cases\nDescribe specific use cases for this feature.\n\n## Benefits\nWhat benefits would this feature provide?\n\n## Additional Context\nAdd any other context, screenshots, or examples about the feature request here.',
        labels: ['enhancement'],
        assignees: [],
        isDefault: true,
        createdBy: '00000000-0000-0000-0000-000000000000'
      },
      {
        repositoryId: null,
        name: 'Question',
        title: '[QUESTION] ',
        description: 'Ask a question about the project',
        templateType: 'question',
        body: '## Question\nDescribe your question clearly.\n\n## Context\nProvide any relevant context or background information.\n\n## What I\'ve Tried\nDescribe what you\'ve already attempted or researched.\n\n## Additional Information\nAny other information that might be helpful.',
        labels: ['question'],
        assignees: [],
        isDefault: true,
        createdBy: '00000000-0000-0000-0000-000000000000'
      }
    ];

    for (const template of issueTemplates) {
      await GitIssueTemplate.findOrCreate({
        where: {
          repositoryId: null,
          templateType: template.templateType
        },
        defaults: template
      });
      console.log(`   ✓ ${template.name}`);
    }
    console.log(`   Created ${issueTemplates.length} global issue templates\n`);

    // 5. Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✓ Git/CI/CD Setup Initialization Complete!');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Summary:');
    console.log(`  • ${systemConfigs.length} system configurations`);
    console.log(`  • ${templates.length} repository templates`);
    console.log(`  • ${issueTemplates.length} global issue templates`);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Configure runners: Add CI/CD runners in the setup UI');
    console.log('  2. Set up deployment targets: Configure cloud platforms');
    console.log('  3. Create repositories: Use templates to create new repos');
    console.log('  4. Configure webhooks: Set up external integrations');
    console.log('');

  } catch (error) {
    console.error('✗ Error during initialization:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

// Run initialization
if (require.main === module) {
  initializeGitSetup()
    .then(() => {
      console.log('Initialization completed successfully!');
      process.exit(0);
    })
    .catch(error => {
      console.error('Initialization failed:', error);
      process.exit(1);
    });
}

module.exports = initializeGitSetup;
