const axios = require('axios');
const logger = require('../../utils/logger');

/**
 * Workflow Integration Service
 *
 * Integrates Forge business processes with the Exprsn Workflow automation engine
 */

const WORKFLOW_SERVICE_URL = process.env.WORKFLOW_SERVICE_URL || 'http://localhost:3017';

/**
 * Workflow trigger types
 */
const TRIGGER_TYPES = {
  // Inventory triggers
  LOW_STOCK: 'inventory.low_stock',
  REORDER_NEEDED: 'inventory.reorder_needed',
  STOCK_OUT: 'inventory.stock_out',
  OVERSTOCK: 'inventory.overstock',

  // Purchase order triggers
  PO_SUBMITTED: 'purchase.order_submitted',
  PO_APPROVED: 'purchase.order_approved',
  PO_REJECTED: 'purchase.order_rejected',
  PO_RECEIVED: 'purchase.order_received',

  // Sales order triggers
  SO_CREATED: 'sales.order_created',
  SO_APPROVED: 'sales.order_approved',
  SO_SHIPPED: 'sales.order_shipped',
  SO_DELIVERED: 'sales.order_delivered',
  SO_CANCELLED: 'sales.order_cancelled',

  // Comment/Moderation triggers
  COMMENT_FLAGGED: 'comment.flagged',
  COMMENT_REPORTED: 'comment.reported',

  // Wiki triggers
  WIKI_PUBLISHED: 'wiki.page_published',
  WIKI_UPDATED: 'wiki.page_updated',

  // Bank reconciliation triggers
  RECONCILIATION_STARTED: 'bank.reconciliation_started',
  RECONCILIATION_COMPLETED: 'bank.reconciliation_completed',
  UNMATCHED_TRANSACTION: 'bank.unmatched_transaction',

  // Approval workflows
  APPROVAL_REQUIRED: 'approval.required',
  APPROVAL_APPROVED: 'approval.approved',
  APPROVAL_REJECTED: 'approval.rejected',

  // Notification triggers
  NOTIFICATION_SEND: 'notification.send'
};

/**
 * Execute workflow by ID
 */
async function executeWorkflow(workflowId, inputData, userId, options = {}) {
  try {
    const response = await axios.post(
      `${WORKFLOW_SERVICE_URL}/api/executions`,
      {
        workflow_id: workflowId,
        input_data: inputData,
        options: {
          triggerType: options.triggerType || 'api',
          triggerData: options.triggerData || {},
          priority: options.priority || 5
        }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          // Would use CA token in production
          'X-User-ID': userId
        }
      }
    );

    logger.info('Workflow execution started', {
      workflowId,
      executionId: response.data.execution.id,
      triggerType: options.triggerType
    });

    return response.data.execution;
  } catch (error) {
    logger.error('Failed to execute workflow', {
      error: error.message,
      workflowId
    });
    throw error;
  }
}

/**
 * Trigger workflow by trigger type
 */
async function triggerWorkflow(triggerType, triggerData, userId) {
  try {
    // Find active workflows with this trigger type
    const response = await axios.get(
      `${WORKFLOW_SERVICE_URL}/api/workflows`,
      {
        params: {
          trigger_type: triggerType,
          status: 'active'
        }
      }
    );

    const workflows = response.data.workflows || [];

    if (workflows.length === 0) {
      logger.debug('No active workflows found for trigger', { triggerType });
      return [];
    }

    // Execute all matching workflows
    const executions = [];
    for (const workflow of workflows) {
      try {
        const execution = await executeWorkflow(
          workflow.id,
          triggerData,
          userId,
          {
            triggerType,
            triggerData,
            priority: workflow.priority || 5
          }
        );
        executions.push(execution);
      } catch (error) {
        logger.error('Failed to execute workflow for trigger', {
          error: error.message,
          workflowId: workflow.id,
          triggerType
        });
      }
    }

    logger.info('Workflows triggered', {
      triggerType,
      count: executions.length
    });

    return executions;
  } catch (error) {
    logger.error('Failed to trigger workflows', {
      error: error.message,
      triggerType
    });
    throw error;
  }
}

/**
 * Trigger low stock workflow
 */
