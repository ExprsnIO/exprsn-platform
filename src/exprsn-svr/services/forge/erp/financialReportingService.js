const { Account, JournalEntry, Invoice, Payment, Customer, Supplier } = require('../../../models/forge');
const { Op } = require('sequelize');
const { sequelize } = require('../../../config/database');
const logger = require('../../../utils/logger');
const accountingService = require('./accountingService');

/**
 * Financial Reporting Service
 * Generates standard financial reports
 */

/**
 * Generate Balance Sheet
 * Assets = Liabilities + Equity
 */
async function generateBalanceSheet(asOfDate = new Date()) {
  try {
    const accounts = await Account.findAll({
      where: {
        accountType: {
          [Op.in]: ['asset', 'liability', 'equity', 'accounts_receivable',
                    'accounts_payable', 'cash', 'bank', 'fixed_asset',
                    'other_current_asset', 'other_asset', 'credit_card',
                    'long_term_liability', 'other_current_liability']
        },
        isActive: true
      },
      order: [['accountNumber', 'ASC']]
    });

    const balanceSheet = {
      asOfDate,
      assets: {
        currentAssets: [],
        fixedAssets: [],
        otherAssets: [],
        total: 0
      },
      liabilities: {
        currentLiabilities: [],
        longTermLiabilities: [],
        total: 0
      },
      equity: {
        items: [],
        total: 0
      },
      totalAssets: 0,
      totalLiabilitiesAndEquity: 0
    };

    // Get balances for all accounts
    for (const account of accounts) {
      const balanceInfo = await accountingService.getAccountBalance(account.id, asOfDate);

      const accountData = {
        accountId: account.id,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        balance: balanceInfo.balance
      };

      // Categorize accounts
      if (account.accountType === 'asset' || account.accountType === 'cash' ||
          account.accountType === 'bank' || account.accountType === 'accounts_receivable' ||
          account.accountType === 'other_current_asset') {
        balanceSheet.assets.currentAssets.push(accountData);
        balanceSheet.assets.total += balanceInfo.balance;
      } else if (account.accountType === 'fixed_asset') {
        balanceSheet.assets.fixedAssets.push(accountData);
        balanceSheet.assets.total += balanceInfo.balance;
      } else if (account.accountType === 'other_asset') {
        balanceSheet.assets.otherAssets.push(accountData);
        balanceSheet.assets.total += balanceInfo.balance;
      } else if (account.accountType === 'liability' || account.accountType === 'accounts_payable' ||
                 account.accountType === 'credit_card' || account.accountType === 'other_current_liability') {
        balanceSheet.liabilities.currentLiabilities.push(accountData);
        balanceSheet.liabilities.total += balanceInfo.balance;
      } else if (account.accountType === 'long_term_liability') {
        balanceSheet.liabilities.longTermLiabilities.push(accountData);
        balanceSheet.liabilities.total += balanceInfo.balance;
      } else if (account.accountType === 'equity') {
        balanceSheet.equity.items.push(accountData);
        balanceSheet.equity.total += balanceInfo.balance;
      }
    }

    balanceSheet.totalAssets = balanceSheet.assets.total;
    balanceSheet.totalLiabilitiesAndEquity = balanceSheet.liabilities.total + balanceSheet.equity.total;

    // Add retained earnings (net income) to equity
    const profitLoss = await generateProfitAndLoss(
      new Date(asOfDate.getFullYear(), 0, 1),
      asOfDate
    );

    balanceSheet.equity.items.push({
      accountNumber: 'RETAINED',
      accountName: 'Retained Earnings (Net Income)',
      balance: profitLoss.netIncome
    });
    balanceSheet.equity.total += profitLoss.netIncome;
    balanceSheet.totalLiabilitiesAndEquity += profitLoss.netIncome;

    logger.info('Balance sheet generated', { asOfDate });

    return balanceSheet;
  } catch (error) {
    logger.error('Failed to generate balance sheet', { error: error.message });
    throw error;
  }
}

/**
 * Generate Profit and Loss Statement (Income Statement)
 * Revenue - Expenses = Net Income
 */
