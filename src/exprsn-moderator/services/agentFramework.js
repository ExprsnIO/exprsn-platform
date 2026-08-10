/**
 * ═══════════════════════════════════════════════════════════
 * AI Agent Framework
 * Core framework for managing and executing AI moderation agents
 * ═══════════════════════════════════════════════════════════
 */

const logger = require('../src/utils/logger');
const { AIAgent, AgentExecution } = require('../models/sequelize-index');

class AgentFramework {
  constructor() {
    this.agents = new Map();
    this.providers = new Map();
    this.initialized = false;
  }

  /**
   * Initialize the agent framework
   */
  async initialize() {
    if (this.initialized) {
      logger.warn('Agent framework already initialized');
      return;
    }

    logger.info('Initializing AI Agent Framework');

    // Register AI providers
    await this.registerProviders();

    // Load all active agents from database
    await this.loadAgents();

    this.initialized = true;
    logger.info(`Agent framework initialized with ${this.agents.size} agents`);
  }

  /**
   * Register AI providers (Claude, OpenAI, DeepSeek, etc.)
   */
  async registerProviders() {
    const providers = {
      claude: require('../src/ai-providers/claude'),
      openai: require('../src/ai-providers/openai'),
      deepseek: require('../src/ai-providers/deepseek')
    };

    for (const [name, provider] of Object.entries(providers)) {
      this.providers.set(name, provider);
      logger.info(`Registered AI provider: ${name}`);
    }
  }

  /**
   * Load all active agents from database
   */
  async loadAgents() {
    try {
      const agents = await AIAgent.findAll({
        where: {
          enabled: true,
          status: 'active'
        },
        order: [['priority', 'DESC']]
      });

      for (const agent of agents) {
        this.agents.set(agent.id, agent);
        logger.info(`Loaded agent: ${agent.name} (${agent.type})`);
      }

      logger.info(`Loaded ${agents.length} active agents`);
    } catch (error) {
      logger.error('Failed to load agents', { error: error.message });
      throw error;
    }
  }

  /**
   * Register a new agent implementation
   * @param {Object} agentClass - Agent class implementation
   */
  registerAgentImplementation(agentClass) {
    if (!agentClass.type) {
      throw new Error('Agent implementation must have a type property');
    }

    this.agentImplementations = this.agentImplementations || new Map();
    this.agentImplementations.set(agentClass.type, agentClass);
    logger.info(`Registered agent implementation: ${agentClass.type}`);
  }