async function triggerLowStockWorkflow(inventoryData, userId) {
  return await triggerWorkflow(TRIGGER_TYPES.LOW_STOCK, {
    productId: inventoryData.productId,
    locationId: inventoryData.locationId,
    currentQuantity: inventoryData.quantityOnHand,
    availableQuantity: inventoryData.quantityAvailable,
    reorderPoint: inventoryData.reorderPoint,
    reorderQuantity: inventoryData.reorderQuantity,
    reorderStatus: inventoryData.reorderStatus,
    productName: inventoryData.productName,
    productSku: inventoryData.productSku
  }, userId);
}

/**
 * Trigger reorder needed workflow
 */
async function triggerReorderWorkflow(inventoryData, userId) {
  return await triggerWorkflow(TRIGGER_TYPES.REORDER_NEEDED, {
    productId: inventoryData.productId,
    locationId: inventoryData.locationId,
    currentQuantity: inventoryData.quantityOnHand,
    reorderPoint: inventoryData.reorderPoint,
    reorderQuantity: inventoryData.reorderQuantity,
    suggestedOrderQuantity: inventoryData.reorderQuantity,
    supplierId: inventoryData.preferredSupplierId,
    productName: inventoryData.productName,
    productSku: inventoryData.productSku,
    estimatedCost: inventoryData.lastCost * inventoryData.reorderQuantity
  }, userId);
}

/**
 * Trigger purchase order approval workflow
 */
async function triggerPurchaseApprovalWorkflow(purchaseOrder, userId) {
  return await triggerWorkflow(TRIGGER_TYPES.PO_SUBMITTED, {
    purchaseOrderId: purchaseOrder.id,
    poNumber: purchaseOrder.poNumber,
    supplierId: purchaseOrder.supplierId,
    supplierName: purchaseOrder.supplier?.name,
    total: purchaseOrder.total,
    currency: purchaseOrder.currency,
    lineItemCount: purchaseOrder.lineItems?.length || 0,
    requestedDeliveryDate: purchaseOrder.requestedDeliveryDate,
    createdBy: purchaseOrder.createdById,
    notes: purchaseOrder.notes
  }, userId);
}

/**
 * Trigger purchase order approved workflow
 */
async function triggerPurchaseApprovedWorkflow(purchaseOrder, approverUserId) {
  return await triggerWorkflow(TRIGGER_TYPES.PO_APPROVED, {
    purchaseOrderId: purchaseOrder.id,
    poNumber: purchaseOrder.poNumber,
    supplierId: purchaseOrder.supplierId,
    total: purchaseOrder.total,
    approvedBy: approverUserId,
    approvedAt: new Date()
  }, approverUserId);
}

/**
 * Trigger sales order approval workflow
 */
async function triggerSalesApprovalWorkflow(salesOrder, userId) {
  return await triggerWorkflow(TRIGGER_TYPES.SO_CREATED, {
    salesOrderId: salesOrder.id,
    orderNumber: salesOrder.orderNumber,
    customerId: salesOrder.customerId,
    customerName: salesOrder.customer?.name,
    total: salesOrder.total,
    currency: salesOrder.currency,
    lineItemCount: salesOrder.lineItems?.length || 0,
    requestedDeliveryDate: salesOrder.requestedDeliveryDate,
    shippingMethod: salesOrder.shippingMethod,
    createdBy: salesOrder.createdById
  }, userId);
}

/**
 * Trigger sales order shipped workflow
 */
async function triggerSalesShippedWorkflow(salesOrder, userId) {
  return await triggerWorkflow(TRIGGER_TYPES.SO_SHIPPED, {
    salesOrderId: salesOrder.id,
    orderNumber: salesOrder.orderNumber,
    customerId: salesOrder.customerId,
    trackingNumber: salesOrder.trackingNumber,
    carrier: salesOrder.carrier,
    shippedDate: new Date(),
    estimatedDeliveryDate: salesOrder.expectedDeliveryDate
  }, userId);
}

/**
 * Trigger comment flagged workflow
 */
async function triggerCommentFlaggedWorkflow(comment, userId) {
  return await triggerWorkflow(TRIGGER_TYPES.COMMENT_FLAGGED, {
    commentId: comment.id,
    entityType: comment.entityType,
    entityId: comment.entityId,
    authorId: comment.authorId,
    flaggedBy: userId,
    flagReason: comment.flagReason,
    content: comment.content.substring(0, 500), // Limit content length
    flaggedAt: new Date()
  }, userId);
}

/**
 * Trigger approval required workflow
 */
