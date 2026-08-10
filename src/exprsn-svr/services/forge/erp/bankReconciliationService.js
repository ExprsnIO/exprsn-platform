const { Op } = require('sequelize');
const { Payment, Account, JournalEntry } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const { sequelize } = require('../../../config/database');

/**
 * Bank Reconciliation Service
 *
 * Handles bank statement reconciliation, matching transactions, and identifying discrepancies
 */

/**
 * Import bank statement transactions
 */
async function importBankStatement({
  accountId,
  statementDate,
  openingBalance,
  closingBalance,
  transactions,
  userId
}) {
  const transaction = await sequelize.transaction();

  try {
    // Validate account
    const account = await Account.findByPk(accountId);
    if (!account) {
      throw new Error('Bank account not found');
    }

    if (account.type !== 'bank' && account.type !== 'cash') {
      throw new Error('Account must be a bank or cash account');
    }

    // Store statement metadata
    const statementMetadata = {
      statementDate,
      openingBalance,
      closingBalance,
      transactionCount: transactions.length,
      importedAt: new Date(),
      importedById: userId
    };

    // Process and categorize transactions
    const processedTransactions = [];
    for (const txn of transactions) {
      const processedTxn = {
        ...txn,
        matched: false,
        matchedPaymentId: null,
        matchedJournalEntryId: null,
        reconciliationStatus: 'unmatched',
        suggestedMatches: []
      };

      // Attempt auto-matching
      const matches = await findMatchingTransactions(accountId, txn);
      if (matches.length > 0) {
        processedTxn.suggestedMatches = matches;

        // Auto-match if high confidence
        if (matches.length === 1 && matches[0].confidence >= 0.9) {
          processedTxn.matched = true;
          processedTxn.matchedPaymentId = matches[0].paymentId;
          processedTxn.matchedJournalEntryId = matches[0].journalEntryId;
          processedTxn.reconciliationStatus = 'matched';
        }
      }

      processedTransactions.push(processedTxn);
    }

    // Update account with statement data
    const existingStatements = account.bankStatements || [];
    existingStatements.push({
      ...statementMetadata,
      transactions: processedTransactions
    });

    await account.update({
      bankStatements: existingStatements,
      lastReconciliationDate: statementDate
    }, { transaction });

    await transaction.commit();

    const matchedCount = processedTransactions.filter(t => t.matched).length;
    const unmatchedCount = processedTransactions.length - matchedCount;

    logger.info('Bank statement imported', {
      accountId,
      statementDate,
      transactionCount: transactions.length,
      matchedCount,
      unmatchedCount,
      userId
    });

    return {
      statement: {
        ...statementMetadata,
        transactions: processedTransactions
      },
      summary: {
        totalTransactions: transactions.length,
        matched: matchedCount,
        unmatched: unmatchedCount,
        openingBalance,
        closingBalance,
        calculatedBalance: openingBalance + processedTransactions.reduce((sum, t) => sum + t.amount, 0)
      }
    };
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to import bank statement', {
      error: error.message,
      accountId
    });
    throw error;
  }
}

/**
 * Match bank transaction to payment/journal entry
 */
async function matchTransaction({
  accountId,
  statementDate,
  transactionIndex,
  matchType,
  matchId,
  userId
}) {
  const transaction = await sequelize.transaction();

  try {
    const account = await Account.findByPk(accountId, { transaction });
    if (!account) {
      throw new Error('Account not found');
    }

    const statements = account.bankStatements || [];
    const statement = statements.find(s => s.statementDate === statementDate);

    if (!statement) {
      throw new Error('Statement not found');
    }

    if (transactionIndex >= statement.transactions.length) {
      throw new Error('Transaction index out of range');
    }

    const txn = statement.transactions[transactionIndex];

    // Validate match
    if (matchType === 'payment') {
      const payment = await Payment.findByPk(matchId, { transaction });
      if (!payment) {
        throw new Error('Payment not found');
      }

      txn.matched = true;
      txn.matchedPaymentId = matchId;
      txn.reconciliationStatus = 'matched';

      // Update payment as reconciled
      await payment.update({
        reconciled: true,
        reconciledDate: new Date(),
        reconciledById: userId
      }, { transaction });

    } else if (matchType === 'journal_entry') {
      const journalEntry = await JournalEntry.findByPk(matchId, { transaction });
      if (!journalEntry) {
        throw new Error('Journal entry not found');
      }

      txn.matched = true;
      txn.matchedJournalEntryId = matchId;
      txn.reconciliationStatus = 'matched';

      // Update journal entry as reconciled
      await journalEntry.update({
        reconciled: true,
        reconciledDate: new Date(),
        reconciledById: userId
      }, { transaction });
    }

    txn.matchedAt = new Date();
    txn.matchedById = userId;

    await account.update({
      bankStatements: statements
    }, { transaction });

    await transaction.commit();

    logger.info('Transaction matched', {
      accountId,
      statementDate,
      transactionIndex,
      matchType,
      matchId,
      userId
    });

    return txn;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to match transaction', {
      error: error.message,
      accountId,
      transactionIndex
    });
    throw error;
  }
}

