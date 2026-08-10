/**
 * Workflow Template Service
 * Provides pre-built workflow templates for common scenarios
 * Users can browse, preview, and instantiate templates
 */

const { Workflow, WorkflowStep } = require('../models');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class WorkflowTemplateService {
  constructor() {
    this.templates = new Map();
    this.categories = [
      'lead_nurturing',
      'approval_process',
      'data_sync',
      'notification',
      'content_moderation',
      'customer_onboarding',
      'report_automation',
      'task_management'
    ];

    // Initialize built-in templates
    this.initializeTemplates();
  }

  /**
   * Initialize built-in workflow templates
   */
  initializeTemplates() {
    // Template 1: Lead Nurturing Sequence
    this.registerTemplate({
      id: 'lead-nurturing-sequence',
      name: 'Lead Nurturing Sequence',
      description: 'Automated email sequence for new leads with engagement tracking',
      category: 'lead_nurturing',
      icon: '📧',
      difficulty: 'beginner',
      estimatedSetupTime: 10,
      tags: ['crm', 'email', 'automation'],
      definition: {
        version: '1.0',
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            name: 'New Lead Created',
            config: {
              triggerType: 'webhook',
              eventType: 'lead.created'
            },
            next: 'check_lead_source'
          },
          {
            id: 'check_lead_source',
            type: 'condition',
            name: 'Check Lead Source',
            config: {
              condition: 'context.variables.lead.source !== "referral"'
            },
            next: {
              true: 'send_welcome_email',
              false: 'send_referral_email'
            }
          },
          {
            id: 'send_welcome_email',
            type: 'email_template',
            name: 'Send Welcome Email',
            config: {
              templateId: 'welcome-template',
              to: '{{lead.email}}',
              subject: 'Welcome to {{company.name}}!',
              variables: {
                leadName: '{{lead.firstName}}',
                companyName: '{{company.name}}'
              }
            },
            next: 'wait_2_days'
          },
          {
            id: 'send_referral_email',
            type: 'email_template',
            name: 'Send Referral Welcome',
            config: {
              templateId: 'referral-welcome',
              to: '{{lead.email}}',
              subject: 'Thanks for the referral!'
            },
            next: 'wait_2_days'
          },
          {
            id: 'wait_2_days',
            type: 'wait',
            name: 'Wait 2 Days',
            config: {
              duration: 172800000 // 2 days in ms
            },
            next: 'check_engagement'
          },
          {
            id: 'check_engagement',
            type: 'condition',
            name: 'Check Email Engagement',
            config: {
              condition: 'context.variables.lead.emailOpened === true'
            },
            next: {
              true: 'send_followup',
              false: 'send_reengagement'
            }
          },
          {
            id: 'send_followup',
            type: 'email_template',
            name: 'Send Follow-up Email',
            config: {
              templateId: 'followup-email',
              to: '{{lead.email}}'
            },
            next: 'mark_as_engaged'
          },
          {
            id: 'send_reengagement',
            type: 'email_template',
            name: 'Send Re-engagement Email',
            config: {
              templateId: 'reengagement-email',
              to: '{{lead.email}}'
            },
            next: 'mark_as_engaged'
          },
          {
            id: 'mark_as_engaged',
            type: 'action',
            name: 'Update Lead Status',
            config: {
              action: 'update_lead',
              parameters: {
                leadId: '{{lead.id}}',
                status: 'engaged'
              }
            }
          }
        ],
        variables: {
          lead: null,
          company: null
        },
        settings: {
          maxExecutionTime: 604800000, // 7 days
          enableLogging: true
        }
      },
      requiredConfig: [
        { name: 'welcome-template', type: 'email_template', description: 'Email template for welcome message' },
        { name: 'referral-welcome', type: 'email_template', description: 'Email template for referrals' },
        { name: 'followup-email', type: 'email_template', description: 'Follow-up email template' },
        { name: 'reengagement-email', type: 'email_template', description: 'Re-engagement email template' }
      ]
    });

    // Template 2: Invoice Approval Process
    this.registerTemplate({
      id: 'invoice-approval',
      name: 'Invoice Approval Process',
      description: 'Multi-level approval workflow for invoices with automatic routing',
      category: 'approval_process',
      icon: '✅',
      difficulty: 'intermediate',
      estimatedSetupTime: 15,
      tags: ['erp', 'approval', 'finance'],
      definition: {
        version: '1.0',
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            name: 'Invoice Submitted',
            config: {
              triggerType: 'webhook',
              eventType: 'invoice.submitted'
            },
            next: 'check_amount'
          },
          {
            id: 'check_amount',
            type: 'switch',
            name: 'Route by Amount',
            config: {
              expression: 'context.variables.invoice.amount',
              cases: [
                { when: 'value < 1000', then: 'manager_approval' },
                { when: 'value >= 1000 && value < 10000', then: 'director_approval' },
                { when: 'value >= 10000', then: 'cfo_approval' }
              ],
              default: 'manager_approval'
            }
          },
          {
            id: 'manager_approval',
            type: 'approval',
            name: 'Manager Approval',
            config: {
              approvers: ['{{invoice.managerUserId}}'],
              approvalType: 'single',
              timeoutMinutes: 2880, // 48 hours
              notificationTemplate: 'invoice-approval-request'
            },
            next: {
              approved: 'send_to_finance',
              rejected: 'notify_rejection',
              timeout: 'escalate_to_director'
            }
          },
          {
            id: 'director_approval',
            type: 'approval',
            name: 'Director Approval',
            config: {
              approvers: ['{{invoice.directorUserId}}'],
              approvalType: 'single',
              timeoutMinutes: 2880
            },
            next: {
              approved: 'send_to_finance',
              rejected: 'notify_rejection',
              timeout: 'escalate_to_cfo'
            }
          },
          {
            id: 'cfo_approval',
            type: 'approval',
            name: 'CFO Approval',
            config: {
              approvers: ['{{company.cfoUserId}}'],
              approvalType: 'single',
              timeoutMinutes: 4320 // 72 hours
            },
            next: {
              approved: 'send_to_finance',
              rejected: 'notify_rejection'
            }
          },
          {
            id: 'escalate_to_director',
            type: 'approval',
            name: 'Escalated to Director',
            config: {
              approvers: ['{{invoice.directorUserId}}'],
              approvalType: 'single',
              isEscalation: true
            },
            next: {
              approved: 'send_to_finance',
              rejected: 'notify_rejection'
            }
          },
          {
            id: 'escalate_to_cfo',
            type: 'approval',
            name: 'Escalated to CFO',
            config: {
              approvers: ['{{company.cfoUserId}}'],
              approvalType: 'single',
              isEscalation: true
            },
            next: {
              approved: 'send_to_finance',
              rejected: 'notify_rejection'
            }
          },
          {
            id: 'send_to_finance',
            type: 'action',
            name: 'Send to Finance',
            config: {
              action: 'update_invoice_status',
              parameters: {
                invoiceId: '{{invoice.id}}',
                status: 'approved_for_payment'
              }
            },
            next: 'notify_approval'
          },
          {
            id: 'notify_approval',
            type: 'notification',
            name: 'Notify Approval',
            config: {
              recipients: ['{{invoice.submittedBy}}'],
              message: 'Your invoice #{{invoice.number}} has been approved'
            }
          },
          {
            id: 'notify_rejection',
            type: 'notification',
            name: 'Notify Rejection',
            config: {
              recipients: ['{{invoice.submittedBy}}'],
              message: 'Your invoice #{{invoice.number}} was rejected. Reason: {{approval.rejectionReason}}'
            }
          }
        ],
        variables: {
          invoice: null,
          company: null,
          approval: {}
        }
      }
    });

    // Template 3: Weekly Report Automation
    this.registerTemplate({
      id: 'weekly-report-automation',
      name: 'Weekly Report Automation',
      description: 'Generate and distribute weekly reports automatically',
      category: 'report_automation',
      icon: '📊',
      difficulty: 'beginner',
      estimatedSetupTime: 5,
      tags: ['reports', 'automation', 'email'],
      definition: {
        version: '1.0',
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            name: 'Weekly Schedule',
            config: {
              triggerType: 'schedule',
              cron: '0 9 * * 1' // Every Monday at 9 AM
            },
            next: 'generate_sales_report'
          },
          {
            id: 'generate_sales_report',
            type: 'generate_report',
            name: 'Generate Sales Report',
            config: {
              reportId: '{{config.salesReportId}}',
              parameters: {
                date_range: {
                  startDate: '@LAST_WEEK_START',
                  endDate: '@LAST_WEEK_END'
                }
              }
            },
            outputs: {
              result: 'salesReport'
            },
            next: 'generate_kpi_report'
          },
          {
            id: 'generate_kpi_report',
            type: 'generate_report',
            name: 'Generate KPI Report',
            config: {
              reportId: '{{config.kpiReportId}}',
              parameters: {
                date_range: {
                  startDate: '@LAST_WEEK_START',
                  endDate: '@LAST_WEEK_END'
                }
              }
            },
            outputs: {
              result: 'kpiReport'
            },
            next: 'combine_reports'
          },
          {
            id: 'combine_reports',
            type: 'data_transform',
            name: 'Combine Reports',
            config: {
              script: `
                return {
                  week: moment().subtract(1, 'week').format('YYYY-[W]WW'),
                  sales: context.outputs.salesReport,
                  kpis: context.outputs.kpiReport,
                  generatedAt: new Date()
                };
              `
            },
            outputs: {
              result: 'combinedReport'
            },
            next: 'email_to_team'
          },
          {
            id: 'email_to_team',
            type: 'email_report',
            name: 'Email to Team',
            config: {
              recipients: '{{config.reportRecipients}}',
              subject: 'Weekly Report - Week {{outputs.combinedReport.week}}',
              format: 'pdf',
              includeInline: true
            }
          }
        ],
        variables: {
          config: {
            salesReportId: null,
            kpiReportId: null,
            reportRecipients: []
          }
        }
      },
      requiredConfig: [
        { name: 'salesReportId', type: 'report', description: 'Sales report to generate' },
        { name: 'kpiReportId', type: 'report', description: 'KPI report to generate' },
        { name: 'reportRecipients', type: 'email_list', description: 'Email recipients list' }
      ]
    });

    // Template 4: Customer Onboarding
    this.registerTemplate({
      id: 'customer-onboarding',
      name: 'Customer Onboarding Workflow',
      description: 'Automated onboarding sequence for new customers',
      category: 'customer_onboarding',
      icon: '🎉',
      difficulty: 'intermediate',
      estimatedSetupTime: 20,
      tags: ['crm', 'onboarding', 'automation'],
      definition: {
        version: '1.0',
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            name: 'New Customer Signed Up',
            config: {
              triggerType: 'webhook',
              eventType: 'customer.created'
            },
            next: 'create_account'
          },
          {
            id: 'create_account',
            type: 'action',
            name: 'Create Customer Account',
            config: {
              action: 'create_account',
              parameters: {
                customerId: '{{customer.id}}',
                plan: '{{customer.plan}}'
              }
            },
            next: 'send_welcome_email'
          },
          {
            id: 'send_welcome_email',
            type: 'email_template',
            name: 'Send Welcome Email',
            config: {
              templateId: 'customer-welcome',
              to: '{{customer.email}}',
              variables: {
                customerName: '{{customer.name}}',
                accountUrl: '{{outputs.create_account.accountUrl}}'
              }
            },
            next: 'assign_success_manager'
          },
          {
            id: 'assign_success_manager',
            type: 'action',
            name: 'Assign Success Manager',
            config: {
              action: 'assign_manager',
              parameters: {
                customerId: '{{customer.id}}',
                managerId: 'auto' // Auto-assign based on load
              }
            },
            next: 'schedule_kickoff_call'
          },
          {
            id: 'schedule_kickoff_call',
            type: 'action',
            name: 'Schedule Kickoff Call',
            config: {
              action: 'create_calendar_event',
              parameters: {
                title: 'Kickoff Call - {{customer.name}}',
                duration: 60,
                attendees: ['{{customer.email}}', '{{outputs.assign_success_manager.managerEmail}}']
              }
            },
            next: 'wait_1_week'
          },
          {
            id: 'wait_1_week',
            type: 'wait',
            name: 'Wait 1 Week',
            config: {
              duration: 604800000 // 7 days
            },
            next: 'check_product_usage'
          },
          {
            id: 'check_product_usage',
            type: 'condition',
            name: 'Check Product Usage',
            config: {
              condition: 'context.variables.customer.loginCount > 0'
            },
            next: {
              true: 'send_tips_email',
              false: 'send_help_email'
            }
          },
          {
            id: 'send_tips_email',
            type: 'email_template',
            name: 'Send Tips & Tricks',
            config: {
              templateId: 'tips-and-tricks',
              to: '{{customer.email}}'
            }
          },
          {
            id: 'send_help_email',
            type: 'email_template',
            name: 'Offer Help',
            config: {
              templateId: 'need-help',
              to: '{{customer.email}}'
            },
            next: 'notify_success_manager'
          },
          {
            id: 'notify_success_manager',
            type: 'notification',
            name: 'Alert Success Manager',
            config: {
              recipients: ['{{outputs.assign_success_manager.managerId}}'],
              message: 'Customer {{customer.name}} has not logged in yet'
            }
          }
        ],
        variables: {
          customer: null
        }
      },
      requiredConfig: [
        { name: 'customer-welcome', type: 'email_template', description: 'Welcome email template' },
        { name: 'tips-and-tricks', type: 'email_template', description: 'Tips email template' },
        { name: 'need-help', type: 'email_template', description: 'Help offer email template' }
      ]
    });

    // Template 5: Content Moderation
    this.registerTemplate({
      id: 'content-moderation',
      name: 'AI-Powered Content Moderation',
      description: 'Automatically moderate user-generated content with AI',
      category: 'content_moderation',
      icon: '🛡️',
      difficulty: 'advanced',
      estimatedSetupTime: 10,
      tags: ['ai', 'moderation', 'security'],
      definition: {
        version: '1.0',
        steps: [
          {
            id: 'trigger',
            type: 'trigger',
            name: 'Content Posted',
            config: {
              triggerType: 'webhook',
              eventType: 'content.posted'
            },
            next: 'analyze_content'
          },
          {
            id: 'analyze_content',
            type: 'javascript',
            name: 'Call Moderation API',
            config: {
              code: `
                const axios = require('axios');
                const content = context.variables.content;

                const response = await axios.post('https://api.moderator.com/analyze', {
                  text: content.text,
                  images: content.images
                });

                return {
                  score: response.data.score,
                  categories: response.data.categories,
                  flagged: response.data.flagged
                };
              `
            },
            outputs: {
              result: 'moderationResult'
            },
            next: 'check_moderation_score'
          },
          {
            id: 'check_moderation_score',
            type: 'switch',
            name: 'Check Severity',
            config: {
              expression: 'context.outputs.moderationResult.score',
              cases: [
                { when: 'value < 0.3', then: 'approve_content' },
                { when: 'value >= 0.3 && value < 0.7', then: 'flag_for_review' },
                { when: 'value >= 0.7', then: 'auto_reject' }
              ]
            }
          },
          {
            id: 'approve_content',
            type: 'action',
            name: 'Approve Content',
            config: {
              action: 'update_content_status',
              parameters: {
                contentId: '{{content.id}}',
                status: 'approved'
              }
            }
          },
          {
            id: 'flag_for_review',
            type: 'action',
            name: 'Flag for Manual Review',
            config: {
              action: 'create_review_task',
              parameters: {
                contentId: '{{content.id}}',
                reason: '{{outputs.moderationResult.categories}}',
                priority: 'medium'
              }
            },
            next: 'notify_moderators'
          },
          {
            id: 'auto_reject',
            type: 'action',
            name: 'Auto-Reject Content',
            config: {
              action: 'update_content_status',
              parameters: {
                contentId: '{{content.id}}',
                status: 'rejected',
                reason: 'Violated community guidelines'
              }
            },
            next: 'notify_user'
          },
          {
            id: 'notify_moderators',
            type: 'notification',
            name: 'Notify Moderators',
            config: {
              recipients: ['moderator-team'],
              message: 'Content flagged for review: {{content.id}}'
            }
          },
          {
            id: 'notify_user',
            type: 'notification',
            name: 'Notify User',
            config: {
              recipients: ['{{content.authorId}}'],
              message: 'Your content was removed for violating community guidelines'
            }
          }
        ],
        variables: {
          content: null
        }
      }
    });

    logger.info('Workflow templates initialized', {
      templateCount: this.templates.size
    });
  }

  /**
   * Register a new template
   */
  registerTemplate(template) {
    this.templates.set(template.id, template);
  }

  /**
   * Get all templates
   */
  getAllTemplates(filters = {}) {
    let templates = Array.from(this.templates.values());

    // Apply filters
    if (filters.category) {
      templates = templates.filter(t => t.category === filters.category);
    }

    if (filters.difficulty) {
      templates = templates.filter(t => t.difficulty === filters.difficulty);
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      templates = templates.filter(t =>
        t.name.toLowerCase().includes(search) ||
        t.description.toLowerCase().includes(search) ||
        t.tags.some(tag => tag.includes(search))
      );
    }

    return templates;
  }

  /**
   * Get template by ID
   */
  getTemplate(templateId) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }
    return template;
  }

  /**
   * Get template categories
   */
  getCategories() {
    return this.categories;
  }

  /**
   * Create workflow from template
   */
  async createFromTemplate(templateId, userId, customization = {}) {
    try {
      const template = this.getTemplate(templateId);

      const {
        name = template.name,
        description = template.description,
        config = {},
        variables = {}
      } = customization;

      // Create workflow
      const workflow = await Workflow.create({
        name,
        description,
        version: 1,
        status: 'draft',
        triggerType: 'manual',
        definition: {
          ...template.definition,
          variables: {
            ...template.definition.variables,
            ...variables
          }
        },
        ownerId: userId,
        templateId: templateId,
        isFromTemplate: true
      });

      // Create steps
      for (const stepDef of template.definition.steps) {
        await WorkflowStep.create({
          workflowId: workflow.id,
          stepId: stepDef.id,
          stepType: stepDef.type,
          name: stepDef.name,
          config: stepDef.config,
          nextSteps: this.convertNextToArray(stepDef.next),
          order: template.definition.steps.indexOf(stepDef)
        });
      }

      logger.info('Workflow created from template', {
        templateId,
        workflowId: workflow.id,
        userId
      });

      return workflow;
    } catch (error) {
      logger.error('Failed to create workflow from template', {
        templateId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Convert next step notation to array format
   */
  convertNextToArray(next) {
    if (!next) return [];
    if (typeof next === 'string') return [next];
    if (typeof next === 'object') {
      // Conditional next steps
      return Object.entries(next).map(([condition, stepId]) => ({
        condition,
        stepId
      }));
    }
    return [];
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category) {
    return Array.from(this.templates.values()).filter(
      t => t.category === category
    );
  }

  /**
   * Search templates
   */
  searchTemplates(query) {
    const search = query.toLowerCase();
    return Array.from(this.templates.values()).filter(template =>
      template.name.toLowerCase().includes(search) ||
      template.description.toLowerCase().includes(search) ||
      template.tags.some(tag => tag.toLowerCase().includes(search))
    );
  }
}

module.exports = new WorkflowTemplateService();
