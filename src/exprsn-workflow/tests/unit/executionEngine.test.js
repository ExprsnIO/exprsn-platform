const executionEngine = require('../../src/services/executionEngine');
const { WorkflowExecution, Workflow } = require('../../src/models');
const axios = require('axios');

jest.mock('../../src/models');
jest.mock('axios');
jest.mock('vm2');

describe('Execution Engine', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('executeApproval', () => {
    it('should create approval request and pause workflow', async () => {
      const step = {
        step_id: 'approval_1',
        name: 'Manager Approval',
        type: 'approval',
        config: {
          approvers: ['manager@example.com'],
          title: 'Please approve',
          description: 'Review this request',
          timeoutMinutes: 1440
        }
      };

      const context = {
        pendingApprovals: {}
      };

      const execution = {
        id: 'exec-1',
        update: jest.fn().mockResolvedValue(true)
      };

      const result = await executionEngine.executeApproval(step, context, execution);

      expect(result.success).toBe(false);
      expect(result.error).toBe('PENDING_APPROVAL');
      expect(result.shouldPause).toBe(true);
      expect(context.pendingApprovals['approval_1']).toBeDefined();
      expect(context.pendingApprovals['approval_1'].status).toBe('pending');
      expect(execution.update).toHaveBeenCalledWith({
        status: 'waiting_approval',
        context
      });
    });

    it('should resolve approvers from context', async () => {
      const step = {
        step_id: 'approval_1',
        config: {
          approvers: '{{input.managers}}',
          title: 'Approval'
        }
      };

      const context = {
        input: {
          managers: ['user1@example.com', 'user2@example.com']
        },
        pendingApprovals: {}
      };

      const execution = {
        id: 'exec-1',
        update: jest.fn()
      };

      await executionEngine.executeApproval(step, context, execution);

      expect(context.pendingApprovals['approval_1'].approvers).toEqual([
        'user1@example.com',
        'user2@example.com'
      ]);
    });
  });

  describe('executeNotification', () => {
    it('should send notification to Herald service', async () => {
      const step = {
        step_id: 'notify_1',
        name: 'Send Email',
        type: 'notification',
        config: {
          type: 'email',
          recipients: 'user@example.com',
          subject: 'Test Subject',
          message: 'Test Message'
        }
      };

      const context = {};
      const execution = {
        id: 'exec-1',
        workflow_id: 'workflow-1'
      };

      axios.post = jest.fn().mockResolvedValue({
        data: { id: 'notif-123', status: 'sent' }
      });

      const result = await executionEngine.executeNotification(step, context, execution);

      expect(result.success).toBe(true);
      expect(result.data.notificationId).toBe('notif-123');
      expect(axios.post).toHaveBeenCalledWith(
        expect.stringContaining('/api/notifications/send'),
        expect.objectContaining({
          type: 'email',
          recipients: 'user@example.com',
          subject: 'Test Subject',
          message: 'Test Message'
        }),
        expect.any(Object)
      );
    });

    it('should handle Herald service errors', async () => {
      const step = {
        step_id: 'notify_1',
        config: {
          type: 'email',
          recipients: 'user@example.com'
        }
      };

      axios.post = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      const result = await executionEngine.executeNotification(step, {}, { id: '1' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Service unavailable');
    });

    it('should resolve template variables', async () => {
      const step = {
        step_id: 'notify_1',
        config: {
          type: 'email',
          recipients: '{{input.userEmail}}',
          subject: 'Welcome {{input.userName}}',
          message: 'Hello {{input.userName}}'
        }
      };

      const context = {
        input: {
          userEmail: 'john@example.com',
          userName: 'John'
        }
      };

      axios.post = jest.fn().mockResolvedValue({ data: { id: '1' } });

      await executionEngine.executeNotification(step, context, { id: '1' });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          recipients: 'john@example.com',
          subject: 'Welcome John',
          message: 'Hello John'
        }),
        expect.any(Object)
      );
    });
  });

  describe('approveStep', () => {
    it('should approve step and resume workflow', async () => {
      const execution = {
        id: 'exec-1',
        status: 'waiting_approval',
        context: {
          pendingApprovals: {
            'step-1': {
              stepId: 'step-1',
              status: 'pending',
              approvers: ['user-1']
            }
          }
        },
        update: jest.fn().mockResolvedValue(true)
      };

      WorkflowExecution.findByPk = jest.fn().mockResolvedValue(execution);

      // Mock executeWorkflow to avoid actual execution
      executionEngine.executeWorkflow = jest.fn().mockResolvedValue({ success: true });

      const result = await executionEngine.approveStep('exec-1', 'step-1', 'user-1', 'Approved!');

      expect(result.success).toBe(true);
      expect(execution.context.pendingApprovals['step-1'].status).toBe('approved');
      expect(execution.context.pendingApprovals['step-1'].approvedBy).toBe('user-1');
      expect(execution.context.pendingApprovals['step-1'].comments).toBe('Approved!');
    });

    it('should reject approval from unauthorized user', async () => {
      const execution = {
        context: {
          pendingApprovals: {
            'step-1': {
              approvers: ['user-1'],
              status: 'pending'
            }
          }
        }
      };

      WorkflowExecution.findByPk = jest.fn().mockResolvedValue(execution);

      await expect(
        executionEngine.approveStep('exec-1', 'step-1', 'user-2', 'Approved')
      ).rejects.toThrow('User not authorized to approve this step');
    });

    it('should reject already approved step', async () => {
      const execution = {
        context: {
          pendingApprovals: {
            'step-1': {
              status: 'approved',
              approvers: ['user-1']
            }
          }
        }
      };

      WorkflowExecution.findByPk = jest.fn().mockResolvedValue(execution);

      await expect(
        executionEngine.approveStep('exec-1', 'step-1', 'user-1', 'Approved')
      ).rejects.toThrow('Approval already processed');
    });
  });

  describe('rejectStep', () => {
    it('should reject step and fail workflow', async () => {
      const execution = {
        id: 'exec-1',
        context: {
          pendingApprovals: {
            'step-1': {
              stepId: 'step-1',
              status: 'pending',
              approvers: ['user-1']
            }
          }
        },
        update: jest.fn().mockResolvedValue(true)
      };

      WorkflowExecution.findByPk = jest.fn().mockResolvedValue(execution);

      const result = await executionEngine.rejectStep('exec-1', 'step-1', 'user-1', 'Not approved');

      expect(result.success).toBe(true);
      expect(execution.context.pendingApprovals['step-1'].status).toBe('rejected');
      expect(execution.context.pendingApprovals['step-1'].rejectedBy).toBe('user-1');
      expect(execution.context.pendingApprovals['step-1'].reason).toBe('Not approved');
      expect(execution.update).toHaveBeenCalledWith({
        status: 'failed',
        context: execution.context,
        error: 'Approval rejected: Not approved'
      });
    });

    it('should reject from unauthorized user', async () => {
      const execution = {
        context: {
          pendingApprovals: {
            'step-1': {
              approvers: ['user-1'],
              status: 'pending'
            }
          }
        }
      };

      WorkflowExecution.findByPk = jest.fn().mockResolvedValue(execution);

      await expect(
        executionEngine.rejectStep('exec-1', 'step-1', 'user-2', 'Rejected')
      ).rejects.toThrow('User not authorized to reject this step');
    });
  });

  describe('executeAction', () => {
    it('should execute basic action step', async () => {
      const step = {
        step_id: 'action_1',
        type: 'action',
        config: {
          service: 'test-service',
          operation: 'create',
          params: { key: 'value' }
        }
      };

      // Mock action execution
      const result = await executionEngine.executeAction(step, {}, {});

      expect(result).toBeDefined();
      // Note: Actual implementation would call external service
    });
  });

  describe('executeCondition', () => {
    it('should evaluate condition and return boolean result', async () => {
      const step = {
        step_id: 'condition_1',
        type: 'condition',
        config: {
          expression: 'input.age >= 18'
        }
      };

      const context = {
        input: { age: 25 }
      };

      const result = await executionEngine.executeCondition(step, context, {});

      expect(result.success).toBe(true);
      expect(result.data.result).toBe(true);
    });

    it('should handle false conditions', async () => {
      const step = {
        step_id: 'condition_1',
        config: {
          expression: 'input.age >= 18'
        }
      };

      const context = {
        input: { age: 15 }
      };

      const result = await executionEngine.executeCondition(step, context, {});

      expect(result.data.result).toBe(false);
    });
  });
});
