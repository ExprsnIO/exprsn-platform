/**
 * ERP Report Builder Service
 * Generates reports for ERP module (Financial, Inventory, HR, Assets, etc.)
 */

const financialReportingService = require('./financialReportingService');
const { Product, Inventory, Employee, Department, Asset, SalesOrder, PurchaseOrder } = require('../../../models/forge');
const { Op } = require('sequelize');
const reportVariableService = require('../shared/reportVariableService');
const logger = require('../../../utils/logger');

class ERPReportBuilderService {
  constructor() {
    this.availableReports = {
      // Financial Reports
      balance_sheet: {
        name: 'Balance Sheet',
        description: 'Statement of financial position',
        category: 'erp_financial',
        variables: this.getBalanceSheetVariables()
      },
      profit_loss: {
        name: 'Profit & Loss Statement',
        description: 'Income statement showing revenue and expenses',
        category: 'erp_financial',
        variables: this.getProfitLossVariables()
      },
      cash_flow: {
        name: 'Cash Flow Statement',
        description: 'Statement of cash flows',
        category: 'erp_financial',
        variables: this.getCashFlowVariables()
      },
      general_ledger: {
        name: 'General Ledger',
        description: 'Detailed account transactions',
        category: 'erp_financial',
        variables: this.getGeneralLedgerVariables()
      },
      financial_ratios: {
        name: 'Financial Ratios',
        description: 'Key financial metrics and ratios',
        category: 'erp_financial',
        variables: this.getFinancialRatiosVariables()
      },

      // Inventory Reports
      inventory_valuation: {
        name: 'Inventory Valuation',
        description: 'Current inventory value by product',
        category: 'erp_inventory',
        variables: this.getInventoryValuationVariables()
      },
      stock_movement: {
        name: 'Stock Movement Report',
        description: 'Inventory movements and transactions',
        category: 'erp_inventory',
        variables: this.getStockMovementVariables()
      },
      reorder_report: {
        name: 'Reorder Report',
        description: 'Products below reorder point',
        category: 'erp_inventory',
        variables: this.getReorderReportVariables()
      },

      // Sales Reports
      sales_summary: {
        name: 'Sales Summary',
        description: 'Sales performance and trends',
        category: 'erp_sales',
        variables: this.getSalesSummaryVariables()
      },
      sales_by_product: {
        name: 'Sales by Product',
        description: 'Product-wise sales analysis',
        category: 'erp_sales',
        variables: this.getSalesByProductVariables()
      },
      sales_by_customer: {
        name: 'Sales by Customer',
        description: 'Customer-wise sales analysis',
        category: 'erp_sales',
        variables: this.getSalesByCustomerVariables()
      },

      // HR Reports
      employee_roster: {
        name: 'Employee Roster',
        description: 'Complete employee listing',
        category: 'erp_hr',
        variables: this.getEmployeeRosterVariables()
      },
      payroll_summary: {
        name: 'Payroll Summary',
        description: 'Payroll costs and breakdown',
        category: 'erp_hr',
        variables: this.getPayrollSummaryVariables()
      },
      leave_report: {
        name: 'Leave Report',
        description: 'Employee leave tracking and balances',
        category: 'erp_hr',
        variables: this.getLeaveReportVariables()
      },
      headcount_report: {
        name: 'Headcount Report',
        description: 'Employee count by department',
        category: 'erp_hr',
        variables: this.getHeadcountReportVariables()
      },

      // Asset Reports
      asset_register: {
        name: 'Asset Register',
        description: 'Complete asset listing with values',
        category: 'erp_assets',
        variables: this.getAssetRegisterVariables()
      },
      depreciation_schedule: {
        name: 'Depreciation Schedule',
        description: 'Asset depreciation projections',
        category: 'erp_assets',
        variables: this.getDepreciationScheduleVariables()
      },
      asset_allocation: {
        name: 'Asset Allocation',
        description: 'Asset assignment by department/employee',
        category: 'erp_assets',
        variables: this.getAssetAllocationVariables()
      }
    };
  }

  /**
   * Get available ERP reports
   */
  getAvailableReports() {
    return this.availableReports;
  }

