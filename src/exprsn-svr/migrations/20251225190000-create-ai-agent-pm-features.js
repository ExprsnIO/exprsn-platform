/**
 * Migration: AI Agent Integration for Project Management
 *
 * Adds AI agent feedback, analysis, and automation to the PM system:
 * - Agent task analysis (risk, estimate validation, recommendations)
 * - Agent sprint retrospective insights
 * - Agent-generated burndown predictions
 * - Automated task assignment suggestions
 * - Agent comments and feedback on tasks
 * - Integration with workflow automation triggers
 *
 * Date: 2025-12-25
 * Author: AI Integration Specialist
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // AI Agent Analysis for Tasks
    await queryInterface.createTable('task_agent_analysis', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      task_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      agent_name: {
        type: Sequelize.ENUM(
          'sr-developer', 'microservices-architect', 'performance-engineer',
          'ca-security-specialist', 'qa-planner', 'qa-reviewer',
          'technical-research-analyst', 'product-manager', 'scrum-master'
        ),
        allowNull: false
      },
      analysis_type: {
        type: Sequelize.ENUM(
          'risk_assessment', 'estimate_validation', 'complexity_analysis',
          'security_review', 'performance_review', 'architecture_review',
          'test_coverage_check', 'dependency_analysis', 'recommendation'
        ),
        allowNull: false
      },
      risk_level: { type: Sequelize.ENUM('low', 'medium', 'high', 'critical') },
      confidence_score: { type: Sequelize.INTEGER }, // 0-100
      estimated_hours: { type: Sequelize.DECIMAL(10, 2) }, // Agent's estimate
      estimated_points: { type: Sequelize.INTEGER }, // Agent's story point estimate
      complexity_factors: {
        type: Sequelize.JSONB,
        defaultValue: {}, // { technical: 0.8, integration: 0.6, security: 0.4, testing: 0.5 }
        comment: 'Complexity scores (0-1) for different dimensions'
      },
      risks_identified: {
        type: Sequelize.JSONB,
        defaultValue: [], // [{ risk: 'CA token validation', severity: 'high', mitigation: '...' }]
      },
      recommendations: {
        type: Sequelize.JSONB,
        defaultValue: [], // [{ category: 'architecture', suggestion: '...', priority: 'high' }]
      },
      dependencies_suggested: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        defaultValue: [], // Task IDs that should be dependencies
      },
      blocking_issues: {
        type: Sequelize.JSONB,
        defaultValue: [], // [{ issue: 'exprsn-ca must be deployed first', blocker_type: 'technical' }]
      },
      summary: { type: Sequelize.TEXT }, // Human-readable summary
      analysis_metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}, // Model version, tokens used, processing time, etc.
      },
      analyzed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('task_agent_analysis', ['task_id']);
    await queryInterface.addIndex('task_agent_analysis', ['agent_name']);
    await queryInterface.addIndex('task_agent_analysis', ['analysis_type']);
    await queryInterface.addIndex('task_agent_analysis', ['risk_level']);

    // AI Agent Sprint Analysis
    await queryInterface.createTable('sprint_agent_insights', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      sprint_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'sprints', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      agent_name: {
        type: Sequelize.ENUM('scrum-master', 'product-manager', 'performance-engineer', 'qa-planner'),
        allowNull: false
      },
      insight_type: {
        type: Sequelize.ENUM(
          'velocity_prediction', 'burndown_forecast', 'risk_assessment',
          'capacity_warning', 'scope_creep_detection', 'retrospective_analysis',
          'team_health', 'blockers_identified'
        ),
        allowNull: false
      },
      predicted_velocity: { type: Sequelize.INTEGER }, // Predicted story points
      predicted_completion_date: { type: Sequelize.DATE }, // When sprint will actually finish
      confidence_interval: {
        type: Sequelize.JSONB,
        defaultValue: {}, // { low: 25, high: 35, confidence: 0.85 }
      },
      risks: {
        type: Sequelize.JSONB,
        defaultValue: [], // [{ risk: 'Sprint overcommitted by 20%', severity: 'high' }]
      },
      recommendations: {
        type: Sequelize.JSONB,
        defaultValue: [], // [{ action: 'Move 2 stories to next sprint', priority: 'high' }]
      },
      blockers: {
        type: Sequelize.JSONB,
        defaultValue: [], // [{ task_id: 'uuid', blocker: 'Waiting on CA deployment', impact: 'high' }]
      },
      team_metrics: {
        type: Sequelize.JSONB,
        defaultValue: {}, // { capacity_utilization: 0.95, collaboration_score: 0.8, ... }
      },
      retrospective_topics: {
        type: Sequelize.JSONB,
        defaultValue: [], // [{ topic: 'CA integration delays', category: 'process' }]
      },
      summary: { type: Sequelize.TEXT },
      analyzed_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('sprint_agent_insights', ['sprint_id']);
    await queryInterface.addIndex('sprint_agent_insights', ['agent_name']);
    await queryInterface.addIndex('sprint_agent_insights', ['insight_type']);

    // AI Agent Assignment Recommendations
    await queryInterface.createTable('task_assignment_suggestions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      task_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      suggested_assignee_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      confidence_score: { type: Sequelize.INTEGER }, // 0-100
      reasoning: {
        type: Sequelize.JSONB,
        defaultValue: {}, // { skills_match: 0.9, availability: 0.7, workload: 0.6, past_performance: 0.8 }
      },
      skills_required: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },
      skills_matched: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },
      alternative_assignees: {
        type: Sequelize.JSONB,
        defaultValue: [], // [{ employee_id: 'uuid', score: 0.75, reason: '...' }]
      },
      workload_impact: {
        type: Sequelize.JSONB,
        defaultValue: {}, // { current_hours: 35, projected_hours: 43, capacity: 40 }
      },
      status: { type: Sequelize.ENUM('suggested', 'accepted', 'rejected', 'expired'), defaultValue: 'suggested' },
      accepted_by: { type: Sequelize.UUID, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      accepted_at: { type: Sequelize.DATE },
      expires_at: { type: Sequelize.DATE }, // Suggestion expires after 7 days
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('task_assignment_suggestions', ['task_id']);
    await queryInterface.addIndex('task_assignment_suggestions', ['suggested_assignee_id']);
    await queryInterface.addIndex('task_assignment_suggestions', ['status']);

    // AI Agent Comments on Tasks
    await queryInterface.createTable('task_agent_comments', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      task_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      agent_name: { type: Sequelize.STRING(100), allowNull: false }, // Any agent from the 27 available
      comment_type: {
        type: Sequelize.ENUM(
          'review', 'suggestion', 'warning', 'approval', 'question',
          'security_concern', 'performance_concern', 'architecture_concern',
          'quality_gate_check', 'best_practice_reminder'
        ),
        allowNull: false
      },
      severity: { type: Sequelize.ENUM('info', 'low', 'medium', 'high', 'critical'), defaultValue: 'info' },
      comment: { type: Sequelize.TEXT, allowNull: false },
      code_references: {
        type: Sequelize.JSONB,
        defaultValue: [], // [{ file: 'src/exprsn-ca/index.js', line: 42, snippet: '...' }]
      },
      action_items: {
        type: Sequelize.JSONB,
        defaultValue: [], // [{ action: 'Add unit test for CA token validation', priority: 'high' }]
      },
      related_docs: {
        type: Sequelize.JSONB,
        defaultValue: [], // [{ title: 'CA Token Spec', url: '/TOKEN_SPECIFICATION_V1.0.md' }]
      },
      is_resolved: { type: Sequelize.BOOLEAN, defaultValue: false },
      resolved_by: { type: Sequelize.UUID, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      resolved_at: { type: Sequelize.DATE },
      resolution_comment: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('task_agent_comments', ['task_id', 'created_at']);
    await queryInterface.addIndex('task_agent_comments', ['agent_name']);
    await queryInterface.addIndex('task_agent_comments', ['comment_type']);
    await queryInterface.addIndex('task_agent_comments', ['is_resolved']);

    // Workflow Automation Triggers for PM Events
    await queryInterface.createTable('pm_workflow_triggers', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      trigger_name: { type: Sequelize.STRING(100), allowNull: false },
      project_id: { type: Sequelize.UUID, references: { model: 'projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      trigger_event: {
        type: Sequelize.ENUM(
          'task_created', 'task_status_changed', 'task_assigned', 'task_completed',
          'sprint_started', 'sprint_completed', 'sprint_at_risk',
          'milestone_achieved', 'milestone_missed',
          'risk_detected', 'blocker_identified', 'sla_breach',
          'capacity_exceeded', 'agent_warning_issued'
        ),
        allowNull: false
      },
      workflow_id: { type: Sequelize.UUID, allowNull: false, comment: 'References exprsn-workflow workflow ID' },
      conditions: {
        type: Sequelize.JSONB,
        defaultValue: {}, // { status: 'done', priority: 'critical', assignee: 'uuid' }
      },
      workflow_input_mapping: {
        type: Sequelize.JSONB,
        defaultValue: {}, // Map PM event data to workflow input variables
      },
      is_active: { type: Sequelize.BOOLEAN, defaultValue: true },
      last_triggered_at: { type: Sequelize.DATE },
      trigger_count: { type: Sequelize.INTEGER, defaultValue: 0 },
      created_by: { type: Sequelize.UUID, allowNull: false, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('pm_workflow_triggers', ['project_id']);
    await queryInterface.addIndex('pm_workflow_triggers', ['trigger_event']);
    await queryInterface.addIndex('pm_workflow_triggers', ['is_active']);

    // Agent Learning Data (track accuracy of predictions)
    await queryInterface.createTable('agent_prediction_accuracy', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      task_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      agent_name: { type: Sequelize.STRING(100), allowNull: false },
      prediction_type: { type: Sequelize.ENUM('estimate', 'complexity', 'risk', 'assignment', 'timeline'), allowNull: false },
      predicted_value: { type: Sequelize.DECIMAL(10, 2) }, // e.g., 8.5 hours
      actual_value: { type: Sequelize.DECIMAL(10, 2) }, // e.g., 12.0 hours
      accuracy_score: { type: Sequelize.DECIMAL(5, 2) }, // 0-100, calculated as 100 - abs((predicted - actual) / actual * 100)
      factors_analyzed: { type: Sequelize.JSONB, defaultValue: {} },
      learning_notes: { type: Sequelize.TEXT }, // What the agent learned from this prediction
      predicted_at: { type: Sequelize.DATE, allowNull: false },
      actual_recorded_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('agent_prediction_accuracy', ['task_id']);
    await queryInterface.addIndex('agent_prediction_accuracy', ['agent_name']);
    await queryInterface.addIndex('agent_prediction_accuracy', ['prediction_type']);
    await queryInterface.addIndex('agent_prediction_accuracy', ['accuracy_score']);

    console.log('✅ AI Agent PM Integration created successfully!');
    console.log('');
    console.log('🤖 Agent Analysis: task_agent_analysis (risk, estimates, complexity)');
    console.log('📊 Sprint Insights: sprint_agent_insights (predictions, retrospectives)');
    console.log('👤 Auto-Assignment: task_assignment_suggestions (ML-based matching)');
    console.log('💬 Agent Comments: task_agent_comments (reviews, warnings, suggestions)');
    console.log('⚡ Workflow Triggers: pm_workflow_triggers (automate on PM events)');
    console.log('📈 Learning System: agent_prediction_accuracy (improve over time)');
    console.log('');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('agent_prediction_accuracy');
    await queryInterface.dropTable('pm_workflow_triggers');
    await queryInterface.dropTable('task_agent_comments');
    await queryInterface.dropTable('task_assignment_suggestions');
    await queryInterface.dropTable('sprint_agent_insights');
    await queryInterface.dropTable('task_agent_analysis');
  }
};
