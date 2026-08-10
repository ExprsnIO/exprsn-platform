const { Account, JournalEntry, Payment, Customer, Supplier, Employee } = require('../../../models/forge');
const { Op } = require('sequelize');
const { sequelize } = require('../../../config/database');
const logger = require('../../../utils/logger');

/**
 * Accounting Service
 * Handles Chart of Accounts, Journal Entries, and Payments
 */

// ===== Chart of Accounts =====

/**
 * Create a new account
 */
async function createAccount(data) {
  try {
    // Validate parent account if provided
    if (data.parentAccountId) {
      const parentAccount = await Account.findByPk(data.parentAccountId);
      if (!parentAccount) {
        throw new Error('Parent account not found');
      }
    }

    const account = await Account.create(data);

    logger.info('Account created', {
      accountId: account.id,
      accountNumber: account.accountNumber,
      accountName: account.accountName
    });

    return account;
  } catch (error) {
    logger.error('Failed to create account', { error: error.message });
    throw error;
  }
}

/**
 * Get account by ID with parent and child accounts
 */
async function getAccountById(id) {
  try {
    const account = await Account.findByPk(id, {
      include: [
        {
          model: Account,
          as: 'parentAccount',
          attributes: ['id', 'accountNumber', 'accountName']
        },
        {
          model: Account,
          as: 'subAccounts',
          attributes: ['id', 'accountNumber', 'accountName', 'currentBalance']
        }
      ]
    });

    if (!account) {
      throw new Error('Account not found');
    }

    return account;
  } catch (error) {
    logger.error('Failed to get account', { error: error.message, accountId: id });
    throw error;
  }
}

/**
 * List accounts with filters
 */
async function listAccounts(filters = {}) {
  try {
    const { accountType, isActive, parentAccountId, includeBalance = true } = filters;

    const where = {};
    if (accountType) where.accountType = accountType;
    if (typeof isActive === 'boolean') where.isActive = isActive;
    if (parentAccountId) where.parentAccountId = parentAccountId;

    const accounts = await Account.findAll({
      where,
      include: includeBalance ? [
        {
          model: Account,
          as: 'subAccounts',
          attributes: ['id', 'accountNumber', 'accountName', 'currentBalance']
        }
      ] : [],
      order: [['accountNumber', 'ASC']]
    });

    return accounts;
  } catch (error) {
    logger.error('Failed to list accounts', { error: error.message });
    throw error;
  }
}

/**
 * Update account
 */
async function updateAccount(id, updates) {
  try {
    const account = await Account.findByPk(id);

    if (!account) {
      throw new Error('Account not found');
    }

    // Prevent modification of system accounts
    if (account.isSystemAccount) {
      throw new Error('Cannot modify system account');
    }

    // Validate parent account change
    if (updates.parentAccountId && updates.parentAccountId !== account.parentAccountId) {
      const parentAccount = await Account.findByPk(updates.parentAccountId);
      if (!parentAccount) {
        throw new Error('Parent account not found');
      }

      // Prevent circular reference
      if (updates.parentAccountId === account.id) {
        throw new Error('Account cannot be its own parent');
      }
    }

    await account.update(updates);

    logger.info('Account updated', {
      accountId: account.id,
      accountNumber: account.accountNumber
    });

    return account;
  } catch (error) {
    logger.error('Failed to update account', { error: error.message, accountId: id });
    throw error;
  }
}

/**
 * Deactivate account
 */
async function deactivateAccount(id) {
  try {
    const account = await Account.findByPk(id);

    if (!account) {
      throw new Error('Account not found');
    }

    if (account.isSystemAccount) {
      throw new Error('Cannot deactivate system account');
    }

    // Check if account has a balance
    if (account.currentBalance !== 0) {
      throw new Error('Cannot deactivate account with non-zero balance');
    }

    await account.update({ isActive: false });

    logger.info('Account deactivated', {
      accountId: account.id,
      accountNumber: account.accountNumber
    });

    return account;
  } catch (error) {
    logger.error('Failed to deactivate account', { error: error.message, accountId: id });
    throw error;
  }
}

/**
 * Get account balance as of a specific date
 */
