/**
 * CRM Report Builder Service
 * Generates reports for CRM module (Contacts, Leads, Opportunities, etc.)
 */

const { Contact, Company, Lead, Opportunity, Activity, Campaign, SupportTicket } = require('../../../models/forge');
const { Op } = require('sequelize');
const reportVariableService = require('../shared/reportVariableService');
const logger = require('../../../utils/logger');

class CRMReportService {
  constructor() {
    // Available CRM reports
    this.availableReports = {
      contacts_list: {
        name: 'Contacts List',
        description: 'List of all contacts with filtering and grouping',
        category: 'crm',
        variables: this.getContactsListVariables()
      },
      leads_pipeline: {
        name: 'Leads Pipeline',
        description: 'Lead status distribution and conversion metrics',
        category: 'crm',
        variables: this.getLeadsPipelineVariables()
      },
      opportunities_forecast: {
        name: 'Opportunities Forecast',
        description: 'Sales forecast and opportunity tracking',
        category: 'crm',
        variables: this.getOpportunitiesForecastVariables()
      },
      activities_summary: {
        name: 'Activities Summary',
        description: 'Activity tracking and completion rates',
        category: 'crm',
        variables: this.getActivitiesSummaryVariables()
      },
      campaign_performance: {
        name: 'Campaign Performance',
        description: 'Campaign metrics and ROI analysis',
        category: 'crm',
        variables: this.getCampaignPerformanceVariables()
      },
      support_tickets: {
        name: 'Support Tickets Report',
        description: 'Ticket volume, resolution time, and SLA compliance',
        category: 'crm',
        variables: this.getSupportTicketsVariables()
      },
      sales_funnel: {
        name: 'Sales Funnel Analysis',
        description: 'Lead to customer conversion funnel',
        category: 'crm',
        variables: this.getSalesFunnelVariables()
      },
      customer_engagement: {
        name: 'Customer Engagement',
        description: 'Contact interaction frequency and patterns',
        category: 'crm',
        variables: this.getCustomerEngagementVariables()
      }
    };
  }

  /**
   * Get available CRM reports
   */
  getAvailableReports() {
    return this.availableReports;
  }

  /**
   * Generate a CRM report
   */
  async generateReport(reportType, parameters, context = {}) {
    const reportConfig = this.availableReports[reportType];

    if (!reportConfig) {
      throw new Error(`Unknown CRM report type: ${reportType}`);
    }

    // Resolve variables
    const variables = reportVariableService.resolveVariables(
      reportConfig.variables,
      parameters,
      context
    );

    // Validate variables
    const validation = reportVariableService.validateVariables(
      reportConfig.variables,
      variables
    );

    if (!validation.valid) {
      throw new Error(`Variable validation failed: ${JSON.stringify(validation.errors)}`);
    }

    // Generate the specific report
    switch (reportType) {
      case 'contacts_list':
        return await this.generateContactsList(variables);
      case 'leads_pipeline':
        return await this.generateLeadsPipeline(variables);
      case 'opportunities_forecast':
        return await this.generateOpportunitiesForecast(variables);
      case 'activities_summary':
        return await this.generateActivitiesSummary(variables);
      case 'campaign_performance':
        return await this.generateCampaignPerformance(variables);
      case 'support_tickets':
        return await this.generateSupportTickets(variables);
      case 'sales_funnel':
        return await this.generateSalesFunnel(variables);
      case 'customer_engagement':
        return await this.generateCustomerEngagement(variables);
      default:
        throw new Error(`Report type not implemented: ${reportType}`);
    }
  }

  // ===== Variable Definitions =====

