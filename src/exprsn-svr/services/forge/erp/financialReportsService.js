const { Op } = require('sequelize');
const { Account, JournalEntry, Invoice, Payment } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const { sequelize } = require('../../../config/database');

/**
 * Financial Reports Service
 *
 * Generates advanced financial reports including Balance Sheet,
 * Profit & Loss Statement, and Cash Flow Statement.
 */

/**
 * Generate Balance Sheet
 * Assets = Liabilities + Equity
 */
async function generateBalanceSheet({
  asOfDate = new Date(),
  compareToDate = null,
  includeSubAccounts = true
}) {
  try {
    const accounts = await Account.findAll({
      where: {
        isActive: true
      },
      order: [['code', 'ASC']]
    });

    // Calculate balances for each account
    const accountBalances = await Promise.all(
      accounts.map(async (account) => {
        const balance = await calculateAccountBalance(account.id, asOfDate);
        let comparativeBalance = null;

        if (compareToDate) {
          comparativeBalance = await calculateAccountBalance(account.id, compareToDate);
        }

        return {
          accountId: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          category: account.category,
          balance,
          comparativeBalance,
          change: comparativeBalance ? balance - comparativeBalance : null
        };
      })
    );

    // Group accounts by type
    const assets = accountBalances.filter(a =>
      ['bank', 'cash', 'accounts_receivable', 'inventory', 'fixed_asset', 'other_asset'].includes(a.type)
    );

    const liabilities = accountBalances.filter(a =>
      ['accounts_payable', 'credit_card', 'other_liability', 'long_term_liability'].includes(a.type)
    );

    const equity = accountBalances.filter(a =>
      ['equity', 'retained_earnings'].includes(a.type)
    );

    // Calculate totals
    const totalAssets = assets.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    const totalLiabilities = liabilities.reduce((sum, a) => sum + parseFloat(a.balance), 0);
    const totalEquity = equity.reduce((sum, a) => sum + parseFloat(a.balance), 0);

    // Group by category
    const assetsByCategory = groupByCategory(assets);
    const liabilitiesByCategory = groupByCategory(liabilities);
    const equityByCategory = groupByCategory(equity);

    const balanceSheet = {
      reportName: 'Balance Sheet',
      asOfDate,
      compareToDate,
      assets: {
        categories: assetsByCategory,
        total: parseFloat(totalAssets.toFixed(2))
      },
      liabilities: {
        categories: liabilitiesByCategory,
        total: parseFloat(totalLiabilities.toFixed(2))
      },
      equity: {
        categories: equityByCategory,
        total: parseFloat(totalEquity.toFixed(2))
      },
      totalLiabilitiesAndEquity: parseFloat((totalLiabilities + totalEquity).toFixed(2)),
      balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01
    };

    logger.info('Balance sheet generated', {
      asOfDate,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: balanceSheet.balanced
    });

    return balanceSheet;
  } catch (error) {
    logger.error('Failed to generate balance sheet', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Generate Profit & Loss Statement (Income Statement)
 */
async function generateProfitAndLoss({
  startDate,
  endDate,
  compareStartDate = null,
  compareEndDate = null
}) {
  try {
    const accounts = await Account.findAll({
      where: {
        isActive: true,
        type: ['income', 'expense', 'cost_of_goods_sold', 'other_income', 'other_expense']
      },
      order: [['code', 'ASC']]
    });

    // Calculate activity for each account
    const accountActivity = await Promise.all(
      accounts.map(async (account) => {
        const activity = await calculateAccountActivity(account.id, startDate, endDate);
        let comparativeActivity = null;

        if (compareStartDate && compareEndDate) {
          comparativeActivity = await calculateAccountActivity(
            account.id,
            compareStartDate,
            compareEndDate
          );
        }

        return {
          accountId: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          category: account.category,
          amount: activity,
          comparativeAmount: comparativeActivity,
          change: comparativeActivity ? activity - comparativeActivity : null,
          changePercent: comparativeActivity && comparativeActivity !== 0
            ? ((activity - comparativeActivity) / Math.abs(comparativeActivity) * 100).toFixed(2)
            : null
        };
      })
    );

    // Group accounts by type
    const income = accountActivity.filter(a => a.type === 'income');
    const costOfGoodsSold = accountActivity.filter(a => a.type === 'cost_of_goods_sold');
    const expenses = accountActivity.filter(a =>
      ['expense', 'other_expense'].includes(a.type)
    );
    const otherIncome = accountActivity.filter(a => a.type === 'other_income');

    // Calculate totals (income is credit, so negative values are revenue)
    const totalIncome = Math.abs(income.reduce((sum, a) => sum + parseFloat(a.amount), 0));
    const totalCOGS = Math.abs(costOfGoodsSold.reduce((sum, a) => sum + parseFloat(a.amount), 0));
    const totalExpenses = Math.abs(expenses.reduce((sum, a) => sum + parseFloat(a.amount), 0));
    const totalOtherIncome = Math.abs(otherIncome.reduce((sum, a) => sum + parseFloat(a.amount), 0));

    const grossProfit = totalIncome - totalCOGS;
    const operatingIncome = grossProfit - totalExpenses;
    const netIncome = operatingIncome + totalOtherIncome;

    const profitAndLoss = {
      reportName: 'Profit & Loss Statement',
      period: {
        startDate,
        endDate
      },
      comparePeriod: compareStartDate ? {
        startDate: compareStartDate,
        endDate: compareEndDate
      } : null,
      income: {
        categories: groupByCategory(income),
        total: parseFloat(totalIncome.toFixed(2))
      },
      costOfGoodsSold: {
        categories: groupByCategory(costOfGoodsSold),
        total: parseFloat(totalCOGS.toFixed(2))
      },
      grossProfit: parseFloat(grossProfit.toFixed(2)),
      grossProfitMargin: totalIncome > 0
        ? parseFloat((grossProfit / totalIncome * 100).toFixed(2))
        : 0,
      operatingExpenses: {
        categories: groupByCategory(expenses),
        total: parseFloat(totalExpenses.toFixed(2))
      },
      operatingIncome: parseFloat(operatingIncome.toFixed(2)),
      operatingMargin: totalIncome > 0
        ? parseFloat((operatingIncome / totalIncome * 100).toFixed(2))
        : 0,
      otherIncome: {
        categories: groupByCategory(otherIncome),
        total: parseFloat(totalOtherIncome.toFixed(2))
      },
      netIncome: parseFloat(netIncome.toFixed(2)),
      netProfitMargin: totalIncome > 0
        ? parseFloat((netIncome / totalIncome * 100).toFixed(2))
        : 0
    };

    logger.info('Profit & Loss statement generated', {
      startDate,
      endDate,
      totalIncome,
      netIncome,
      netProfitMargin: profitAndLoss.netProfitMargin
    });

    return profitAndLoss;
  } catch (error) {
    logger.error('Failed to generate P&L statement', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Generate Cash Flow Statement
 */
async function generateCashFlowStatement({
  startDate,
  endDate
}) {
  try {
    // Get all cash and bank accounts
    const cashAccounts = await Account.findAll({
      where: {
        type: ['bank', 'cash'],
        isActive: true
      }
    });

    // Calculate opening and closing balances
    const openingDate = new Date(startDate);
    openingDate.setDate(openingDate.getDate() - 1);

    let openingBalance = 0;
    let closingBalance = 0;

    for (const account of cashAccounts) {
      openingBalance += await calculateAccountBalance(account.id, openingDate);
      closingBalance += await calculateAccountBalance(account.id, endDate);
    }

    // Get all journal entries in the period
    const journalEntries = await JournalEntry.findAll({
      where: {
        entryDate: {
          [Op.between]: [startDate, endDate]
        },
        status: 'posted'
      },
      order: [['entryDate', 'ASC']]
    });

    // Categorize cash flows
    const operatingActivities = [];
    const investingActivities = [];
    const financingActivities = [];

    for (const entry of journalEntries) {
      // Classify based on accounts involved
      const lineItems = entry.lineItems || [];

      for (const lineItem of lineItems) {
        const account = await Account.findByPk(lineItem.accountId);
        if (!account) continue;

        const isCashAccount = ['bank', 'cash'].includes(account.type);
        if (!isCashAccount) continue;

        const amount = parseFloat(lineItem.debit || 0) - parseFloat(lineItem.credit || 0);

        // Categorize activity
        if (isOperatingActivity(entry, account)) {
          operatingActivities.push({
            date: entry.entryDate,
            description: entry.description,
            amount,
            entryNumber: entry.entryNumber
          });
        } else if (isInvestingActivity(entry, account)) {
          investingActivities.push({
            date: entry.entryDate,
            description: entry.description,
            amount,
            entryNumber: entry.entryNumber
          });
        } else if (isFinancingActivity(entry, account)) {
          financingActivities.push({
            date: entry.entryDate,
            description: entry.description,
            amount,
            entryNumber: entry.entryNumber
          });
        }
      }
    }

    const operatingCashFlow = operatingActivities.reduce((sum, a) => sum + a.amount, 0);
    const investingCashFlow = investingActivities.reduce((sum, a) => sum + a.amount, 0);
    const financingCashFlow = financingActivities.reduce((sum, a) => sum + a.amount, 0);
    const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

    const cashFlowStatement = {
      reportName: 'Cash Flow Statement',
      period: {
        startDate,
        endDate
      },
      openingCashBalance: parseFloat(openingBalance.toFixed(2)),
      operatingActivities: {
        activities: operatingActivities,
        total: parseFloat(operatingCashFlow.toFixed(2))
      },
      investingActivities: {
        activities: investingActivities,
        total: parseFloat(investingCashFlow.toFixed(2))
      },
      financingActivities: {
        activities: financingActivities,
        total: parseFloat(financingCashFlow.toFixed(2))
      },
      netCashFlow: parseFloat(netCashFlow.toFixed(2)),
      closingCashBalance: parseFloat(closingBalance.toFixed(2)),
      reconciled: Math.abs((openingBalance + netCashFlow) - closingBalance) < 0.01
    };

    logger.info('Cash flow statement generated', {
      startDate,
      endDate,
      netCashFlow,
      closingBalance
    });

    return cashFlowStatement;
  } catch (error) {
    logger.error('Failed to generate cash flow statement', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Generate financial ratios and metrics
 */
async function generateFinancialMetrics({
  startDate,
  endDate
}) {
  try {
    // Generate required reports
    const balanceSheet = await generateBalanceSheet({ asOfDate: endDate });
    const profitAndLoss = await generateProfitAndLoss({ startDate, endDate });

    const totalAssets = balanceSheet.assets.total;
    const totalLiabilities = balanceSheet.liabilities.total;
    const totalEquity = balanceSheet.equity.total;
    const netIncome = profitAndLoss.netIncome;
    const totalRevenue = profitAndLoss.income.total;

    // Calculate ratios
    const metrics = {
      reportName: 'Financial Metrics & Ratios',
      period: { startDate, endDate },

      // Profitability Ratios
      profitability: {
        grossProfitMargin: profitAndLoss.grossProfitMargin,
        operatingMargin: profitAndLoss.operatingMargin,
        netProfitMargin: profitAndLoss.netProfitMargin,
        returnOnAssets: totalAssets > 0
          ? parseFloat((netIncome / totalAssets * 100).toFixed(2))
          : 0,
        returnOnEquity: totalEquity > 0
          ? parseFloat((netIncome / totalEquity * 100).toFixed(2))
          : 0
      },

      // Liquidity Ratios
      liquidity: {
        currentRatio: 0, // Would need current assets/liabilities breakdown
        quickRatio: 0,   // Would need detailed asset breakdown
        cashRatio: 0     // Would need cash and marketable securities
      },

      // Leverage Ratios
      leverage: {
        debtToAssets: totalAssets > 0
          ? parseFloat((totalLiabilities / totalAssets * 100).toFixed(2))
          : 0,
        debtToEquity: totalEquity > 0
          ? parseFloat((totalLiabilities / totalEquity * 100).toFixed(2))
          : 0,
        equityRatio: totalAssets > 0
          ? parseFloat((totalEquity / totalAssets * 100).toFixed(2))
          : 0
      },

      // Efficiency Ratios (simplified without detailed AR/Inventory data)
      efficiency: {
        assetTurnover: totalAssets > 0
          ? parseFloat((totalRevenue / totalAssets).toFixed(2))
          : 0
      }
    };

    logger.info('Financial metrics generated', {
      startDate,
      endDate,
      netProfitMargin: metrics.profitability.netProfitMargin,
      debtToEquity: metrics.leverage.debtToEquity
    });

    return metrics;
  } catch (error) {
    logger.error('Failed to generate financial metrics', {
      error: error.message
    });
    throw error;
  }
}

// ===== Helper Functions =====

/**
 * Calculate account balance as of a specific date
 */
async function calculateAccountBalance(accountId, asOfDate) {
  try {
    const result = await sequelize.query(`
      SELECT
        COALESCE(SUM(CAST(debit AS DECIMAL)), 0) - COALESCE(SUM(CAST(credit AS DECIMAL)), 0) as balance
      FROM journal_entries je,
      jsonb_to_recordset(je.line_items) as items(
        "accountId" text,
        debit text,
        credit text
      )
      WHERE items."accountId" = :accountId
        AND je.entry_date <= :asOfDate
        AND je.status = 'posted'
    `, {
      replacements: { accountId, asOfDate },
      type: sequelize.QueryTypes.SELECT
    });

    return parseFloat(result[0]?.balance || 0);
  } catch (error) {
    logger.error('Failed to calculate account balance', {
      accountId,
      asOfDate,
      error: error.message
    });
    return 0;
  }
}

/**
 * Calculate account activity for a period
 */
async function calculateAccountActivity(accountId, startDate, endDate) {
  try {
    const result = await sequelize.query(`
      SELECT
        COALESCE(SUM(CAST(debit AS DECIMAL)), 0) - COALESCE(SUM(CAST(credit AS DECIMAL)), 0) as activity
      FROM journal_entries je,
      jsonb_to_recordset(je.line_items) as items(
        "accountId" text,
        debit text,
        credit text
      )
      WHERE items."accountId" = :accountId
        AND je.entry_date >= :startDate
        AND je.entry_date <= :endDate
        AND je.status = 'posted'
    `, {
      replacements: { accountId, startDate, endDate },
      type: sequelize.QueryTypes.SELECT
    });

    return parseFloat(result[0]?.activity || 0);
  } catch (error) {
    logger.error('Failed to calculate account activity', {
      accountId,
      startDate,
      endDate,
      error: error.message
    });
    return 0;
  }
}

/**
 * Group accounts by category
 */
function groupByCategory(accounts) {
  const grouped = {};

  accounts.forEach(account => {
    const category = account.category || 'Uncategorized';
    if (!grouped[category]) {
      grouped[category] = {
        accounts: [],
        total: 0
      };
    }

    grouped[category].accounts.push(account);
    grouped[category].total += parseFloat(account.balance || account.amount || 0);
  });

  // Round totals
  Object.keys(grouped).forEach(category => {
    grouped[category].total = parseFloat(grouped[category].total.toFixed(2));
  });

  return grouped;
}

/**
 * Determine if journal entry is an operating activity
 */
function isOperatingActivity(journalEntry, account) {
  // Operating activities: customer receipts, supplier payments, payroll, etc.
  const operatingTypes = ['expense', 'income', 'accounts_receivable', 'accounts_payable'];
  return operatingTypes.includes(account.type);
}

/**
 * Determine if journal entry is an investing activity
 */
function isInvestingActivity(journalEntry, account) {
  // Investing activities: purchase/sale of fixed assets, investments
  const investingTypes = ['fixed_asset', 'other_asset'];
  return investingTypes.includes(account.type);
}

/**
 * Determine if journal entry is a financing activity
 */
function isFinancingActivity(journalEntry, account) {
  // Financing activities: loans, equity, dividends
  const financingTypes = ['long_term_liability', 'equity'];
  return financingTypes.includes(account.type);
}

module.exports = {
  generateBalanceSheet,
  generateProfitAndLoss,
  generateCashFlowStatement,
  generateFinancialMetrics
};
