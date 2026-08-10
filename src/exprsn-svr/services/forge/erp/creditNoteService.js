const { Op } = require('sequelize');
const { CreditNote, Invoice, Customer } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const { sequelize } = require('../../../config/database');

/**
 * Credit Note Service
 *
 * Handles credit note creation, application to invoices, refund processing,
 * and credit balance management.
 */

/**
 * Generate unique credit note number
 */
async function generateCreditNoteNumber() {
  const prefix = 'CN';
  const year = new Date().getFullYear();

  const lastCreditNote = await CreditNote.findOne({
    where: {
      creditNoteNumber: {
        [Op.like]: `${prefix}-${year}%`
      }
    },
    order: [['creditNoteNumber', 'DESC']]
  });

  let sequence = 1;
  if (lastCreditNote) {
    const lastNumber = parseInt(lastCreditNote.creditNoteNumber.split('-')[2]);
    sequence = lastNumber + 1;
  }

  return `${prefix}-${year}-${sequence.toString().padStart(4, '0')}`;
}

/**
 * Create a credit note
 */
async function createCreditNote({
  invoiceId = null,
  customerId,
  issueDate,
  reason,
  creditType,
  lineItems,
  refundMethod = null,
  notes,
  internalNotes,
  userId
}) {
  const transaction = await sequelize.transaction();

  try {
    // If invoiceId provided, validate it
    let invoice = null;
    if (invoiceId) {
      invoice = await Invoice.findByPk(invoiceId, { transaction });
      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Ensure customerId matches invoice
      if (invoice.customerId !== customerId) {
        throw new Error('Customer ID does not match invoice');
      }
    }

    // Calculate totals
    const subtotal = lineItems.reduce((sum, item) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);

    const taxAmount = lineItems.reduce((sum, item) => {
      return sum + (item.taxAmount || 0);
    }, 0);

    const total = subtotal + taxAmount;

    // Generate credit note number
    const creditNoteNumber = await generateCreditNoteNumber();

    // Create credit note
    const creditNote = await CreditNote.create({
      creditNoteNumber,
      invoiceId,
      customerId,
      issueDate,
      reason,
      creditType,
      subtotal,
      taxAmount,
      total,
      remainingBalance: total,
      lineItems,
      refundMethod,
      refundStatus: refundMethod ? 'pending' : 'not_applicable',
      notes,
      internalNotes,
      createdById: userId
    }, { transaction });

    await transaction.commit();

    logger.info('Credit note created', {
      creditNoteId: creditNote.id,
      creditNoteNumber,
      customerId,
      total,
      userId
    });

    return creditNote;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to create credit note', {
      customerId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get credit note by ID
 */
async function getCreditNoteById(creditNoteId, includeRelations = false) {
  try {
    const include = [];

    if (includeRelations) {
      include.push(
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name', 'email']
        },
        {
          model: Invoice,
          as: 'invoice',
          attributes: ['id', 'invoiceNumber', 'total']
        }
      );
    }

    const creditNote = await CreditNote.findByPk(creditNoteId, { include });

    if (!creditNote) {
      throw new Error(`Credit note not found: ${creditNoteId}`);
    }

    return creditNote;
  } catch (error) {
    logger.error('Failed to get credit note', {
      creditNoteId,
      error: error.message
    });
    throw error;
  }
}

/**
 * List credit notes with filters
 */
async function listCreditNotes({
  customerId,
  invoiceId,
  status,
  creditType,
  refundStatus,
  startDate,
  endDate,
  search,
  limit = 50,
  offset = 0,
  sortBy = 'issueDate',
  sortOrder = 'DESC'
}) {
  try {
    const where = {};

    if (customerId) where.customerId = customerId;
    if (invoiceId) where.invoiceId = invoiceId;
    if (status) where.status = status;
    if (creditType) where.creditType = creditType;
    if (refundStatus) where.refundStatus = refundStatus;

    if (startDate || endDate) {
      where.issueDate = {};
      if (startDate) where.issueDate[Op.gte] = startDate;
      if (endDate) where.issueDate[Op.lte] = endDate;
    }

    if (search) {
      where[Op.or] = [
        { creditNoteNumber: { [Op.iLike]: `%${search}%` } },
        { reason: { [Op.iLike]: `%${search}%` } },
        { notes: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await CreditNote.findAndCountAll({
      where,
      limit,
      offset,
      order: [[sortBy, sortOrder]],
      include: [
        {
          model: Customer,
          as: 'customer',
          attributes: ['id', 'name']
        }
      ]
    });

    return {
      creditNotes: rows,
      total: count,
      limit,
      offset
    };
  } catch (error) {
    logger.error('Failed to list credit notes', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Update credit note
 */
async function updateCreditNote(creditNoteId, updates) {
  try {
    const creditNote = await getCreditNoteById(creditNoteId);

    // Cannot update issued, applied, or voided credit notes
    if (creditNote.status !== 'draft') {
      throw new Error('Can only update draft credit notes');
    }

    // Recalculate totals if line items changed
    if (updates.lineItems) {
      const subtotal = updates.lineItems.reduce((sum, item) => {
        return sum + (item.quantity * item.unitPrice);
      }, 0);

      const taxAmount = updates.lineItems.reduce((sum, item) => {
        return sum + (item.taxAmount || 0);
      }, 0);

      updates.subtotal = subtotal;
      updates.taxAmount = taxAmount;
      updates.total = subtotal + taxAmount;
      updates.remainingBalance = subtotal + taxAmount;
    }

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        creditNote[key] = updates[key];
      }
    });

    await creditNote.save();

    logger.info('Credit note updated', {
      creditNoteId,
      updates: Object.keys(updates)
    });

    return creditNote;
  } catch (error) {
    logger.error('Failed to update credit note', {
      creditNoteId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Issue credit note (change from draft to issued)
 */
async function issueCreditNote(creditNoteId, userId) {
  const transaction = await sequelize.transaction();

  try {
    const creditNote = await getCreditNoteById(creditNoteId);

    if (creditNote.status !== 'draft') {
      throw new Error('Can only issue draft credit notes');
    }

    creditNote.status = 'issued';
    creditNote.approvedById = userId;
    creditNote.approvedAt = new Date();

    await creditNote.save({ transaction });

    await transaction.commit();

    logger.info('Credit note issued', {
      creditNoteId,
      creditNoteNumber: creditNote.creditNoteNumber,
      userId
    });

    return creditNote;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to issue credit note', {
      creditNoteId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Apply credit note to invoice
 */
async function applyCreditNoteToInvoice({
  creditNoteId,
  invoiceId,
  amount,
  userId
}) {
  const transaction = await sequelize.transaction();

  try {
    const creditNote = await getCreditNoteById(creditNoteId);
    const invoice = await Invoice.findByPk(invoiceId, { transaction });

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    // Validate credit note can be applied
    if (creditNote.status === 'void') {
      throw new Error('Cannot apply voided credit note');
    }

    if (creditNote.status === 'draft') {
      throw new Error('Cannot apply draft credit note. Issue it first.');
    }

    // Validate amount
    if (amount > creditNote.remainingBalance) {
      throw new Error(`Amount exceeds remaining balance of ${creditNote.remainingBalance}`);
    }

    if (amount > invoice.amountDue) {
      throw new Error(`Amount exceeds invoice amount due of ${invoice.amountDue}`);
    }

    // Apply credit to invoice
    invoice.amountPaid = parseFloat(invoice.amountPaid) + amount;
    invoice.amountDue = parseFloat(invoice.amountDue) - amount;

    // Update invoice status if fully paid
    if (invoice.amountDue <= 0.01) {
      invoice.status = 'paid';
      invoice.paidAt = new Date();
    }

    await invoice.save({ transaction });

    // Update credit note
    creditNote.appliedAmount = parseFloat(creditNote.appliedAmount) + amount;
    creditNote.remainingBalance = parseFloat(creditNote.remainingBalance) - amount;

    // Update applications array
    const applications = creditNote.applications || [];
    applications.push({
      invoiceId,
      amount,
      appliedAt: new Date(),
      appliedById: userId
    });
    creditNote.applications = applications;

    // Update status if fully applied
    if (creditNote.remainingBalance <= 0.01) {
      creditNote.status = 'applied';
    }

    await creditNote.save({ transaction });

    await transaction.commit();

    logger.info('Credit note applied to invoice', {
      creditNoteId,
      invoiceId,
      amount,
      userId
    });

    return {
      creditNote,
      invoice
    };
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to apply credit note to invoice', {
      creditNoteId,
      invoiceId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Process refund for credit note
 */
async function processRefund({
  creditNoteId,
  refundMethod,
  refundReference,
  userId
}) {
  const transaction = await sequelize.transaction();

  try {
    const creditNote = await getCreditNoteById(creditNoteId);

    if (creditNote.status === 'void') {
      throw new Error('Cannot process refund for voided credit note');
    }

    if (creditNote.refundStatus === 'completed') {
      throw new Error('Refund already processed');
    }

    // Update refund details
    creditNote.refundMethod = refundMethod;
    creditNote.refundReference = refundReference;
    creditNote.refundStatus = 'completed';
    creditNote.refundedAt = new Date();

    await creditNote.save({ transaction });

    await transaction.commit();

    logger.info('Credit note refund processed', {
      creditNoteId,
      refundMethod,
      refundReference,
      userId
    });

    return creditNote;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to process refund', {
      creditNoteId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Void credit note
 */
async function voidCreditNote(creditNoteId, voidReason, userId) {
  const transaction = await sequelize.transaction();

  try {
    const creditNote = await getCreditNoteById(creditNoteId);

    if (creditNote.status === 'void') {
      throw new Error('Credit note is already voided');
    }

    if (creditNote.appliedAmount > 0) {
      throw new Error('Cannot void credit note that has been applied to invoices');
    }

    if (creditNote.refundStatus === 'completed') {
      throw new Error('Cannot void credit note with completed refund');
    }

    creditNote.status = 'void';
    creditNote.voidedById = userId;
    creditNote.voidedAt = new Date();
    creditNote.voidReason = voidReason;
    creditNote.remainingBalance = 0;

    await creditNote.save({ transaction });

    await transaction.commit();

    logger.info('Credit note voided', {
      creditNoteId,
      voidReason,
      userId
    });

    return creditNote;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to void credit note', {
      creditNoteId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get customer credit balance
 */
async function getCustomerCreditBalance(customerId) {
  try {
    const creditNotes = await CreditNote.findAll({
      where: {
        customerId,
        status: ['issued', 'applied'],
        remainingBalance: {
          [Op.gt]: 0
        }
      }
    });

    const totalCreditAvailable = creditNotes.reduce((sum, cn) => {
      return sum + parseFloat(cn.remainingBalance);
    }, 0);

    return {
      customerId,
      totalCreditAvailable: parseFloat(totalCreditAvailable.toFixed(2)),
      creditNoteCount: creditNotes.length,
      creditNotes: creditNotes.map(cn => ({
        id: cn.id,
        creditNoteNumber: cn.creditNoteNumber,
        issueDate: cn.issueDate,
        total: cn.total,
        appliedAmount: cn.appliedAmount,
        remainingBalance: cn.remainingBalance
      }))
    };
  } catch (error) {
    logger.error('Failed to get customer credit balance', {
      customerId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Delete credit note
 */
async function deleteCreditNote(creditNoteId) {
  try {
    const creditNote = await getCreditNoteById(creditNoteId);

    // Can only delete draft credit notes
    if (creditNote.status !== 'draft') {
      throw new Error('Can only delete draft credit notes. Void issued credit notes instead.');
    }

    await creditNote.destroy();

    logger.info('Credit note deleted', { creditNoteId });

    return { success: true };
  } catch (error) {
    logger.error('Failed to delete credit note', {
      creditNoteId,
      error: error.message
    });
    throw error;
  }
}

module.exports = {
  createCreditNote,
  getCreditNoteById,
  listCreditNotes,
  updateCreditNote,
  issueCreditNote,
  applyCreditNoteToInvoice,
  processRefund,
  voidCreditNote,
  getCustomerCreditBalance,
  deleteCreditNote
};