  getContactsListVariables() {
    return {
      ...reportVariableService.createCommonVariables('crm'),
      contact_type: reportVariableService.createSelectVariable(
        'contact_type',
        'Contact Type',
        [
          { label: 'All', value: 'all' },
          { label: 'Lead', value: 'lead' },
          { label: 'Customer', value: 'customer' },
          { label: 'Partner', value: 'partner' }
        ],
        { defaultValue: 'all', required: false }
      ),
      company_id: reportVariableService.defineVariable({
        name: 'company_id',
        label: 'Company',
        type: reportVariableService.variableTypes.SELECT,
        description: 'Filter by company',
        required: false
      }),
      tags: reportVariableService.defineVariable({
        name: 'tags',
        label: 'Tags',
        type: reportVariableService.variableTypes.MULTI_SELECT,
        description: 'Filter by tags',
        required: false
      }),
      group_by: reportVariableService.createSelectVariable(
        'group_by',
        'Group By',
        [
          { label: 'None', value: 'none' },
          { label: 'Company', value: 'company' },
          { label: 'Type', value: 'type' },
          { label: 'Assigned To', value: 'assigned_to' },
          { label: 'Created Month', value: 'created_month' }
        ],
        { defaultValue: 'none', required: false }
      )
    };
  }

  getLeadsPipelineVariables() {
    return {
      ...reportVariableService.createCommonVariables('crm'),
      lead_source: reportVariableService.createSelectVariable(
        'lead_source',
        'Lead Source',
        [
          { label: 'All', value: 'all' },
          { label: 'Website', value: 'website' },
          { label: 'Referral', value: 'referral' },
          { label: 'Campaign', value: 'campaign' },
          { label: 'Direct', value: 'direct' }
        ],
        { defaultValue: 'all', required: false }
      ),
      lead_status: reportVariableService.createSelectVariable(
        'lead_status',
        'Lead Status',
        [
          { label: 'All', value: 'all' },
          { label: 'New', value: 'new' },
          { label: 'Contacted', value: 'contacted' },
          { label: 'Qualified', value: 'qualified' },
          { label: 'Unqualified', value: 'unqualified' },
          { label: 'Converted', value: 'converted' }
        ],
        { defaultValue: 'all', required: false }
      ),
      show_conversion_rate: reportVariableService.defineVariable({
        name: 'show_conversion_rate',
        label: 'Show Conversion Rate',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: true,
        required: false
      })
    };
  }

  getOpportunitiesForecastVariables() {
    return {
      ...reportVariableService.createCommonVariables('crm'),
      stage: reportVariableService.createSelectVariable(
        'stage',
        'Opportunity Stage',
        [
          { label: 'All', value: 'all' },
          { label: 'Prospecting', value: 'prospecting' },
          { label: 'Qualification', value: 'qualification' },
          { label: 'Proposal', value: 'proposal' },
          { label: 'Negotiation', value: 'negotiation' },
          { label: 'Closed Won', value: 'closed_won' },
          { label: 'Closed Lost', value: 'closed_lost' }
        ],
        { defaultValue: 'all', required: false }
      ),
      probability_min: reportVariableService.defineVariable({
        name: 'probability_min',
        label: 'Minimum Probability (%)',
        type: reportVariableService.variableTypes.NUMBER,
        defaultValue: 0,
        min: 0,
        max: 100,
        required: false
      }),
      amount_min: reportVariableService.defineVariable({
        name: 'amount_min',
        label: 'Minimum Amount',
        type: reportVariableService.variableTypes.CURRENCY,
        defaultValue: null,
        required: false
      }),
      forecast_type: reportVariableService.createSelectVariable(
        'forecast_type',
        'Forecast Type',
        [
          { label: 'Best Case', value: 'best' },
          { label: 'Most Likely', value: 'likely' },
          { label: 'Worst Case', value: 'worst' }
        ],
        { defaultValue: 'likely', required: true }
      )
    };
  }

  getActivitiesSummaryVariables() {
    return {
      ...reportVariableService.createCommonVariables('crm'),
      activity_type: reportVariableService.createSelectVariable(
        'activity_type',
        'Activity Type',
        [
          { label: 'All', value: 'all' },
          { label: 'Call', value: 'call' },
          { label: 'Email', value: 'email' },
          { label: 'Meeting', value: 'meeting' },
          { label: 'Task', value: 'task' },
          { label: 'Note', value: 'note' }
        ],
        { defaultValue: 'all', required: false }
      ),
      completed_only: reportVariableService.defineVariable({
        name: 'completed_only',
        label: 'Completed Only',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: false,
        required: false
      }),
      group_by: reportVariableService.createSelectVariable(
        'group_by',
        'Group By',
        [
          { label: 'Type', value: 'type' },
          { label: 'User', value: 'user' },
          { label: 'Date', value: 'date' }
        ],
        { defaultValue: 'type', required: false }
      )
    };
  }