/**
 * Unmatch a reconciled transaction
 */
async function unmatchTransaction({
  accountId,
  statementDate,
  transactionIndex,
  userId,
  reason
}) {
  const transaction = await sequelize.transaction();

  try {
    const account = await Account.findByPk(accountId, { transaction });
    if (!account) {
      throw new Error('Account not found');
    }

    const statements = account.bankStatements || [];
    const statement = statements.find(s => s.statementDate === statementDate);

    if (!statement) {
      throw new Error('Statement not found');
    }

    const txn = statement.transactions[transactionIndex];

    if (!txn.matched) {
      throw new Error('Transaction is not matched');
    }

    // Unmatch payment or journal entry
    if (txn.matchedPaymentId) {
      const payment = await Payment.findByPk(txn.matchedPaymentId, { transaction });
      if (payment) {
        await payment.update({
          reconciled: false,
          reconciledDate: null,
          reconciledById: null
        }, { transaction });
      }
    }

    if (txn.matchedJournalEntryId) {
      const journalEntry = await JournalEntry.findByPk(txn.matchedJournalEntryId, { transaction });
      if (journalEntry) {
        await journalEntry.update({
          reconciled: false,
          reconciledDate: null,
          reconciledById: null
        }, { transaction });
      }
    }

    // Update transaction
    txn.matched = false;
    txn.matchedPaymentId = null;
    txn.matchedJournalEntryId = null;
    txn.reconciliationStatus = 'unmatched';
    txn.unmatchedAt = new Date();
    txn.unmatchedById = userId;
    txn.unmatchReason = reason;

    await account.update({
      bankStatements: statements
    }, { transaction });

    await transaction.commit();

    logger.info('Transaction unmatched', {
      accountId,
      statementDate,
      transactionIndex,
      userId,
      reason
    });

    return txn;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to unmatch transaction', {
      error: error.message,
      accountId,
      transactionIndex
    });
    throw error;
  }
}

/**
 * Create adjustment entry for unmatched transaction
 */
async function createAdjustmentEntry({
  accountId,
  statementDate,
  transactionIndex,
  adjustmentType,
  description,
  userId
}) {
  const transaction = await sequelize.transaction();

  try {
    const account = await Account.findByPk(accountId, { transaction });
    if (!account) {
      throw new Error('Account not found');
    }

    const statements = account.bankStatements || [];
    const statement = statements.find(s => s.statementDate === statementDate);

    if (!statement) {
      throw new Error('Statement not found');
    }

    const txn = statement.transactions[transactionIndex];

    // Create journal entry for adjustment
    const journalEntry = await JournalEntry.create({
      entryNumber: `ADJ-${Date.now()}`,
      entryDate: new Date(txn.date),
      description: description || `Bank reconciliation adjustment: ${adjustmentType}`,
      type: 'adjustment',
      status: 'posted',
      lineItems: [
        {
          accountId: accountId,
          debit: txn.amount > 0 ? Math.abs(txn.amount) : 0,
          credit: txn.amount < 0 ? Math.abs(txn.amount) : 0,
          description: txn.description
        },
        {
          accountId: getAdjustmentAccountId(adjustmentType),
          debit: txn.amount < 0 ? Math.abs(txn.amount) : 0,
          credit: txn.amount > 0 ? Math.abs(txn.amount) : 0,
          description: `Adjustment: ${adjustmentType}`
        }
      ],
      createdById: userId,
      reconciled: true,
      reconciledDate: new Date()
    }, { transaction });

    // Match transaction to adjustment entry
    txn.matched = true;
    txn.matchedJournalEntryId = journalEntry.id;
    txn.reconciliationStatus = 'adjusted';
    txn.adjustmentType = adjustmentType;

    await account.update({
      bankStatements: statements
    }, { transaction });

    await transaction.commit();

    logger.info('Adjustment entry created', {
      accountId,
      statementDate,
      transactionIndex,
      adjustmentType,
      journalEntryId: journalEntry.id,
      userId
    });

    return {
      transaction: txn,
      journalEntry
    };
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to create adjustment entry', {
      error: error.message,
      accountId,
      transactionIndex
    });
    throw error;
  }
}