  /**
   * Generate an ERP report
   */
  async generateReport(reportType, parameters, context = {}) {
    const reportConfig = this.availableReports[reportType];

    if (!reportConfig) {
      throw new Error(`Unknown ERP report type: ${reportType}`);
    }

    const variables = reportVariableService.resolveVariables(
      reportConfig.variables,
      parameters,
      context
    );

    const validation = reportVariableService.validateVariables(
      reportConfig.variables,
      variables
    );

    if (!validation.valid) {
      throw new Error(`Variable validation failed: ${JSON.stringify(validation.errors)}`);
    }

    // Generate the specific report
    switch (reportType) {
      // Financial
      case 'balance_sheet':
        return await this.generateBalanceSheet(variables);
      case 'profit_loss':
        return await this.generateProfitLoss(variables);
      case 'cash_flow':
        return await this.generateCashFlow(variables);
      case 'general_ledger':
        return await this.generateGeneralLedger(variables);
      case 'financial_ratios':
        return await this.generateFinancialRatios(variables);

      // Inventory
      case 'inventory_valuation':
        return await this.generateInventoryValuation(variables);
      case 'stock_movement':
        return await this.generateStockMovement(variables);
      case 'reorder_report':
        return await this.generateReorderReport(variables);

      // Sales
      case 'sales_summary':
        return await this.generateSalesSummary(variables);
      case 'sales_by_product':
        return await this.generateSalesByProduct(variables);
      case 'sales_by_customer':
        return await this.generateSalesByCustomer(variables);

      // HR
      case 'employee_roster':
        return await this.generateEmployeeRoster(variables);
      case 'payroll_summary':
        return await this.generatePayrollSummary(variables);
      case 'leave_report':
        return await this.generateLeaveReport(variables);
      case 'headcount_report':
        return await this.generateHeadcountReport(variables);

      // Assets
      case 'asset_register':
        return await this.generateAssetRegister(variables);
      case 'depreciation_schedule':
        return await this.generateDepreciationSchedule(variables);
      case 'asset_allocation':
        return await this.generateAssetAllocation(variables);

      default:
        throw new Error(`Report type not implemented: ${reportType}`);
    }
  }

  // ===== Variable Definitions =====

  getBalanceSheetVariables() {
    return {
      as_of_date: reportVariableService.defineVariable({
        name: 'as_of_date',
        label: 'As of Date',
        type: reportVariableService.variableTypes.DATE,
        defaultValue: '@TODAY',
        required: true
      }),
      comparison_date: reportVariableService.defineVariable({
        name: 'comparison_date',
        label: 'Comparison Date',
        type: reportVariableService.variableTypes.DATE,
        description: 'Optional comparison period',
        required: false
      }),
      show_percentages: reportVariableService.defineVariable({
        name: 'show_percentages',
        label: 'Show Percentages',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: true,
        required: false
      })
    };
  }

  getProfitLossVariables() {
    return {
      ...reportVariableService.createDateRangeVariable('date_range', 'Period'),
      group_by: reportVariableService.createSelectVariable(
        'group_by',
        'Group By',
        [
          { label: 'None', value: 'none' },
          { label: 'Month', value: 'month' },
          { label: 'Quarter', value: 'quarter' },
          { label: 'Department', value: 'department' }
        ],
        { defaultValue: 'none' }
      ),
      show_budget_variance: reportVariableService.defineVariable({
        name: 'show_budget_variance',
        label: 'Show Budget Variance',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: false,
        required: false
      })
    };
  }

  getCashFlowVariables() {
    return {
      ...reportVariableService.createDateRangeVariable('date_range', 'Period'),
      method: reportVariableService.createSelectVariable(
        'method',
        'Method',
        [
          { label: 'Direct', value: 'direct' },
          { label: 'Indirect', value: 'indirect' }
        ],
        { defaultValue: 'indirect' }
      )
    };
  }

  getGeneralLedgerVariables() {
    return {
      account_id: reportVariableService.defineVariable({
        name: 'account_id',
        label: 'Account',
        type: reportVariableService.variableTypes.ACCOUNT,
        required: true
      }),
      ...reportVariableService.createDateRangeVariable('date_range', 'Period'),
      show_running_balance: reportVariableService.defineVariable({
        name: 'show_running_balance',
        label: 'Show Running Balance',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: true,
        required: false
      })
    };
  }

  getFinancialRatiosVariables() {
    return {
      as_of_date: reportVariableService.defineVariable({
        name: 'as_of_date',
        label: 'As of Date',
        type: reportVariableService.variableTypes.DATE,
        defaultValue: '@TODAY',
        required: true
      }),
      ratio_categories: reportVariableService.defineVariable({
        name: 'ratio_categories',
        label: 'Ratio Categories',
        type: reportVariableService.variableTypes.MULTI_SELECT,
        options: [
          { label: 'Liquidity', value: 'liquidity' },
          { label: 'Profitability', value: 'profitability' },
          { label: 'Efficiency', value: 'efficiency' },
          { label: 'Leverage', value: 'leverage' }
        ],
        defaultValue: ['liquidity', 'profitability'],
        required: false
      })
    };
  }