  getCampaignPerformanceVariables() {
    return {
      ...reportVariableService.createCommonVariables('crm'),
      campaign_id: reportVariableService.defineVariable({
        name: 'campaign_id',
        label: 'Campaign',
        type: reportVariableService.variableTypes.SELECT,
        description: 'Select specific campaign or all',
        required: false
      }),
      campaign_type: reportVariableService.createSelectVariable(
        'campaign_type',
        'Campaign Type',
        [
          { label: 'All', value: 'all' },
          { label: 'Email', value: 'email' },
          { label: 'Social', value: 'social' },
          { label: 'Event', value: 'event' },
          { label: 'Webinar', value: 'webinar' }
        ],
        { defaultValue: 'all', required: false }
      ),
      show_roi: reportVariableService.defineVariable({
        name: 'show_roi',
        label: 'Show ROI Analysis',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: true,
        required: false
      })
    };
  }

  getSupportTicketsVariables() {
    return {
      ...reportVariableService.createCommonVariables('crm'),
      ticket_status: reportVariableService.createSelectVariable(
        'ticket_status',
        'Ticket Status',
        [
          { label: 'All', value: 'all' },
          { label: 'Open', value: 'open' },
          { label: 'In Progress', value: 'in_progress' },
          { label: 'Pending', value: 'pending' },
          { label: 'Resolved', value: 'resolved' },
          { label: 'Closed', value: 'closed' }
        ],
        { defaultValue: 'all', required: false }
      ),
      priority: reportVariableService.createSelectVariable(
        'priority',
        'Priority',
        [
          { label: 'All', value: 'all' },
          { label: 'Low', value: 'low' },
          { label: 'Medium', value: 'medium' },
          { label: 'High', value: 'high' },
          { label: 'Critical', value: 'critical' }
        ],
        { defaultValue: 'all', required: false }
      ),
      show_sla_compliance: reportVariableService.defineVariable({
        name: 'show_sla_compliance',
        label: 'Show SLA Compliance',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: true,
        required: false
      })
    };
  }

  getSalesFunnelVariables() {
    return {
      ...reportVariableService.createCommonVariables('crm'),
      funnel_stage: reportVariableService.createSelectVariable(
        'funnel_stage',
        'Focus Stage',
        [
          { label: 'Full Funnel', value: 'all' },
          { label: 'Lead Generation', value: 'lead' },
          { label: 'Qualification', value: 'qualification' },
          { label: 'Opportunity', value: 'opportunity' },
          { label: 'Closing', value: 'closing' }
        ],
        { defaultValue: 'all', required: false }
      )
    };
  }

  getCustomerEngagementVariables() {
    return {
      ...reportVariableService.createCommonVariables('crm'),
      engagement_score_min: reportVariableService.defineVariable({
        name: 'engagement_score_min',
        label: 'Minimum Engagement Score',
        type: reportVariableService.variableTypes.NUMBER,
        defaultValue: 0,
        min: 0,
        max: 100,
        required: false
      }),
      last_contact_days: reportVariableService.defineVariable({
        name: 'last_contact_days',
        label: 'Last Contact Within (Days)',
        type: reportVariableService.variableTypes.NUMBER,
        defaultValue: 30,
        min: 1,
        max: 365,
        required: false
      })
    };
  }

  // ===== Report Generators =====