async function generateProfitAndLoss(startDate, endDate) {
  try {
    const accounts = await Account.findAll({
      where: {
        accountType: {
          [Op.in]: ['revenue', 'expense', 'cost_of_goods_sold']
        },
        isActive: true
      },
      order: [['accountNumber', 'ASC']]
    });

    const profitLoss = {
      startDate,
      endDate,
      revenue: {
        items: [],
        total: 0
      },
      costOfGoodsSold: {
        items: [],
        total: 0
      },
      grossProfit: 0,
      operatingExpenses: {
        items: [],
        total: 0
      },
      operatingIncome: 0,
      otherIncome: 0,
      otherExpenses: 0,
      netIncome: 0
    };

    // Calculate balances for the period
    for (const account of accounts) {
      const result = await sequelize.query(`
        SELECT
          SUM(CASE WHEN line_item->>'accountId' = :accountId THEN (line_item->>'debit')::numeric ELSE 0 END) as total_debit,
          SUM(CASE WHEN line_item->>'accountId' = :accountId THEN (line_item->>'credit')::numeric ELSE 0 END) as total_credit
        FROM journal_entries,
        jsonb_array_elements(line_items) as line_item
        WHERE is_posted = true
        AND entry_date BETWEEN :startDate AND :endDate
      `, {
        replacements: { accountId: account.id, startDate, endDate },
        type: sequelize.QueryTypes.SELECT
      });

      const totalDebit = parseFloat(result[0]?.total_debit || 0);
      const totalCredit = parseFloat(result[0]?.total_credit || 0);

      // Calculate net amount for the period
      const netAmount = account.normalBalance === 'debit'
        ? totalDebit - totalCredit
        : totalCredit - totalDebit;

      if (netAmount === 0) continue;

      const accountData = {
        accountId: account.id,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        amount: netAmount
      };

      if (account.accountType === 'revenue') {
        profitLoss.revenue.items.push(accountData);
        profitLoss.revenue.total += netAmount;
      } else if (account.accountType === 'cost_of_goods_sold') {
        profitLoss.costOfGoodsSold.items.push(accountData);
        profitLoss.costOfGoodsSold.total += netAmount;
      } else if (account.accountType === 'expense') {
        profitLoss.operatingExpenses.items.push(accountData);
        profitLoss.operatingExpenses.total += netAmount;
      }
    }

    profitLoss.grossProfit = profitLoss.revenue.total - profitLoss.costOfGoodsSold.total;
    profitLoss.operatingIncome = profitLoss.grossProfit - profitLoss.operatingExpenses.total;
    profitLoss.netIncome = profitLoss.operatingIncome + profitLoss.otherIncome - profitLoss.otherExpenses;

    logger.info('Profit and loss statement generated', { startDate, endDate });

    return profitLoss;
  } catch (error) {
    logger.error('Failed to generate profit and loss', { error: error.message });
    throw error;
  }
}

/**
 * Generate Cash Flow Statement
 */
async function generateCashFlowStatement(startDate, endDate) {
  try {
    const cashFlowStatement = {
      startDate,
      endDate,
      operatingActivities: {
        items: [],
        total: 0
      },
      investingActivities: {
        items: [],
        total: 0
      },
      financingActivities: {
        items: [],
        total: 0
      },
      netCashFlow: 0,
      beginningCash: 0,
      endingCash: 0
    };

    // Get cash accounts
    const cashAccounts = await Account.findAll({
      where: {
        accountType: { [Op.in]: ['cash', 'bank'] },
        isActive: true
      }
    });

    // Calculate beginning cash
    const beginningDate = new Date(startDate);
    beginningDate.setDate(beginningDate.getDate() - 1);

    for (const cashAccount of cashAccounts) {
      const beginningBalance = await accountingService.getAccountBalance(
        cashAccount.id,
        beginningDate
      );
      cashFlowStatement.beginningCash += beginningBalance.balance;

      const endingBalance = await accountingService.getAccountBalance(
        cashAccount.id,
        endDate
      );
      cashFlowStatement.endingCash += endingBalance.balance;
    }

    cashFlowStatement.netCashFlow = cashFlowStatement.endingCash - cashFlowStatement.beginningCash;

    // Note: Full cash flow statement would require analyzing all transactions
    // and categorizing them into operating, investing, and financing activities.
    // This is a simplified version showing the net change.

    logger.info('Cash flow statement generated', { startDate, endDate });

    return cashFlowStatement;
  } catch (error) {
    logger.error('Failed to generate cash flow statement', { error: error.message });
    throw error;
  }
}

/**
 * Generate Trial Balance
 */