  getInventoryValuationVariables() {
    return {
      as_of_date: reportVariableService.defineVariable({
        name: 'as_of_date',
        label: 'As of Date',
        type: reportVariableService.variableTypes.DATE,
        defaultValue: '@TODAY',
        required: true
      }),
      valuation_method: reportVariableService.createSelectVariable(
        'valuation_method',
        'Valuation Method',
        [
          { label: 'FIFO', value: 'fifo' },
          { label: 'LIFO', value: 'lifo' },
          { label: 'Average Cost', value: 'average' }
        ],
        { defaultValue: 'average' }
      ),
      product_category: reportVariableService.defineVariable({
        name: 'product_category',
        label: 'Product Category',
        type: reportVariableService.variableTypes.SELECT,
        required: false
      })
    };
  }

  getStockMovementVariables() {
    return {
      ...reportVariableService.createDateRangeVariable('date_range', 'Period'),
      movement_type: reportVariableService.createSelectVariable(
        'movement_type',
        'Movement Type',
        [
          { label: 'All', value: 'all' },
          { label: 'In', value: 'in' },
          { label: 'Out', value: 'out' },
          { label: 'Adjustment', value: 'adjustment' },
          { label: 'Transfer', value: 'transfer' }
        ],
        { defaultValue: 'all' }
      ),
      product_id: reportVariableService.defineVariable({
        name: 'product_id',
        label: 'Product',
        type: reportVariableService.variableTypes.SELECT,
        required: false
      })
    };
  }

  getReorderReportVariables() {
    return {
      show_zero_stock: reportVariableService.defineVariable({
        name: 'show_zero_stock',
        label: 'Include Zero Stock Items',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: true,
        required: false
      }),
      category: reportVariableService.defineVariable({
        name: 'category',
        label: 'Category',
        type: reportVariableService.variableTypes.SELECT,
        required: false
      })
    };
  }

  getSalesSummaryVariables() {
    return {
      ...reportVariableService.createDateRangeVariable('date_range', 'Period'),
      ...reportVariableService.createCommonVariables('erp'),
      group_by: reportVariableService.createSelectVariable(
        'group_by',
        'Group By',
        [
          { label: 'Day', value: 'day' },
          { label: 'Week', value: 'week' },
          { label: 'Month', value: 'month' },
          { label: 'Quarter', value: 'quarter' }
        ],
        { defaultValue: 'month' }
      )
    };
  }

  getSalesByProductVariables() {
    return {
      ...reportVariableService.createDateRangeVariable('date_range', 'Period'),
      top_n: reportVariableService.defineVariable({
        name: 'top_n',
        label: 'Top N Products',
        type: reportVariableService.variableTypes.NUMBER,
        defaultValue: 10,
        min: 5,
        max: 100,
        required: false
      })
    };
  }

  getSalesByCustomerVariables() {
    return {
      ...reportVariableService.createDateRangeVariable('date_range', 'Period'),
      top_n: reportVariableService.defineVariable({
        name: 'top_n',
        label: 'Top N Customers',
        type: reportVariableService.variableTypes.NUMBER,
        defaultValue: 10,
        min: 5,
        max: 100,
        required: false
      }),
      min_order_amount: reportVariableService.defineVariable({
        name: 'min_order_amount',
        label: 'Minimum Order Amount',
        type: reportVariableService.variableTypes.CURRENCY,
        required: false
      })
    };
  }

  getEmployeeRosterVariables() {
    return {
      ...reportVariableService.createCommonVariables('erp'),
      employment_status: reportVariableService.createSelectVariable(
        'employment_status',
        'Employment Status',
        [
          { label: 'All', value: 'all' },
          { label: 'Active', value: 'active' },
          { label: 'Inactive', value: 'inactive' },
          { label: 'On Leave', value: 'on_leave' }
        ],
        { defaultValue: 'active' }
      ),
      include_terminated: reportVariableService.defineVariable({
        name: 'include_terminated',
        label: 'Include Terminated',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: false,
        required: false
      })
    };
  }