  async generateContactsList(variables) {
    const where = this.buildContactsWhere(variables);

    const contacts = await Contact.findAll({
      where,
      include: [
        {
          model: Company,
          as: 'company',
          required: false
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Group if requested
    let groupedData = null;
    if (variables.group_by && variables.group_by !== 'none') {
      groupedData = this.groupContacts(contacts, variables.group_by);
    }

    return {
      reportType: 'contacts_list',
      title: reportVariableService.substituteInText(
        'Contacts List - {{date_range}}',
        variables
      ),
      generatedAt: new Date(),
      parameters: variables,
      data: contacts.map(c => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        phone: c.phone,
        company: c.company?.name || null,
        type: c.contactType,
        status: c.status,
        assignedTo: c.assignedTo,
        createdAt: c.createdAt
      })),
      grouped: groupedData,
      rowCount: contacts.length,
      summary: {
        totalContacts: contacts.length,
        byType: this.countByField(contacts, 'contactType'),
        byStatus: this.countByField(contacts, 'status')
      }
    };
  }

  async generateLeadsPipeline(variables) {
    const where = this.buildLeadsWhere(variables);

    const leads = await Lead.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });

    // Calculate pipeline metrics
    const totalLeads = leads.length;
    const byStatus = this.countByField(leads, 'status');
    const bySource = this.countByField(leads, 'source');

    // Conversion metrics
    const convertedLeads = leads.filter(l => l.status === 'converted').length;
    const conversionRate = totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0;

    return {
      reportType: 'leads_pipeline',
      title: 'Leads Pipeline Report',
      generatedAt: new Date(),
      parameters: variables,
      data: leads.map(l => ({
        id: l.id,
        name: l.name,
        email: l.email,
        phone: l.phone,
        company: l.company,
        source: l.source,
        status: l.status,
        score: l.score,
        assignedTo: l.assignedTo,
        createdAt: l.createdAt
      })),
      rowCount: totalLeads,
      summary: {
        totalLeads,
        byStatus,
        bySource,
        converted: convertedLeads,
        conversionRate: conversionRate.toFixed(2) + '%'
      },
      pipeline: {
        new: byStatus.new || 0,
        contacted: byStatus.contacted || 0,
        qualified: byStatus.qualified || 0,
        unqualified: byStatus.unqualified || 0,
        converted: byStatus.converted || 0
      }
    };
  }

  async generateOpportunitiesForecast(variables) {
    const where = this.buildOpportunitiesWhere(variables);

    const opportunities = await Opportunity.findAll({
      where,
      include: [
        { model: Contact, as: 'contact', required: false },
        { model: Company, as: 'company', required: false }
      ],
      order: [['closeDate', 'ASC']]
    });

    // Calculate forecast
    const forecastData = this.calculateForecast(opportunities, variables.forecast_type);

    return {
      reportType: 'opportunities_forecast',
      title: 'Opportunities Forecast',
      generatedAt: new Date(),
      parameters: variables,
      data: opportunities.map(o => ({
        id: o.id,
        name: o.name,
        stage: o.stage,
        amount: o.amount,
        probability: o.probability,
        expectedValue: (o.amount * o.probability) / 100,
        closeDate: o.closeDate,
        contact: o.contact ? `${o.contact.firstName} ${o.contact.lastName}` : null,
        company: o.company?.name || null,
        assignedTo: o.assignedTo
      })),
      rowCount: opportunities.length,
      summary: {
        totalOpportunities: opportunities.length,
        totalAmount: forecastData.totalAmount,
        weightedAmount: forecastData.weightedAmount,
        byStage: forecastData.byStage,
        averageAmount: forecastData.averageAmount,
        averageProbability: forecastData.averageProbability
      },
      forecast: forecastData
    };
  }

  async generateActivitiesSummary(variables) {
    const where = this.buildActivitiesWhere(variables);

    const activities = await Activity.findAll({
      where,
      include: [
        { model: Contact, required: false },
        { model: Lead, required: false },
        { model: Opportunity, required: false }
      ],
      order: [['activityDate', 'DESC']]
    });

    const groupedData = this.groupActivities(activities, variables.group_by);

    return {
      reportType: 'activities_summary',
      title: 'Activities Summary',
      generatedAt: new Date(),
      parameters: variables,
      data: activities.map(a => ({
        id: a.id,
        type: a.activityType,
        subject: a.subject,
        description: a.description,
        status: a.status,
        activityDate: a.activityDate,
        duration: a.duration,
        assignedTo: a.assignedTo,
        contactId: a.contactId,
        leadId: a.leadId,
        opportunityId: a.opportunityId
      })),
      rowCount: activities.length,
      grouped: groupedData,
      summary: {
        totalActivities: activities.length,
        byType: this.countByField(activities, 'activityType'),
        byStatus: this.countByField(activities, 'status'),
        completed: activities.filter(a => a.status === 'completed').length,
        completionRate: activities.length > 0
          ? ((activities.filter(a => a.status === 'completed').length / activities.length) * 100).toFixed(2) + '%'
          : '0%'
      }
    };
  }