async function triggerApprovalWorkflow({
  entityType,
  entityId,
  entityData,
  approvalType,
  requestedBy,
  requiredApprovers,
  dueDate,
  priority = 5
}) {
  return await triggerWorkflow(TRIGGER_TYPES.APPROVAL_REQUIRED, {
    entityType,
    entityId,
    entityData,
    approvalType,
    requestedBy,
    requiredApprovers,
    dueDate,
    priority,
    requestedAt: new Date()
  }, requestedBy);
}

/**
 * Trigger notification workflow
 */
async function triggerNotificationWorkflow({
  recipientIds,
  notificationType,
  subject,
  message,
  data,
  channels = ['email'],
  priority = 5
}, userId) {
  return await triggerWorkflow(TRIGGER_TYPES.NOTIFICATION_SEND, {
    recipientIds,
    notificationType,
    subject,
    message,
    data,
    channels,
    priority,
    sentBy: userId,
    sentAt: new Date()
  }, userId);
}

/**
 * Trigger bank reconciliation workflow
 */
async function triggerReconciliationWorkflow(reconciliationData, userId) {
  return await triggerWorkflow(TRIGGER_TYPES.RECONCILIATION_STARTED, {
    accountId: reconciliationData.accountId,
    statementDate: reconciliationData.statementDate,
    openingBalance: reconciliationData.openingBalance,
    closingBalance: reconciliationData.closingBalance,
    transactionCount: reconciliationData.transactionCount,
    unmatchedCount: reconciliationData.unmatchedCount,
    balanceDifference: reconciliationData.closingBalance - reconciliationData.calculatedBalance
  }, userId);
}

/**
 * Get workflow execution status
 */
async function getExecutionStatus(executionId) {
  try {
    const response = await axios.get(
      `${WORKFLOW_SERVICE_URL}/api/executions/${executionId}`
    );

    return response.data.execution;
  } catch (error) {
    logger.error('Failed to get execution status', {
      error: error.message,
      executionId
    });
    throw error;
  }
}

/**
 * Cancel workflow execution
 */
async function cancelExecution(executionId, userId, reason) {
  try {
    const response = await axios.post(
      `${WORKFLOW_SERVICE_URL}/api/executions/${executionId}/cancel`,
      { reason },
      {
        headers: {
          'X-User-ID': userId
        }
      }
    );

    logger.info('Workflow execution cancelled', {
      executionId,
      userId,
      reason
    });

    return response.data.execution;
  } catch (error) {
    logger.error('Failed to cancel execution', {
      error: error.message,
      executionId
    });
    throw error;
  }
}

/**
 * List workflow executions for an entity
 */
async function listExecutionsForEntity(entityType, entityId) {
  try {
    const response = await axios.get(
      `${WORKFLOW_SERVICE_URL}/api/executions`,
      {
        params: {
          entity_type: entityType,
          entity_id: entityId
        }
      }
    );

    return response.data.executions || [];
  } catch (error) {
    logger.error('Failed to list executions', {
      error: error.message,
      entityType,
      entityId
    });
    return [];
  }
}

/**
 * Create workflow template
 */
async function createWorkflowTemplate(template, userId) {
  try {
    const response = await axios.post(
      `${WORKFLOW_SERVICE_URL}/api/workflows`,
      template,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': userId
        }
      }
    );

    logger.info('Workflow template created', {
      workflowId: response.data.workflow.id,
      name: template.name
    });

    return response.data.workflow;
  } catch (error) {
    logger.error('Failed to create workflow template', {
      error: error.message,
      templateName: template.name
    });
    throw error;
  }
}

/**
 * Check if workflow service is available
 */
async function healthCheck() {
  try {
    const response = await axios.get(`${WORKFLOW_SERVICE_URL}/health`, {
      timeout: 5000
    });

    return response.status === 200;
  } catch (error) {
    logger.warn('Workflow service health check failed', {
      error: error.message
    });
    return false;
  }
}

module.exports = {
  TRIGGER_TYPES,

  // Core functions
  executeWorkflow,
  triggerWorkflow,
  getExecutionStatus,
  cancelExecution,
  listExecutionsForEntity,
  createWorkflowTemplate,
  healthCheck,

  // Specific trigger functions
  triggerLowStockWorkflow,
  triggerReorderWorkflow,
  triggerPurchaseApprovalWorkflow,
  triggerPurchaseApprovedWorkflow,
  triggerSalesApprovalWorkflow,
  triggerSalesShippedWorkflow,
  triggerCommentFlaggedWorkflow,
  triggerApprovalWorkflow,
  triggerNotificationWorkflow,
  triggerReconciliationWorkflow
};