  getPayrollSummaryVariables() {
    return {
      ...reportVariableService.createDateRangeVariable('date_range', 'Pay Period'),
      ...reportVariableService.createCommonVariables('erp'),
      show_deductions: reportVariableService.defineVariable({
        name: 'show_deductions',
        label: 'Show Deductions Breakdown',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: true,
        required: false
      })
    };
  }

  getLeaveReportVariables() {
    return {
      ...reportVariableService.createDateRangeVariable('date_range', 'Period'),
      ...reportVariableService.createCommonVariables('erp'),
      leave_type: reportVariableService.createSelectVariable(
        'leave_type',
        'Leave Type',
        [
          { label: 'All', value: 'all' },
          { label: 'Vacation', value: 'vacation' },
          { label: 'Sick', value: 'sick' },
          { label: 'Personal', value: 'personal' },
          { label: 'Unpaid', value: 'unpaid' }
        ],
        { defaultValue: 'all' }
      )
    };
  }

  getHeadcountReportVariables() {
    return {
      as_of_date: reportVariableService.defineVariable({
        name: 'as_of_date',
        label: 'As of Date',
        type: reportVariableService.variableTypes.DATE,
        defaultValue: '@TODAY',
        required: true
      }),
      show_trend: reportVariableService.defineVariable({
        name: 'show_trend',
        label: 'Show Historical Trend',
        type: reportVariableService.variableTypes.BOOLEAN,
        defaultValue: false,
        required: false
      })
    };
  }

  getAssetRegisterVariables() {
    return {
      ...reportVariableService.createCommonVariables('erp'),
      as_of_date: reportVariableService.defineVariable({
        name: 'as_of_date',
        label: 'As of Date',
        type: reportVariableService.variableTypes.DATE,
        defaultValue: '@TODAY',
        required: true
      }),
      asset_type: reportVariableService.createSelectVariable(
        'asset_type',
        'Asset Type',
        [
          { label: 'All', value: 'all' },
          { label: 'Property', value: 'property' },
          { label: 'Equipment', value: 'equipment' },
          { label: 'Vehicles', value: 'vehicles' },
          { label: 'Furniture', value: 'furniture' },
          { label: 'IT Equipment', value: 'it_equipment' }
        ],
        { defaultValue: 'all' }
      )
    };
  }

  getDepreciationScheduleVariables() {
    return {
      ...reportVariableService.createDateRangeVariable('date_range', 'Period'),
      depreciation_method: reportVariableService.createSelectVariable(
        'depreciation_method',
        'Depreciation Method',
        [
          { label: 'All', value: 'all' },
          { label: 'Straight Line', value: 'straight_line' },
          { label: 'Declining Balance', value: 'declining_balance' }
        ],
        { defaultValue: 'all' }
      )
    };
  }

  getAssetAllocationVariables() {
    return {
      ...reportVariableService.createCommonVariables('erp'),
      as_of_date: reportVariableService.defineVariable({
        name: 'as_of_date',
        label: 'As of Date',
        type: reportVariableService.variableTypes.DATE,
        defaultValue: '@TODAY',
        required: true
      }),
      group_by: reportVariableService.createSelectVariable(
        'group_by',
        'Group By',
        [
          { label: 'Department', value: 'department' },
          { label: 'Employee', value: 'employee' },
          { label: 'Asset Type', value: 'asset_type' }
        ],
        { defaultValue: 'department' }
      )
    };
  }

  // ===== Report Generators =====

  async generateBalanceSheet(variables) {
    const result = await financialReportingService.getBalanceSheet(variables.as_of_date);

    return {
      reportType: 'balance_sheet',
      title: `Balance Sheet as of ${variables.as_of_date}`,
      generatedAt: new Date(),
      parameters: variables,
      ...result
    };
  }

  async generateProfitLoss(variables) {
    const result = await financialReportingService.getProfitAndLoss(
      variables.date_range.startDate,
      variables.date_range.endDate
    );

    return {
      reportType: 'profit_loss',
      title: `Profit & Loss Statement - ${variables.date_range.startDate} to ${variables.date_range.endDate}`,
      generatedAt: new Date(),
      parameters: variables,
      ...result
    };
  }

  async generateCashFlow(variables) {
    const result = await financialReportingService.getCashFlowStatement(
      variables.date_range.startDate,
      variables.date_range.endDate
    );

    return {
      reportType: 'cash_flow',
      title: 'Cash Flow Statement',
      generatedAt: new Date(),
      parameters: variables,
      ...result
    };
  }