  async generateCampaignPerformance(variables) {
    const where = {};

    if (variables.campaign_id) {
      where.id = variables.campaign_id;
    }

    if (variables.campaign_type && variables.campaign_type !== 'all') {
      where.campaignType = variables.campaign_type;
    }

    if (variables.date_range) {
      where.startDate = {
        [Op.gte]: variables.date_range.startDate,
        [Op.lte]: variables.date_range.endDate
      };
    }

    const campaigns = await Campaign.findAll({
      where,
      order: [['startDate', 'DESC']]
    });

    return {
      reportType: 'campaign_performance',
      title: 'Campaign Performance Report',
      generatedAt: new Date(),
      parameters: variables,
      data: campaigns.map(c => ({
        id: c.id,
        name: c.name,
        type: c.campaignType,
        status: c.status,
        startDate: c.startDate,
        endDate: c.endDate,
        budget: c.budget,
        actualCost: c.actualCost,
        leads: c.leadsGenerated || 0,
        conversions: c.conversions || 0,
        revenue: c.revenue || 0,
        roi: c.budget > 0 ? ((c.revenue - c.actualCost) / c.actualCost * 100).toFixed(2) + '%' : 'N/A'
      })),
      rowCount: campaigns.length,
      summary: {
        totalCampaigns: campaigns.length,
        totalBudget: campaigns.reduce((sum, c) => sum + (c.budget || 0), 0),
        totalSpent: campaigns.reduce((sum, c) => sum + (c.actualCost || 0), 0),
        totalLeads: campaigns.reduce((sum, c) => sum + (c.leadsGenerated || 0), 0),
        totalRevenue: campaigns.reduce((sum, c) => sum + (c.revenue || 0), 0),
        byType: this.countByField(campaigns, 'campaignType'),
        byStatus: this.countByField(campaigns, 'status')
      }
    };
  }