async function generateTrialBalance(asOfDate = new Date()) {
  try {
    const accounts = await Account.findAll({
      where: { isActive: true },
      order: [['accountNumber', 'ASC']]
    });

    const trialBalance = {
      asOfDate,
      accounts: [],
      totalDebits: 0,
      totalCredits: 0,
      isBalanced: false
    };

    for (const account of accounts) {
      const balanceInfo = await accountingService.getAccountBalance(account.id, asOfDate);

      if (balanceInfo.totalDebit === 0 && balanceInfo.totalCredit === 0) {
        continue; // Skip accounts with no activity
      }

      trialBalance.accounts.push({
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        accountType: account.accountType,
        debit: balanceInfo.totalDebit,
        credit: balanceInfo.totalCredit
      });

      trialBalance.totalDebits += balanceInfo.totalDebit;
      trialBalance.totalCredits += balanceInfo.totalCredit;
    }

    trialBalance.isBalanced = Math.abs(trialBalance.totalDebits - trialBalance.totalCredits) < 0.01;

    logger.info('Trial balance generated', {
      asOfDate,
      totalDebits: trialBalance.totalDebits,
      totalCredits: trialBalance.totalCredits,
      isBalanced: trialBalance.isBalanced
    });

    return trialBalance;
  } catch (error) {
    logger.error('Failed to generate trial balance', { error: error.message });
    throw error;
  }
}

/**
 * Generate General Ledger for specific account
 */
async function generateGeneralLedger(accountId, startDate, endDate) {
  try {
    const account = await Account.findByPk(accountId);

    if (!account) {
      throw new Error('Account not found');
    }

    // Get all journal entries affecting this account
    const entries = await JournalEntry.findAll({
      where: {
        isPosted: true,
        entryDate: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['entryDate', 'ASC'], ['createdAt', 'ASC']]
    });

    const transactions = [];
    let runningBalance = 0;

    // Get beginning balance
    const beginningDate = new Date(startDate);
    beginningDate.setDate(beginningDate.getDate() - 1);
    const beginningBalanceInfo = await accountingService.getAccountBalance(accountId, beginningDate);
    runningBalance = beginningBalanceInfo.balance;

    for (const entry of entries) {
      // Find line items for this account
      const lineItems = entry.lineItems.filter(item => item.accountId === accountId);

      for (const lineItem of lineItems) {
        const debit = parseFloat(lineItem.debit || 0);
        const credit = parseFloat(lineItem.credit || 0);

        // Update running balance
        if (account.normalBalance === 'debit') {
          runningBalance += debit - credit;
        } else {
          runningBalance += credit - debit;
        }

        transactions.push({
          date: entry.entryDate,
          entryNumber: entry.entryNumber,
          description: lineItem.description || entry.description,
          reference: entry.reference,
          debit,
          credit,
          balance: runningBalance
        });
      }
    }

    const generalLedger = {
      account: {
        accountId: account.id,
        accountNumber: account.accountNumber,
        accountName: account.accountName,
        accountType: account.accountType
      },
      startDate,
      endDate,
      beginningBalance: beginningBalanceInfo.balance,
      transactions,
      endingBalance: runningBalance
    };

    logger.info('General ledger generated', {
      accountId,
      accountNumber: account.accountNumber,
      startDate,
      endDate
    });

    return generalLedger;
  } catch (error) {
    logger.error('Failed to generate general ledger', { error: error.message, accountId });
    throw error;
  }
}

/**
 * Generate Accounts Receivable Aging Report
 */
async function generateAccountsReceivableAging() {
  try {
    const invoices = await Invoice.findAll({
      where: {
        status: { [Op.in]: ['sent', 'partial', 'overdue'] },
        balanceDue: { [Op.gt]: 0 }
      },
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'customerName', 'email']
        }
      ],
      order: [['dueDate', 'ASC']]
    });

    const today = new Date();
    const agingReport = {
      asOfDate: today,
      customers: {},
      summary: {
        current: 0,
        days1_30: 0,
        days31_60: 0,
        days61_90: 0,
        over90: 0,
        total: 0
      }
    };

    for (const invoice of invoices) {
      const daysPastDue = Math.floor((today - invoice.dueDate) / (1000 * 60 * 60 * 24));
      const customerId = invoice.customerId;

      if (!agingReport.customers[customerId]) {
        agingReport.customers[customerId] = {
          customerId,
          customerName: invoice.customer.customerName,
          current: 0,
          days1_30: 0,
          days31_60: 0,
          days61_90: 0,
          over90: 0,
          total: 0,
          invoices: []
        };
      }

      const invoiceData = {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        balanceDue: invoice.balanceDue,
        daysPastDue
      };

      agingReport.customers[customerId].invoices.push(invoiceData);
      agingReport.customers[customerId].total += invoice.balanceDue;
      agingReport.summary.total += invoice.balanceDue;

      // Categorize by age
      if (daysPastDue <= 0) {
        agingReport.customers[customerId].current += invoice.balanceDue;
        agingReport.summary.current += invoice.balanceDue;
      } else if (daysPastDue <= 30) {
        agingReport.customers[customerId].days1_30 += invoice.balanceDue;
        agingReport.summary.days1_30 += invoice.balanceDue;
      } else if (daysPastDue <= 60) {
        agingReport.customers[customerId].days31_60 += invoice.balanceDue;
        agingReport.summary.days31_60 += invoice.balanceDue;
      } else if (daysPastDue <= 90) {
        agingReport.customers[customerId].days61_90 += invoice.balanceDue;
        agingReport.summary.days61_90 += invoice.balanceDue;
      } else {
        agingReport.customers[customerId].over90 += invoice.balanceDue;
        agingReport.summary.over90 += invoice.balanceDue;
      }
    }

    // Convert customers object to array
    agingReport.customers = Object.values(agingReport.customers);

    logger.info('AR aging report generated', {
      totalOutstanding: agingReport.summary.total
    });

    return agingReport;
  } catch (error) {
    logger.error('Failed to generate AR aging report', { error: error.message });
    throw error;
  }
}