  async generateGeneralLedger(variables) {
    const result = await financialReportingService.getGeneralLedger(
      variables.account_id,
      variables.date_range.startDate,
      variables.date_range.endDate
    );

    return {
      reportType: 'general_ledger',
      title: 'General Ledger',
      generatedAt: new Date(),
      parameters: variables,
      ...result
    };
  }

  async generateFinancialRatios(variables) {
    const result = await financialReportingService.getFinancialRatios(variables.as_of_date);

    return {
      reportType: 'financial_ratios',
      title: 'Financial Ratios',
      generatedAt: new Date(),
      parameters: variables,
      ...result
    };
  }

  async generateInventoryValuation(variables) {
    const inventory = await Inventory.findAll({
      include: [{ model: Product, as: 'product', required: true }]
    });

    const valuationData = inventory.map(item => ({
      productId: item.productId,
      productName: item.product.name,
      sku: item.product.sku,
      quantity: item.quantity,
      unitCost: item.product.costPrice,
      totalValue: item.quantity * item.product.costPrice
    }));

    const totalValue = valuationData.reduce((sum, item) => sum + item.totalValue, 0);

    return {
      reportType: 'inventory_valuation',
      title: `Inventory Valuation as of ${variables.as_of_date}`,
      generatedAt: new Date(),
      parameters: variables,
      data: valuationData,
      rowCount: valuationData.length,
      summary: {
        totalItems: valuationData.length,
        totalValue,
        valuationMethod: variables.valuation_method
      }
    };
  }

  async generateStockMovement(variables) {
    // Placeholder - would query actual stock movements
    return {
      reportType: 'stock_movement',
      title: 'Stock Movement Report',
      generatedAt: new Date(),
      parameters: variables,
      data: [],
      message: 'Stock movement report - implementation in progress'
    };
  }

  async generateReorderReport(variables) {
    // Placeholder - would query products below reorder point
    return {
      reportType: 'reorder_report',
      title: 'Reorder Report',
      generatedAt: new Date(),
      parameters: variables,
      data: [],
      message: 'Reorder report - implementation in progress'
    };
  }