  async generateSupportTickets(variables) {
    const where = this.buildTicketsWhere(variables);

    const tickets = await SupportTicket.findAll({
      where,
      include: [
        { model: Contact, as: 'contact', required: false },
        { model: Company, required: false }
      ],
      order: [['createdAt', 'DESC']]
    });

    // Calculate SLA metrics if requested
    let slaMetrics = null;
    if (variables.show_sla_compliance) {
      slaMetrics = this.calculateSLAMetrics(tickets);
    }

    return {
      reportType: 'support_tickets',
      title: 'Support Tickets Report',
      generatedAt: new Date(),
      parameters: variables,
      data: tickets.map(t => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        subject: t.subject,
        status: t.status,
        priority: t.priority,
        category: t.category,
        assignedTo: t.assignedTo,
        createdAt: t.createdAt,
        resolvedAt: t.resolvedAt,
        resolutionTime: t.resolvedAt
          ? Math.round((new Date(t.resolvedAt) - new Date(t.createdAt)) / (1000 * 60 * 60))
          : null
      })),
      rowCount: tickets.length,
      summary: {
        totalTickets: tickets.length,
        byStatus: this.countByField(tickets, 'status'),
        byPriority: this.countByField(tickets, 'priority'),
        open: tickets.filter(t => ['open', 'in_progress', 'pending'].includes(t.status)).length,
        resolved: tickets.filter(t => t.status === 'resolved').length,
        closed: tickets.filter(t => t.status === 'closed').length
      },
      slaMetrics
    };
  }

  async generateSalesFunnel(variables) {
    // This would query across Leads, Opportunities, and Contacts to build a funnel
    const dateFilter = variables.date_range
      ? {
          createdAt: {
            [Op.gte]: variables.date_range.startDate,
            [Op.lte]: variables.date_range.endDate
          }
        }
      : {};

    const [leads, opportunities, conversions] = await Promise.all([
      Lead.count({ where: dateFilter }),
      Opportunity.count({ where: dateFilter }),
      Lead.count({ where: { ...dateFilter, status: 'converted' } })
    ]);

    const funnelData = {
      leads,
      qualified: Math.round(leads * 0.4), // Example calculation
      opportunities,
      conversions,
      leadsToOpportunityRate: leads > 0 ? ((opportunities / leads) * 100).toFixed(2) + '%' : '0%',
      conversionRate: leads > 0 ? ((conversions / leads) * 100).toFixed(2) + '%' : '0%'
    };

    return {
      reportType: 'sales_funnel',
      title: 'Sales Funnel Analysis',
      generatedAt: new Date(),
      parameters: variables,
      funnel: funnelData,
      stages: [
        { stage: 'Leads', count: funnelData.leads, percentage: 100 },
        {
          stage: 'Qualified',
          count: funnelData.qualified,
          percentage: leads > 0 ? ((funnelData.qualified / leads) * 100).toFixed(2) : 0
        },
        {
          stage: 'Opportunities',
          count: funnelData.opportunities,
          percentage: leads > 0 ? ((opportunities / leads) * 100).toFixed(2) : 0
        },
        {
          stage: 'Conversions',
          count: funnelData.conversions,
          percentage: leads > 0 ? ((conversions / leads) * 100).toFixed(2) : 0
        }
      ]
    };
  }

  async generateCustomerEngagement(variables) {
    // Placeholder - would calculate engagement scores based on activities
    return {
      reportType: 'customer_engagement',
      title: 'Customer Engagement Report',
      generatedAt: new Date(),
      parameters: variables,
      message: 'Customer engagement report - implementation in progress'
    };
  }

  // ===== Helper Methods =====

  buildContactsWhere(variables) {
    const where = {};

    if (variables.date_range) {
      where.createdAt = {
        [Op.gte]: variables.date_range.startDate,
        [Op.lte]: variables.date_range.endDate
      };
    }

    if (variables.contact_type && variables.contact_type !== 'all') {
      where.contactType = variables.contact_type;
    }

    if (variables.status && variables.status !== 'all') {
      where.status = variables.status;
    }

    if (variables.company_id) {
      where.companyId = variables.company_id;
    }

    if (variables.assigned_to) {
      where.assignedTo = variables.assigned_to;
    }

    if (variables.tags && variables.tags.length > 0) {
      where.tags = { [Op.overlap]: variables.tags };
    }

    return where;
  }

  buildLeadsWhere(variables) {
    const where = {};

    if (variables.date_range) {
      where.createdAt = {
        [Op.gte]: variables.date_range.startDate,
        [Op.lte]: variables.date_range.endDate
      };
    }

    if (variables.lead_source && variables.lead_source !== 'all') {
      where.source = variables.lead_source;
    }

    if (variables.lead_status && variables.lead_status !== 'all') {
      where.status = variables.lead_status;
    }

    if (variables.assigned_to) {
      where.assignedTo = variables.assigned_to;
    }

    return where;
  }

  buildOpportunitiesWhere(variables) {
    const where = {};

    if (variables.date_range) {
      where.createdAt = {
        [Op.gte]: variables.date_range.startDate,
        [Op.lte]: variables.date_range.endDate
      };
    }

    if (variables.stage && variables.stage !== 'all') {
      where.stage = variables.stage;
    }

    if (variables.probability_min !== null && variables.probability_min !== undefined) {
      where.probability = { [Op.gte]: variables.probability_min };
    }

    if (variables.amount_min) {
      where.amount = { [Op.gte]: variables.amount_min };
    }

    if (variables.assigned_to) {
      where.assignedTo = variables.assigned_to;
    }

    return where;
  }

  buildActivitiesWhere(variables) {
    const where = {};

    if (variables.date_range) {
      where.activityDate = {
        [Op.gte]: variables.date_range.startDate,
        [Op.lte]: variables.date_range.endDate
      };
    }

    if (variables.activity_type && variables.activity_type !== 'all') {
      where.activityType = variables.activity_type;
    }

    if (variables.completed_only) {
      where.status = 'completed';
    }

    if (variables.assigned_to) {
      where.assignedTo = variables.assigned_to;
    }

    return where;
  }

  buildTicketsWhere(variables) {
    const where = {};

    if (variables.date_range) {
      where.createdAt = {
        [Op.gte]: variables.date_range.startDate,
        [Op.lte]: variables.date_range.endDate
      };
    }

    if (variables.ticket_status && variables.ticket_status !== 'all') {
      where.status = variables.ticket_status;
    }

    if (variables.priority && variables.priority !== 'all') {
      where.priority = variables.priority;
    }

    if (variables.assigned_to) {
      where.assignedTo = variables.assigned_to;
    }

    return where;
  }

  groupContacts(contacts, groupBy) {
    const grouped = {};

    contacts.forEach(contact => {
      let key;
      switch (groupBy) {
        case 'company':
          key = contact.company?.name || 'No Company';
          break;
        case 'type':
          key = contact.contactType || 'Unknown';
          break;
        case 'assigned_to':
          key = contact.assignedTo || 'Unassigned';
          break;
        case 'created_month':
          key = new Date(contact.createdAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long'
          });
          break;
        default:
          key = 'All';
      }

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(contact);
    });

    return grouped;
  }

  groupActivities(activities, groupBy) {
    const grouped = {};

    activities.forEach(activity => {
      let key;
      switch (groupBy) {
        case 'type':
          key = activity.activityType;
          break;
        case 'user':
          key = activity.assignedTo || 'Unassigned';
          break;
        case 'date':
          key = new Date(activity.activityDate).toLocaleDateString();
          break;
        default:
          key = 'All';
      }

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(activity);
    });

    return grouped;
  }

  countByField(items, field) {
    const counts = {};
    items.forEach(item => {
      const value = item[field] || 'Unknown';
      counts[value] = (counts[value] || 0) + 1;
    });
    return counts;
  }

  calculateForecast(opportunities, forecastType) {
    const totalAmount = opportunities.reduce((sum, o) => sum + (o.amount || 0), 0);
    const weightedAmount = opportunities.reduce(
      (sum, o) => sum + ((o.amount || 0) * (o.probability || 0)) / 100,
      0
    );

    const byStage = {};
    opportunities.forEach(opp => {
      if (!byStage[opp.stage]) {
        byStage[opp.stage] = { count: 0, amount: 0, weightedAmount: 0 };
      }
      byStage[opp.stage].count++;
      byStage[opp.stage].amount += opp.amount || 0;
      byStage[opp.stage].weightedAmount += ((opp.amount || 0) * (opp.probability || 0)) / 100;
    });

    return {
      totalAmount,
      weightedAmount,
      byStage,
      averageAmount: opportunities.length > 0 ? totalAmount / opportunities.length : 0,
      averageProbability:
        opportunities.length > 0
          ? opportunities.reduce((sum, o) => sum + (o.probability || 0), 0) / opportunities.length
          : 0
    };
  }

  calculateSLAMetrics(tickets) {
    // Simplified SLA calculation - would integrate with actual SLA service
    const totalTickets = tickets.length;
    const resolvedTickets = tickets.filter(t => t.resolvedAt).length;

    const avgResolutionTime =
      resolvedTickets > 0
        ? tickets
            .filter(t => t.resolvedAt)
            .reduce(
              (sum, t) =>
                sum + (new Date(t.resolvedAt) - new Date(t.createdAt)) / (1000 * 60 * 60),
              0
            ) / resolvedTickets
        : 0;

    return {
      totalTickets,
      resolvedTickets,
      resolutionRate: totalTickets > 0 ? ((resolvedTickets / totalTickets) * 100).toFixed(2) + '%' : '0%',
      avgResolutionTimeHours: avgResolutionTime.toFixed(2),
      withinSLA: Math.round(resolvedTickets * 0.85), // Placeholder
      slaComplianceRate: '85%' // Placeholder
    };
  }
}

module.exports = new CRMReportService();