  /**
   * Execute agents for content moderation
   * @param {Object} content - Content to moderate
   * @param {Object} options - Execution options
   */
  async executeAgents(content, options = {}) {
    const {
      contentType,
      contentId,
      contentText,
      contentUrl,
      sourceService,
      userId,
      specificAgents = null // Array of agent IDs to run, null = all applicable
    } = content;

    const results = {
      scores: {},
      actions: [],
      agents: [],
      highestRiskScore: 0,
      recommendedAction: null
    };

    try {
      // Get applicable agents
      let applicableAgents = Array.from(this.agents.values()).filter(agent => {
        // Filter by content type
        if (!agent.appliesTo.includes(contentType)) {
          return false;
        }

        // Filter by specific agent IDs if provided
        if (specificAgents && !specificAgents.includes(agent.id)) {
          return false;
        }

        return true;
      });

      // Sort by priority
      applicableAgents.sort((a, b) => b.priority - a.priority);

      logger.info(`Executing ${applicableAgents.length} agents for ${contentType} ${contentId}`);

      // Execute each agent
      for (const agent of applicableAgents) {
        const startTime = Date.now();

        try {
          // Get agent implementation
          const AgentClass = this.agentImplementations?.get(agent.type);
          if (!AgentClass) {
            logger.warn(`No implementation found for agent type: ${agent.type}`);
            continue;
          }

          // Create agent instance
          const agentInstance = new AgentClass(agent, this.providers.get(agent.provider));

          // Execute agent
          const agentResult = await agentInstance.execute({
            contentType,
            contentId,
            contentText,
            contentUrl,
            sourceService,
            userId
          });

          const executionTime = Date.now() - startTime;

          // Record successful execution
          await this.recordExecution({
            agentId: agent.id,
            contentType,
            contentId,
            sourceService,
            status: 'success',
            executionTime,
            inputData: { contentType, contentText, contentUrl },
            outputData: agentResult,
            scores: agentResult.scores || {},
            actionTaken: agentResult.action
          });

          // Update agent metrics
          await agent.recordExecution(true, executionTime);

          // Merge results
          if (agentResult.scores) {
            results.scores = { ...results.scores, ...agentResult.scores };

            // Track highest risk score
            const maxScore = Math.max(...Object.values(agentResult.scores));
            if (maxScore > results.highestRiskScore) {
              results.highestRiskScore = maxScore;
            }
          }

          if (agentResult.action) {
            results.actions.push({
              agent: agent.name,
              action: agentResult.action,
              confidence: agentResult.confidence || 0
            });
          }

          results.agents.push({
            name: agent.name,
            type: agent.type,
            success: true,
            executionTime
          });

          logger.debug(`Agent ${agent.name} completed in ${executionTime}ms`);

        } catch (error) {
          const executionTime = Date.now() - startTime;

          logger.error(`Agent ${agent.name} execution failed`, {
            error: error.message,
            stack: error.stack
          });

          // Record failed execution
          await this.recordExecution({
            agentId: agent.id,
            contentType,
            contentId,
            sourceService,
            status: 'failure',
            executionTime,
            inputData: { contentType, contentText, contentUrl },
            errorMessage: error.message
          });

          // Update agent metrics
          await agent.recordExecution(false, executionTime, error.message);

          results.agents.push({
            name: agent.name,
            type: agent.type,
            success: false,
            error: error.message,
            executionTime
          });
        }
      }

      // Determine recommended action based on highest risk score
      results.recommendedAction = this.determineAction(results.highestRiskScore);

      logger.info(`Agent execution completed`, {
        contentId,
        agentsRun: results.agents.length,
        highestRiskScore: results.highestRiskScore,
        recommendedAction: results.recommendedAction
      });

      return results;

    } catch (error) {
      logger.error('Agent execution framework error', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Record agent execution in database
   */
  async recordExecution(data) {
    try {
      await AgentExecution.create({
        agentId: data.agentId,
        contentType: data.contentType,
        contentId: data.contentId,
        sourceService: data.sourceService,
        status: data.status,
        executionTimeMs: data.executionTime,
        inputData: data.inputData || {},
        outputData: data.outputData || {},
        scores: data.scores || {},
        actionTaken: data.actionTaken,
        errorMessage: data.errorMessage,
        executedAt: Date.now()
      });
    } catch (error) {
      logger.error('Failed to record agent execution', { error: error.message });
    }
  }

  /**
   * Determine moderation action based on risk score
   */
  determineAction(riskScore) {
    if (riskScore <= 30) {
      return 'auto_approve';
    } else if (riskScore <= 50) {
      return 'approve';
    } else if (riskScore <= 75) {
      return 'require_review';
    } else if (riskScore <= 90) {
      return 'flag';
    } else {
      return 'reject';
    }
  }

  /**
   * Get agent by ID
   */
  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents() {
    return Array.from(this.agents.values());
  }

  /**
   * Get agents by type
   */
  getAgentsByType(type) {
    return Array.from(this.agents.values()).filter(agent => agent.type === type);
  }

  /**
   * Reload agents from database
   */
  async reloadAgents() {
    logger.info('Reloading agents from database');
    this.agents.clear();
    await this.loadAgents();
  }

  /**
   * Get agent statistics
   */
  async getStatistics() {
    const stats = {
      totalAgents: this.agents.size,
      activeAgents: 0,
      inactiveAgents: 0,
      agentsByType: {},
      agentsByProvider: {}
    };

    for (const agent of this.agents.values()) {
      // Count by status
      if (agent.status === 'active') {
        stats.activeAgents++;
      } else {
        stats.inactiveAgents++;
      }

      // Count by type
      stats.agentsByType[agent.type] = (stats.agentsByType[agent.type] || 0) + 1;

      // Count by provider
      stats.agentsByProvider[agent.provider] = (stats.agentsByProvider[agent.provider] || 0) + 1;
    }

    return stats;
  }
}

// Export singleton instance
module.exports = new AgentFramework();