/**
 * Generate Accounts Payable Aging Report
 */
async function generateAccountsPayableAging() {
  try {
    // Note: This would require PurchaseOrder or Bill models
    // Stub implementation for now
    const agingReport = {
      asOfDate: new Date(),
      vendors: [],
      summary: {
        current: 0,
        days1_30: 0,
        days31_60: 0,
        days61_90: 0,
        over90: 0,
        total: 0
      }
    };

    logger.info('AP aging report generated');

    return agingReport;
  } catch (error) {
    logger.error('Failed to generate AP aging report', { error: error.message });
    throw error;
  }
}

/**
 * Calculate Financial Ratios
 */
async function calculateFinancialRatios(asOfDate = new Date()) {
  try {
    const balanceSheet = await generateBalanceSheet(asOfDate);

    const yearStart = new Date(asOfDate.getFullYear(), 0, 1);
    const profitLoss = await generateProfitAndLoss(yearStart, asOfDate);

    const ratios = {
      asOfDate,
      liquidityRatios: {},
      profitabilityRatios: {},
      efficiencyRatios: {}
    };

    // Current Ratio = Current Assets / Current Liabilities
    const currentAssets = balanceSheet.assets.currentAssets.reduce((sum, a) => sum + a.balance, 0);
    const currentLiabilities = balanceSheet.liabilities.currentLiabilities.reduce((sum, l) => sum + l.balance, 0);
    ratios.liquidityRatios.currentRatio = currentLiabilities > 0
      ? (currentAssets / currentLiabilities).toFixed(2)
      : 'N/A';

    // Gross Profit Margin = (Gross Profit / Revenue) * 100
    ratios.profitabilityRatios.grossProfitMargin = profitLoss.revenue.total > 0
      ? ((profitLoss.grossProfit / profitLoss.revenue.total) * 100).toFixed(2) + '%'
      : 'N/A';

    // Net Profit Margin = (Net Income / Revenue) * 100
    ratios.profitabilityRatios.netProfitMargin = profitLoss.revenue.total > 0
      ? ((profitLoss.netIncome / profitLoss.revenue.total) * 100).toFixed(2) + '%'
      : 'N/A';

    // Return on Assets = (Net Income / Total Assets) * 100
    ratios.profitabilityRatios.returnOnAssets = balanceSheet.totalAssets > 0
      ? ((profitLoss.netIncome / balanceSheet.totalAssets) * 100).toFixed(2) + '%'
      : 'N/A';

    // Debt to Equity Ratio = Total Liabilities / Total Equity
    ratios.liquidityRatios.debtToEquityRatio = balanceSheet.equity.total > 0
      ? (balanceSheet.liabilities.total / balanceSheet.equity.total).toFixed(2)
      : 'N/A';

    logger.info('Financial ratios calculated', { asOfDate });

    return ratios;
  } catch (error) {
    logger.error('Failed to calculate financial ratios', { error: error.message });
    throw error;
  }
}

module.exports = {
  generateBalanceSheet,
  generateProfitAndLoss,
  generateCashFlowStatement,
  generateTrialBalance,
  generateGeneralLedger,
  generateAccountsReceivableAging,
  generateAccountsPayableAging,
  calculateFinancialRatios
};