/**
 * Complete reconciliation for a statement
 */
async function completeReconciliation({
  accountId,
  statementDate,
  userId,
  notes
}) {
  try {
    const account = await Account.findByPk(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    const statements = account.bankStatements || [];
    const statement = statements.find(s => s.statementDate === statementDate);

    if (!statement) {
      throw new Error('Statement not found');
    }

    // Check if all transactions are matched
    const unmatchedCount = statement.transactions.filter(t => !t.matched).length;

    if (unmatchedCount > 0) {
      throw new Error(`Cannot complete reconciliation: ${unmatchedCount} unmatched transactions`);
    }

    // Calculate final balances
    const calculatedBalance = statement.openingBalance +
      statement.transactions.reduce((sum, t) => sum + t.amount, 0);

    const balanceDifference = statement.closingBalance - calculatedBalance;

    if (Math.abs(balanceDifference) > 0.01) {
      throw new Error(`Balance mismatch: ${balanceDifference}. Statement closing balance does not match calculated balance.`);
    }

    // Mark statement as reconciled
    statement.reconciled = true;
    statement.reconciledAt = new Date();
    statement.reconciledById = userId;
    statement.reconciliationNotes = notes;
    statement.finalBalance = statement.closingBalance;

    await account.update({
      bankStatements: statements,
      lastReconciliationDate: statementDate,
      reconciledBalance: statement.closingBalance
    });

    logger.info('Reconciliation completed', {
      accountId,
      statementDate,
      transactionCount: statement.transactions.length,
      closingBalance: statement.closingBalance,
      userId
    });

    return {
      reconciled: true,
      statement,
      summary: {
        totalTransactions: statement.transactions.length,
        openingBalance: statement.openingBalance,
        closingBalance: statement.closingBalance,
        balanceDifference: 0
      }
    };
  } catch (error) {
    logger.error('Failed to complete reconciliation', {
      error: error.message,
      accountId,
      statementDate
    });
    throw error;
  }
}

/**
 * Get reconciliation status
 */
async function getReconciliationStatus(accountId, statementDate = null) {
  try {
    const account = await Account.findByPk(accountId);
    if (!account) {
      throw new Error('Account not found');
    }

    const statements = account.bankStatements || [];

    if (statementDate) {
      const statement = statements.find(s => s.statementDate === statementDate);
      if (!statement) {
        throw new Error('Statement not found');
      }

      return getStatementStatus(statement);
    }

    // Return status for all statements
    return statements.map(s => getStatementStatus(s));
  } catch (error) {
    logger.error('Failed to get reconciliation status', {
      error: error.message,
      accountId
    });
    throw error;
  }
}

/**
 * Get unreconciled transactions
 */
async function getUnreconciledTransactions(accountId, options = {}) {
  try {
    const {
      startDate,
      endDate,
      type // 'payment' or 'journal_entry'
    } = options;

    const where = {
      accountId,
      reconciled: false
    };

    if (startDate || endDate) {
      where.transactionDate = {};
      if (startDate) where.transactionDate[Op.gte] = startDate;
      if (endDate) where.transactionDate[Op.lte] = endDate;
    }

    let transactions = [];

    if (!type || type === 'payment') {
      const payments = await Payment.findAll({
        where,
        order: [['transactionDate', 'ASC']]
      });
      transactions = [...transactions, ...payments.map(p => ({ ...p.toJSON(), type: 'payment' }))];
    }

    if (!type || type === 'journal_entry') {
      const journalEntries = await JournalEntry.findAll({
        where: {
          ...where,
          status: 'posted'
        },
        order: [['entryDate', 'ASC']]
      });
      transactions = [...transactions, ...journalEntries.map(j => ({ ...j.toJSON(), type: 'journal_entry' }))];
    }

    // Sort by date
    transactions.sort((a, b) => {
      const dateA = a.transactionDate || a.entryDate;
      const dateB = b.transactionDate || b.entryDate;
      return new Date(dateA) - new Date(dateB);
    });

    return transactions;
  } catch (error) {
    logger.error('Failed to get unreconciled transactions', {
      error: error.message,
      accountId
    });
    throw error;
  }
}

// Helper functions

/**
 * Find matching transactions for auto-reconciliation
 */
async function findMatchingTransactions(accountId, bankTransaction) {
  const matches = [];

  const {
    date,
    amount,
    description,
    reference
  } = bankTransaction;

  // Search window: +/- 3 days
  const searchStart = new Date(date);
  searchStart.setDate(searchStart.getDate() - 3);
  const searchEnd = new Date(date);
  searchEnd.setDate(searchEnd.getDate() + 3);

  // Search payments
  const payments = await Payment.findAll({
    where: {
      accountId,
      amount: Math.abs(amount),
      transactionDate: {
        [Op.between]: [searchStart, searchEnd]
      },
      reconciled: false
    }
  });

  payments.forEach(payment => {
    let confidence = 0.5; // Base confidence

    // Exact amount match
    if (Math.abs(payment.amount - Math.abs(amount)) < 0.01) {
      confidence += 0.3;
    }

    // Date proximity
    const daysDiff = Math.abs((new Date(payment.transactionDate) - new Date(date)) / (1000 * 60 * 60 * 24));
    if (daysDiff === 0) confidence += 0.2;
    else if (daysDiff <= 1) confidence += 0.1;

    // Reference match
    if (reference && payment.referenceNumber && reference.includes(payment.referenceNumber)) {
      confidence += 0.3;
    }

    // Description similarity
    if (description && payment.description) {
      const similarity = calculateStringSimilarity(description.toLowerCase(), payment.description.toLowerCase());
      confidence += similarity * 0.2;
    }

    if (confidence >= 0.6) {
      matches.push({
        type: 'payment',
        paymentId: payment.id,
        confidence,
        reason: `Amount: ${payment.amount}, Date: ${payment.transactionDate}`
      });
    }
  });

  // Sort by confidence
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

/**
 * Calculate string similarity (simple implementation)
 */
function calculateStringSimilarity(str1, str2) {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;

  if (longer.length === 0) return 1.0;

  const editDistance = levenshteinDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

/**
 * Levenshtein distance for string comparison
 */
function levenshteinDistance(str1, str2) {
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[str2.length][str1.length];
}

/**
 * Get statement reconciliation status
 */
function getStatementStatus(statement) {
  const matchedCount = statement.transactions.filter(t => t.matched).length;
  const totalCount = statement.transactions.length;
  const matchPercentage = totalCount > 0 ? (matchedCount / totalCount) * 100 : 0;

  return {
    statementDate: statement.statementDate,
    reconciled: statement.reconciled || false,
    totalTransactions: totalCount,
    matchedTransactions: matchedCount,
    unmatchedTransactions: totalCount - matchedCount,
    matchPercentage: matchPercentage.toFixed(2),
    openingBalance: statement.openingBalance,
    closingBalance: statement.closingBalance,
    reconciledAt: statement.reconciledAt,
    reconciledById: statement.reconciledById
  };
}

/**
 * Get adjustment account ID based on type
 */
function getAdjustmentAccountId(adjustmentType) {
  // This would map to actual account IDs in the system
  // Placeholder implementation
  const adjustmentAccounts = {
    'bank_fee': 'bank-fees-account-id',
    'interest': 'interest-income-account-id',
    'error': 'reconciliation-adjustments-account-id',
    'other': 'miscellaneous-account-id'
  };

  return adjustmentAccounts[adjustmentType] || adjustmentAccounts['other'];
}

module.exports = {
  importBankStatement,
  matchTransaction,
  unmatchTransaction,
  createAdjustmentEntry,
  completeReconciliation,
  getReconciliationStatus,
  getUnreconciledTransactions
};