async function getAccountBalance(accountId, asOfDate = new Date()) {
  try {
    const account = await Account.findByPk(accountId);

    if (!account) {
      throw new Error('Account not found');
    }

    // Calculate balance from journal entries
    const result = await sequelize.query(`
      SELECT
        SUM(CASE WHEN line_item->>'accountId' = :accountId THEN (line_item->>'debit')::numeric ELSE 0 END) as total_debit,
        SUM(CASE WHEN line_item->>'accountId' = :accountId THEN (line_item->>'credit')::numeric ELSE 0 END) as total_credit
      FROM journal_entries,
      jsonb_array_elements(line_items) as line_item
      WHERE is_posted = true
      AND entry_date <= :asOfDate
    `, {
      replacements: { accountId, asOfDate },
      type: sequelize.QueryTypes.SELECT
    });

    const totalDebit = parseFloat(result[0]?.total_debit || 0);
    const totalCredit = parseFloat(result[0]?.total_credit || 0);

    // Calculate balance based on normal balance
    const balance = account.normalBalance === 'debit'
      ? totalDebit - totalCredit
      : totalCredit - totalDebit;

    return {
      accountId: account.id,
      accountNumber: account.accountNumber,
      accountName: account.accountName,
      accountType: account.accountType,
      normalBalance: account.normalBalance,
      balance: parseFloat(balance.toFixed(2)),
      asOfDate,
      totalDebit,
      totalCredit
    };
  } catch (error) {
    logger.error('Failed to get account balance', { error: error.message, accountId });
    throw error;
  }
}

// ===== Journal Entries =====

/**
 * Generate next journal entry number
 */
