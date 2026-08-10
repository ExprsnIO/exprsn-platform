#!/usr/bin/env node

/**
 * MVP Planner CLI Tool
 *
 * Interactive tool for planning MVPs and features with AI assistance
 * and concurrent agent orchestration.
 *
 * Usage:
 *   npm run mvp:plan -- --feature "Post Scheduling"
 *   npm run mvp:plan -- --interactive
 *   npm run mvp:plan -- --workflow examples/post-scheduling.json
 */

const { program } = require('commander');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs').promises;
const path = require('path');
const { createAIOrchestrator, createAgentOrchestrator } = require('../src/shared/ai-integration');

program
  .name('mvp-planner')
  .description('Plan MVPs and features with AI assistance and concurrent agent orchestration')
  .version('1.0.0');

program
  .command('plan')
  .description('Plan a new feature or MVP')
  .option('-f, --feature <name>', 'Feature name')
  .option('-i, --interactive', 'Interactive mode')
  .option('-w, --workflow <file>', 'Load workflow from JSON file')
  .option('--ai-consensus', 'Use multi-AI consensus mode')
  .option('--parallel', 'Enable parallel agent execution')
  .action(async (options) => {
    try {
      if (options.workflow) {
        await executeWorkflowFromFile(options.workflow, options);
      } else if (options.interactive || !options.feature) {
        await interactivePlanning(options);
      } else {
        await quickPlan(options.feature, options);
      }
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('brainstorm')
  .description('Brainstorm solutions for a problem with multi-AI')
  .option('-p, --problem <description>', 'Problem description')
  .option('-c, --constraints <items...>', 'Constraints')
  .action(async (options) => {
    try {
      await brainstormSolutions(options.problem, options.constraints || []);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('review')
  .description('Multi-AI code review')
  .requiredOption('-f, --file <path>', 'File to review')
  .option('-c, --context <description>', 'Context for the review')
  .action(async (options) => {
    try {
      await reviewCode(options.file, options.context);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('validate')
  .description('Validate architecture with multi-AI')
  .requiredOption('-d, --design <file>', 'Architecture design JSON file')
  .action(async (options) => {
    try {
      await validateArchitecture(options.design);
    } catch (error) {
      console.error(chalk.red('Error:'), error.message);
      process.exit(1);
    }
  });

// ========== Implementation Functions ==========

async function interactivePlanning(options) {
  console.log(chalk.blue.bold('\n🎯 MVP Feature Planner\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'featureName',
      message: 'Feature name:',
      validate: input => input.length > 0 || 'Feature name is required'
    },
    {
      type: 'editor',
      name: 'description',
      message: 'Feature description (opens editor):',
      validate: input => input.length > 0 || 'Description is required'
    },
    {
      type: 'input',
      name: 'targetUsers',
      message: 'Target users:',
      default: 'General Exprsn users'
    },
    {
      type: 'checkbox',
      name: 'services',
      message: 'Which Exprsn services will be affected?',
      choices: [
        'exprsn-timeline',
        'exprsn-auth',
        'exprsn-svr',
        'exprsn-gallery',
        'exprsn-herald',
        'exprsn-workflow',
        'exprsn-payments',
        'exprsn-atlas',
        'New service'
      ]
    },
    {
      type: 'list',
      name: 'mvpSize',
      message: 'MVP size:',
      choices: [
        { name: 'Small (1-2 weeks)', value: 'small' },
        { name: 'Medium (3-4 weeks)', value: 'medium' },
        { name: 'Large (5-8 weeks)', value: 'large' }
      ]
    },
    {
      type: 'confirm',
      name: 'useAI',
      message: 'Use multi-AI consultation for planning?',
      default: true
    },
    {
      type: 'confirm',
      name: 'parallelExecution',
      message: 'Plan for concurrent agent execution?',
      default: true
    }
  ]);

  await executePlanning(answers, options);
}

async function quickPlan(featureName, options) {
  console.log(chalk.blue.bold(`\n🎯 Planning: ${featureName}\n`));

  const feature = {
    name: featureName,
    description: `Feature: ${featureName}`,
    targetUsers: 'General users',
    services: [],
    mvpSize: 'medium',
    useAI: options.aiConsensus || false,
    parallelExecution: options.parallel || false
  };

  await executePlanning(feature, options);
}

async function executePlanning(feature, options) {
  const spinner = ora('Initializing AI services...').start();

  try {
    // Initialize AI orchestrator if requested
    let aiOrchestrator = null;
    if (feature.useAI) {
      aiOrchestrator = createAIOrchestrator({
        enableDeepseek: true,
        enableChatGPT: true,
        parallelRequests: true
      });
      spinner.text = 'AI services initialized';
    }

    // Step 1: Generate user stories
    if (feature.useAI) {
      spinner.text = 'Generating user stories...';
      const userStories = await aiOrchestrator.planFeature({
        name: feature.name,
        description: feature.description,
        targetUsers: feature.targetUsers,
        services: feature.services
      });

      await saveArtifact('user-stories', feature.name, userStories);
      spinner.succeed('User stories generated');
    }

    // Step 2: Design architecture
    if (feature.useAI) {
      spinner.start('Designing architecture with multi-AI consensus...');

      const architectureDesign = await aiOrchestrator.getConsensusRecommendation(
        `Design architecture for: ${feature.name}`,
        {
          description: feature.description,
          services: feature.services,
          platform: 'Exprsn microservices'
        }
      );

      await saveArtifact('architecture', feature.name, architectureDesign);
      spinner.succeed('Architecture designed');
    }

    // Step 3: Create implementation plan with concurrent agents
    if (feature.parallelExecution) {
      spinner.start('Creating concurrent implementation plan...');

      const workflowPlan = createWorkflowPlan(feature);
      await saveArtifact('workflow', feature.name, workflowPlan);

      spinner.succeed('Implementation plan created');

      // Display workflow summary
      displayWorkflowSummary(workflowPlan);
    }

    spinner.succeed(chalk.green.bold('\n✅ Planning complete!\n'));

    // Show next steps
    console.log(chalk.yellow('\n📋 Next Steps:\n'));
    console.log(`1. Review generated artifacts in: ${chalk.cyan('./planning/' + sanitizeFileName(feature.name))}`);
    console.log(`2. Execute workflow: ${chalk.cyan(`npm run mvp:execute -- --workflow planning/${sanitizeFileName(feature.name)}/workflow.json`)}`);
    console.log(`3. Monitor progress: ${chalk.cyan('npm run mvp:status')}\n`);

  } catch (error) {
    spinner.fail('Planning failed');
    throw error;
  }
}

function createWorkflowPlan(feature) {
  const plan = {
    name: feature.name,
    description: feature.description,
    estimatedDuration: feature.mvpSize === 'small' ? '1-2 weeks' : feature.mvpSize === 'medium' ? '3-4 weeks' : '5-8 weeks',
    phases: [
      {
        name: 'Phase 1: Foundation',
        workstreams: [
          {
            name: 'Backend Development',
            agents: [
              {
                id: 'architect',
                type: 'microservices-architect',
                task: 'Design service architecture and API contracts',
                duration: 172800000, // 2 days in ms
                dependencies: [],
                parallelizable: false
              },
              {
                id: 'backend-impl',
                type: 'backend-developer',
                task: `Implement ${feature.name} backend`,
                duration: 432000000, // 5 days
                dependencies: ['architect'],
                parallelizable: true
              },
              {
                id: 'qa-tests',
                type: 'qa-reviewer',
                task: 'Write test plans and acceptance tests',
                duration: 259200000, // 3 days
                dependencies: ['architect'],
                parallelizable: true // Can run parallel with backend-impl
              }
            ]
          },
          {
            name: 'Mobile Development',
            agents: [
              {
                id: 'ios-dev',
                type: 'sr-swift-developer',
                task: `Implement iOS ${feature.name} UI`,
                duration: 345600000, // 4 days
                dependencies: ['architect'],
                parallelizable: true
              },
              {
                id: 'android-dev',
                type: 'sr-android-developer',
                task: `Implement Android ${feature.name} UI`,
                duration: 345600000, // 4 days
                dependencies: ['architect'],
                parallelizable: true // Parallel with iOS
              }
            ]
          },
          {
            name: 'Infrastructure',
            agents: [
              {
                id: 'infra-setup',
                type: 'digitalocean-cloud-engineer',
                task: 'Set up infrastructure components',
                duration: 172800000, // 2 days
                dependencies: [],
                parallelizable: true
              }
            ]
          }
        ],
        sequentialGates: [
          {
            name: 'API Contract Review',
            blocksWorkstreams: ['Backend Development', 'Mobile Development'],
            estimatedDuration: 14400000, // 4 hours
            participants: ['microservices-architect', 'sr-swift-developer', 'sr-android-developer']
          }
        ]
      },
      {
        name: 'Phase 2: Integration & Testing',
        workstreams: [
          {
            name: 'Integration',
            agents: [
              {
                id: 'integration',
                type: 'integration-specialist',
                task: 'Integration testing',
                duration: 172800000, // 2 days
                dependencies: ['backend-impl', 'ios-dev', 'android-dev'],
                parallelizable: false
              }
            ]
          }
        ]
      }
    ]
  };

  return plan;
}

async function executeWorkflowFromFile(workflowFile, options) {
  const spinner = ora('Loading workflow...').start();

  try {
    const workflowContent = await fs.readFile(workflowFile, 'utf8');
    const workflow = JSON.parse(workflowContent);

    spinner.succeed('Workflow loaded');

    // Execute workflow
    const orchestrator = createAgentOrchestrator({
      maxConcurrentAgents: 5,
      parallelRequests: true
    });

    // Listen to events
    orchestrator.on('agent:started', (data) => {
      console.log(chalk.blue(`▶️  Started: ${data.type} - ${data.task}`));
    });

    orchestrator.on('agent:completed', (data) => {
      console.log(chalk.green(`✅ Completed: ${data.agentType} (${data.duration}ms)`));
    });

    orchestrator.on('agent:failed', (data) => {
      console.log(chalk.red(`❌ Failed: ${data.agentType} - ${data.error}`));
    });

    orchestrator.on('gate:started', (data) => {
      console.log(chalk.yellow(`🚧 Gate: ${data.name}`));
    });

    console.log(chalk.blue.bold(`\n🚀 Executing Workflow: ${workflow.name}\n`));

    const results = await orchestrator.executeWorkflow(workflow);

    // Display results
    console.log(chalk.green.bold('\n✅ Workflow Complete!\n'));
    console.log(chalk.cyan('Summary:'));
    console.log(`  Total Duration: ${chalk.white((results.totalDuration / 1000 / 60).toFixed(2))} minutes`);
    console.log(`  Agents Executed: ${chalk.white(results.agentsExecuted)}`);
    console.log(`  Agents Failed: ${chalk.white(results.agentsFailed)}`);
    console.log(`  Parallelization Factor: ${chalk.white(results.parallelizationFactor.toFixed(2))}x`);

    await saveArtifact('results', workflow.name, results);

  } catch (error) {
    spinner.fail('Workflow execution failed');
    throw error;
  }
}

async function brainstormSolutions(problem, constraints) {
  if (!problem) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'problem',
        message: 'Describe the problem:',
        validate: input => input.length > 0 || 'Problem description required'
      },
      {
        type: 'input',
        name: 'constraints',
        message: 'Constraints (comma-separated):',
        filter: input => input.split(',').map(s => s.trim()).filter(s => s)
      }
    ]);

    problem = answers.problem;
    constraints = answers.constraints;
  }

  const spinner = ora('Brainstorming with multi-AI...').start();

  try {
    const aiOrchestrator = createAIOrchestrator();
    const solutions = await aiOrchestrator.brainstormSolutions(problem, constraints);

    spinner.succeed('Brainstorming complete');

    console.log(chalk.blue.bold('\n💡 Solutions:\n'));
    solutions.ideas.forEach((idea, index) => {
      console.log(chalk.yellow(`\n${index + 1}. From ${idea.source}:`));
      console.log(chalk.white(idea.ideas.substring(0, 500) + '...'));
    });

    await saveArtifact('brainstorm', sanitizeFileName(problem), solutions);

  } catch (error) {
    spinner.fail('Brainstorming failed');
    throw error;
  }
}

async function reviewCode(filePath, context = '') {
  const spinner = ora('Reading file...').start();

  try {
    const code = await fs.readFile(filePath, 'utf8');
    spinner.text = 'Reviewing with multi-AI...';

    const aiOrchestrator = createAIOrchestrator();
    const review = await aiOrchestrator.reviewCode(code, context || filePath);

    spinner.succeed('Review complete');

    console.log(chalk.blue.bold('\n📝 Code Review Results:\n'));
    review.reviews.forEach(r => {
      console.log(chalk.yellow(`\n${r.source} (${r.focus}):`));
      console.log(chalk.white(r.review.substring(0, 1000)));
    });

    await saveArtifact('review', path.basename(filePath), review);

  } catch (error) {
    spinner.fail('Review failed');
    throw error;
  }
}

async function validateArchitecture(designFile) {
  const spinner = ora('Loading design...').start();

  try {
    const designContent = await fs.readFile(designFile, 'utf8');
    const design = JSON.parse(designContent);

    spinner.text = 'Validating with multi-AI...';

    const aiOrchestrator = createAIOrchestrator();
    const validation = await aiOrchestrator.validateArchitecture(design);

    spinner.succeed('Validation complete');

    console.log(chalk.blue.bold('\n🔍 Architecture Validation:\n'));
    console.log(chalk.cyan('Decision:'), validation.recommendation.decision);
    console.log(chalk.cyan('Reason:'), validation.recommendation.reason);

    validation.validations.forEach(v => {
      console.log(chalk.yellow(`\n${v.validator}:`));
      console.log(chalk.white(v.feedback.substring(0, 500)));
    });

    await saveArtifact('validation', design.serviceName || 'architecture', validation);

  } catch (error) {
    spinner.fail('Validation failed');
    throw error;
  }
}

// ========== Helper Functions ==========

async function saveArtifact(type, name, data) {
  const dir = path.join(process.cwd(), 'planning', sanitizeFileName(name));
  await fs.mkdir(dir, { recursive: true });

  const filename = path.join(dir, `${type}.json`);
  await fs.writeFile(filename, JSON.stringify(data, null, 2));

  console.log(chalk.gray(`  Saved: ${filename}`));
}

function sanitizeFileName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function displayWorkflowSummary(workflow) {
  console.log(chalk.blue.bold('\n📊 Workflow Summary:\n'));
  console.log(chalk.cyan('Phases:'), workflow.phases.length);

  workflow.phases.forEach((phase, pIndex) => {
    console.log(chalk.yellow(`\n  Phase ${pIndex + 1}: ${phase.name}`));

    phase.workstreams.forEach(ws => {
      console.log(chalk.white(`    ↳ ${ws.name} (${ws.agents.length} agents)`));

      const parallelAgents = ws.agents.filter(a => a.parallelizable);
      if (parallelAgents.length > 0) {
        console.log(chalk.green(`      ✓ ${parallelAgents.length} agents can run in parallel`));
      }
    });

    if (phase.sequentialGates?.length > 0) {
      console.log(chalk.gray(`    Gates: ${phase.sequentialGates.map(g => g.name).join(', ')}`));
    }
  });
}

// Parse and execute
program.parse(process.argv);

// Show help if no command
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