  async generateSalesSummary(variables) {
    const where = {
      orderDate: {
        [Op.gte]: variables.date_range.startDate,
        [Op.lte]: variables.date_range.endDate
      },
      status: { [Op.in]: ['confirmed', 'completed'] }
    };

    if (variables.department) {
      where.departmentId = variables.department;
    }

    const salesOrders = await SalesOrder.findAll({ where });

    const totalSales = salesOrders.reduce((sum, order) => sum + (order.totalAmount || 0), 0);
    const totalOrders = salesOrders.length;
    const avgOrderValue = totalOrders > 0 ? totalSales / totalOrders : 0;

    return {
      reportType: 'sales_summary',
      title: 'Sales Summary',
      generatedAt: new Date(),
      parameters: variables,
      data: salesOrders.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        orderDate: o.orderDate,
        customerId: o.customerId,
        totalAmount: o.totalAmount,
        status: o.status
      })),
      rowCount: totalOrders,
      summary: {
        totalOrders,
        totalSales,
        avgOrderValue
      }
    };
  }

  async generateSalesByProduct(variables) {
    // Placeholder - would aggregate sales by product
    return {
      reportType: 'sales_by_product',
      title: 'Sales by Product',
      generatedAt: new Date(),
      parameters: variables,
      data: [],
      message: 'Sales by product report - implementation in progress'
    };
  }

  async generateSalesByCustomer(variables) {
    // Placeholder - would aggregate sales by customer
    return {
      reportType: 'sales_by_customer',
      title: 'Sales by Customer',
      generatedAt: new Date(),
      parameters: variables,
      data: [],
      message: 'Sales by customer report - implementation in progress'
    };
  }

  async generateEmployeeRoster(variables) {
    const where = {};

    if (variables.department) {
      where.departmentId = variables.department;
    }

    if (variables.employment_status && variables.employment_status !== 'all') {
      where.status = variables.employment_status;
    }

    if (!variables.include_terminated) {
      where.terminationDate = null;
    }

    const employees = await Employee.findAll({
      where,
      include: [{ model: Department, required: false }],
      order: [['lastName', 'ASC'], ['firstName', 'ASC']]
    });

    return {
      reportType: 'employee_roster',
      title: 'Employee Roster',
      generatedAt: new Date(),
      parameters: variables,
      data: employees.map(e => ({
        id: e.id,
        employeeNumber: e.employeeNumber,
        firstName: e.firstName,
        lastName: e.lastName,
        email: e.email,
        department: e.Department?.name || null,
        jobTitle: e.jobTitle,
        hireDate: e.hireDate,
        status: e.status
      })),
      rowCount: employees.length,
      summary: {
        totalEmployees: employees.length,
        byDepartment: this.groupBy(employees, 'departmentId'),
        byStatus: this.groupBy(employees, 'status')
      }
    };
  }

  async generatePayrollSummary(variables) {
    // Placeholder - would query payroll data
    return {
      reportType: 'payroll_summary',
      title: 'Payroll Summary',
      generatedAt: new Date(),
      parameters: variables,
      data: [],
      message: 'Payroll summary report - implementation in progress'
    };
  }

  async generateLeaveReport(variables) {
    // Placeholder - would query leave requests
    return {
      reportType: 'leave_report',
      title: 'Leave Report',
      generatedAt: new Date(),
      parameters: variables,
      data: [],
      message: 'Leave report - implementation in progress'
    };
  }

  async generateHeadcountReport(variables) {
    const employees = await Employee.findAll({
      where: { terminationDate: null },
      include: [{ model: Department, required: false }]
    });

    const byDepartment = this.groupBy(employees, 'departmentId');

    return {
      reportType: 'headcount_report',
      title: `Headcount Report as of ${variables.as_of_date}`,
      generatedAt: new Date(),
      parameters: variables,
      summary: {
        totalEmployees: employees.length,
        byDepartment
      },
      data: Object.entries(byDepartment).map(([deptId, count]) => ({
        department: employees.find(e => e.departmentId === deptId)?.Department?.name || 'Unknown',
        count
      }))
    };
  }

  async generateAssetRegister(variables) {
    const where = {};

    if (variables.asset_type && variables.asset_type !== 'all') {
      where.assetType = variables.asset_type;
    }

    if (variables.department) {
      where.departmentId = variables.department;
    }

    const assets = await Asset.findAll({
      where,
      include: [
        { model: Department, as: 'department', required: false },
        { model: Employee, as: 'assignedEmployee', required: false }
      ],
      order: [['purchaseDate', 'DESC']]
    });

    const totalValue = assets.reduce((sum, asset) => sum + (asset.purchasePrice || 0), 0);
    const totalDepreciation = assets.reduce(
      (sum, asset) => sum + (asset.accumulatedDepreciation || 0),
      0
    );
    const netBookValue = totalValue - totalDepreciation;

    return {
      reportType: 'asset_register',
      title: `Asset Register as of ${variables.as_of_date}`,
      generatedAt: new Date(),
      parameters: variables,
      data: assets.map(a => ({
        id: a.id,
        assetNumber: a.assetNumber,
        name: a.name,
        assetType: a.assetType,
        purchaseDate: a.purchaseDate,
        purchasePrice: a.purchasePrice,
        accumulatedDepreciation: a.accumulatedDepreciation,
        netBookValue: (a.purchasePrice || 0) - (a.accumulatedDepreciation || 0),
        department: a.department?.name || null,
        assignedTo: a.assignedEmployee
          ? `${a.assignedEmployee.firstName} ${a.assignedEmployee.lastName}`
          : null
      })),
      rowCount: assets.length,
      summary: {
        totalAssets: assets.length,
        totalValue,
        totalDepreciation,
        netBookValue,
        byType: this.groupBy(assets, 'assetType')
      }
    };
  }

  async generateDepreciationSchedule(variables) {
    // Placeholder - would calculate depreciation schedule
    return {
      reportType: 'depreciation_schedule',
      title: 'Depreciation Schedule',
      generatedAt: new Date(),
      parameters: variables,
      data: [],
      message: 'Depreciation schedule report - implementation in progress'
    };
  }

  async generateAssetAllocation(variables) {
    // Placeholder - would show asset allocation
    return {
      reportType: 'asset_allocation',
      title: 'Asset Allocation Report',
      generatedAt: new Date(),
      parameters: variables,
      data: [],
      message: 'Asset allocation report - implementation in progress'
    };
  }

  // ===== Helper Methods =====

  groupBy(items, field) {
    const groups = {};
    items.forEach(item => {
      const key = item[field] || 'Unknown';
      groups[key] = (groups[key] || 0) + 1;
    });
    return groups;
  }
}

module.exports = new ERPReportBuilderService();