async function generateJournalEntryNumber() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const prefix = `JE-${year}${month}-`;

  const lastEntry = await JournalEntry.findOne({
    where: {
      entryNumber: {
        [Op.like]: `${prefix}%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastEntry) {
    const lastNumber = lastEntry.entryNumber.split('-')[2];
    sequence = parseInt(lastNumber) + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Validate journal entry (debits must equal credits)
 */
function validateJournalEntry(entry) {
  const { lineItems } = entry;

  if (!lineItems || lineItems.length === 0) {
    throw new Error('Journal entry must have at least one line item');
  }

  let totalDebit = 0;
  let totalCredit = 0;

  lineItems.forEach(item => {
    const debit = parseFloat(item.debit || 0);
    const credit = parseFloat(item.credit || 0);

    if (debit > 0 && credit > 0) {
      throw new Error('Line item cannot have both debit and credit');
    }

    if (debit === 0 && credit === 0) {
      throw new Error('Line item must have either debit or credit');
    }

    totalDebit += debit;
    totalCredit += credit;
  });

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error('Total debits must equal total credits');
  }

  return {
    totalDebit: parseFloat(totalDebit.toFixed(2)),
    totalCredit: parseFloat(totalCredit.toFixed(2)),
    isBalanced: true
  };
}

/**
 * Create journal entry
 */
async function createJournalEntry(data) {
  const transaction = await sequelize.transaction();

  try {
    // Generate entry number if not provided
    if (!data.entryNumber) {
      data.entryNumber = await generateJournalEntryNumber();
    }

    // Validate entry
    const totals = validateJournalEntry(data);

    // Verify all accounts exist
    const accountIds = data.lineItems.map(item => item.accountId);
    const accounts = await Account.findAll({
      where: { id: { [Op.in]: accountIds } },
      transaction
    });

    if (accounts.length !== accountIds.length) {
      throw new Error('One or more accounts not found');
    }

    // Create entry
    const entry = await JournalEntry.create({
      ...data,
      totalDebit: totals.totalDebit,
      totalCredit: totals.totalCredit,
      status: data.status || 'draft',
      isPosted: false
    }, { transaction });

    await transaction.commit();

    logger.info('Journal entry created', {
      entryId: entry.id,
      entryNumber: entry.entryNumber,
      totalDebit: entry.totalDebit,
      totalCredit: entry.totalCredit
    });

    return entry;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to create journal entry', { error: error.message });
    throw error;
  }
}

/**
 * Get journal entry by ID
 */
async function getJournalEntryById(id) {
  try {
    const entry = await JournalEntry.findByPk(id);

    if (!entry) {
      throw new Error('Journal entry not found');
    }

    return entry;
  } catch (error) {
    logger.error('Failed to get journal entry', { error: error.message, entryId: id });
    throw error;
  }
}

/**
 * List journal entries with filters
 */
async function listJournalEntries(filters = {}) {
  try {
    const {
      entryType,
      status,
      isPosted,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = filters;

    const where = {};

    if (entryType) where.entryType = entryType;
    if (status) where.status = status;
    if (typeof isPosted === 'boolean') where.isPosted = isPosted;
    if (startDate && endDate) {
      where.entryDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const { count, rows } = await JournalEntry.findAndCountAll({
      where,
      order: [['entryDate', 'DESC'], ['createdAt', 'DESC']],
      limit,
      offset
    });

    return {
      entries: rows,
      total: count,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to list journal entries', { error: error.message });
    throw error;
  }
}

/**
 * Post journal entry (make it permanent and update account balances)
 */
async function postJournalEntry(entryId) {
  const transaction = await sequelize.transaction();

  try {
    const entry = await JournalEntry.findByPk(entryId, { transaction });

    if (!entry) {
      throw new Error('Journal entry not found');
    }

    if (entry.isPosted) {
      throw new Error('Journal entry already posted');
    }

    if (entry.status !== 'approved') {
      throw new Error('Journal entry must be approved before posting');
    }

    // Re-validate entry
    validateJournalEntry(entry);

    // Update account balances
    for (const lineItem of entry.lineItems) {
      const account = await Account.findByPk(lineItem.accountId, { transaction });

      if (!account) {
        throw new Error(`Account not found: ${lineItem.accountId}`);
      }

      const debit = parseFloat(lineItem.debit || 0);
      const credit = parseFloat(lineItem.credit || 0);

      let balanceChange = 0;
      if (account.normalBalance === 'debit') {
        balanceChange = debit - credit;
      } else {
        balanceChange = credit - debit;
      }

      await account.update({
        currentBalance: account.currentBalance + balanceChange
      }, { transaction });
    }

    // Mark entry as posted
    await entry.update({
      isPosted: true,
      postedAt: new Date(),
      status: 'posted'
    }, { transaction });

    await transaction.commit();

    logger.info('Journal entry posted', {
      entryId: entry.id,
      entryNumber: entry.entryNumber
    });

    return entry;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to post journal entry', { error: error.message, entryId });
    throw error;
  }
}

/**
 * Reverse journal entry
 */
async function reverseJournalEntry(entryId, reason) {
  const transaction = await sequelize.transaction();

  try {
    const originalEntry = await JournalEntry.findByPk(entryId, { transaction });

    if (!originalEntry) {
      throw new Error('Journal entry not found');
    }

    if (!originalEntry.isPosted) {
      throw new Error('Cannot reverse unposted entry');
    }

    if (originalEntry.reversedByEntryId) {
      throw new Error('Entry already reversed');
    }

    // Create reversing entry
    const reversingLineItems = originalEntry.lineItems.map(item => ({
      ...item,
      debit: item.credit,
      credit: item.debit
    }));

    const reversingEntry = await JournalEntry.create({
      entryNumber: await generateJournalEntryNumber(),
      entryDate: new Date(),
      entryType: 'reversing',
      description: `Reversal of ${originalEntry.entryNumber}: ${reason}`,
      lineItems: reversingLineItems,
      totalDebit: originalEntry.totalCredit,
      totalCredit: originalEntry.totalDebit,
      reversalOfEntryId: originalEntry.id,
      status: 'approved',
      isPosted: false
    }, { transaction });

    // Post the reversing entry
    await postJournalEntry(reversingEntry.id);

    // Update original entry
    await originalEntry.update({
      reversedByEntryId: reversingEntry.id,
      status: 'reversed'
    }, { transaction });

    await transaction.commit();

    logger.info('Journal entry reversed', {
      originalEntryId: originalEntry.id,
      reversingEntryId: reversingEntry.id,
      reason
    });

    return reversingEntry;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to reverse journal entry', { error: error.message, entryId });
    throw error;
  }
}

// ===== Payments =====

/**
 * Generate payment number
 */
async function generatePaymentNumber() {
  const year = new Date().getFullYear();
  const month = String(new Date().getMonth() + 1).padStart(2, '0');
  const prefix = `PAY-${year}${month}-`;

  const lastPayment = await Payment.findOne({
    where: {
      paymentNumber: {
        [Op.like]: `${prefix}%`
      }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastPayment) {
    const lastNumber = lastPayment.paymentNumber.split('-')[2];
    sequence = parseInt(lastNumber) + 1;
  }

  return `${prefix}${sequence.toString().padStart(4, '0')}`;
}

/**
 * Create payment
 */
async function createPayment(data) {
  try {
    if (!data.paymentNumber) {
      data.paymentNumber = await generatePaymentNumber();
    }

    const payment = await Payment.create({
      ...data,
      status: data.status || 'pending',
      unappliedAmount: data.amount
    });

    logger.info('Payment created', {
      paymentId: payment.id,
      paymentNumber: payment.paymentNumber,
      amount: payment.amount
    });

    return payment;
  } catch (error) {
    logger.error('Failed to create payment', { error: error.message });
    throw error;
  }
}

/**
 * Get payment by ID
 */
async function getPaymentById(id) {
  try {
    const payment = await Payment.findByPk(id, {
      include: [
        { model: Customer, as: 'customer', attributes: ['id', 'customerName', 'email'] },
        { model: Supplier, as: 'supplier', attributes: ['id', 'supplierName', 'email'] },
        { model: Employee, as: 'employee', attributes: ['id', 'firstName', 'lastName'] }
      ]
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    return payment;
  } catch (error) {
    logger.error('Failed to get payment', { error: error.message, paymentId: id });
    throw error;
  }
}

/**
 * List payments
 */
async function listPayments(filters = {}) {
  try {
    const {
      paymentType,
      customerId,
      supplierId,
      status,
      startDate,
      endDate,
      limit = 50,
      offset = 0
    } = filters;

    const where = {};
    if (paymentType) where.paymentType = paymentType;
    if (customerId) where.customerId = customerId;
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;
    if (startDate && endDate) {
      where.paymentDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)]
      };
    }

    const { count, rows } = await Payment.findAndCountAll({
      where,
      include: [
        { model: Customer, as: 'customer', attributes: ['id', 'customerName'] },
        { model: Supplier, as: 'supplier', attributes: ['id', 'supplierName'] }
      ],
      order: [['paymentDate', 'DESC']],
      limit,
      offset
    });

    return {
      payments: rows,
      total: count,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to list payments', { error: error.message });
    throw error;
  }
}

/**
 * Apply payment to invoices
 */
async function applyPaymentToInvoices(paymentId, invoiceAllocations) {
  const transaction = await sequelize.transaction();

  try {
    const payment = await Payment.findByPk(paymentId, { transaction });

    if (!payment) {
      throw new Error('Payment not found');
    }

    const totalApplied = invoiceAllocations.reduce((sum, alloc) => sum + alloc.amount, 0);

    if (totalApplied > payment.unappliedAmount) {
      throw new Error('Total applied amount exceeds unapplied payment amount');
    }

    await payment.update({
      appliedTo: invoiceAllocations,
      unappliedAmount: payment.unappliedAmount - totalApplied
    }, { transaction });

    await transaction.commit();

    logger.info('Payment applied to invoices', {
      paymentId: payment.id,
      totalApplied,
      invoiceCount: invoiceAllocations.length
    });

    return payment;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to apply payment', { error: error.message, paymentId });
    throw error;
  }
}

/**
 * Reconcile payment (mark as cleared)
 */
async function reconcilePayment(paymentId) {
  try {
    const payment = await Payment.findByPk(paymentId);

    if (!payment) {
      throw new Error('Payment not found');
    }

    await payment.update({
      status: 'cleared',
      clearedDate: new Date()
    });

    logger.info('Payment reconciled', {
      paymentId: payment.id,
      paymentNumber: payment.paymentNumber
    });

    return payment;
  } catch (error) {
    logger.error('Failed to reconcile payment', { error: error.message, paymentId });
    throw error;
  }
}

/**
 * Refund payment
 */
async function refundPayment(paymentId, reason) {
  try {
    const payment = await Payment.findByPk(paymentId);

    if (!payment) {
      throw new Error('Payment not found');
    }

    await payment.update({
      status: 'voided',
      notes: `${payment.notes || ''}\n\nRefund Reason: ${reason}`
    });

    logger.info('Payment refunded', {
      paymentId: payment.id,
      paymentNumber: payment.paymentNumber,
      reason
    });

    return payment;
  } catch (error) {
    logger.error('Failed to refund payment', { error: error.message, paymentId });
    throw error;
  }
}

module.exports = {
  // Chart of Accounts
  createAccount,
  getAccountById,
  listAccounts,
  updateAccount,
  deactivateAccount,
  getAccountBalance,

  // Journal Entries
  generateJournalEntryNumber,
  validateJournalEntry,
  createJournalEntry,
  getJournalEntryById,
  listJournalEntries,
  postJournalEntry,
  reverseJournalEntry,

  // Payments
  generatePaymentNumber,
  createPayment,
  getPaymentById,
  listPayments,
  applyPaymentToInvoices,
  reconcilePayment,
  refundPayment
};
