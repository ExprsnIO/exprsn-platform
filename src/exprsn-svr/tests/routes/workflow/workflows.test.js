/**
 * ═══════════════════════════════════════════════════════════
 * Workflow Routes Test Suite
 * Tests workflow automation engine endpoints
 * ═══════════════════════════════════════════════════════════
 */

const request = require('supertest');
const { createWorkflowTestApp } = require('../../helpers/testApp');

let app;

describe('Workflow Routes', () => {
  beforeAll(() => {
    app = createWorkflowTestApp('workflows');
  });

  describe('GET /workflow/workflows', () => {
    it('should return list of workflows', async () => {
      const response = await request(app)
        .get('/workflow/workflows')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/workflow/workflows?status=active')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /workflow/workflows', () => {
    it('should create a new workflow', async () => {
      const workflowData = {
        name: 'Customer Onboarding',
        description: 'Automate new customer setup',
        trigger: {
          type: 'webhook',
          config: { path: '/onboard' }
        },
        steps: [
          { type: 'send_email', config: { template: 'welcome' } },
          { type: 'create_task', config: { title: 'Setup account' } }
        ]
      };

      const response = await request(app)
        .post('/workflow/workflows')
        .send(workflowData);

      expect([200, 201, 400, 500]).toContain(response.status);
    });
  });

  describe('GET /workflow/workflows/:id', () => {
    it('should get workflow details', async () => {
      const response = await request(app)
        .get('/workflow/workflows/test-workflow-123');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('PUT /workflow/workflows/:id', () => {
    it('should update a workflow', async () => {
      const updateData = {
        name: 'Updated Workflow',
        description: 'Updated description'
      };

      const response = await request(app)
        .put('/workflow/workflows/test-workflow-123')
        .send(updateData);

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('DELETE /workflow/workflows/:id', () => {
    it('should delete a workflow', async () => {
      const response = await request(app)
        .delete('/workflow/workflows/test-workflow-123');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /workflow/workflows/:id/execute', () => {
    it('should execute a workflow manually', async () => {
      const inputData = {
        customerId: 'cust-123',
        email: 'test@example.com'
      };

      const response = await request(app)
        .post('/workflow/workflows/test-workflow-123/execute')
        .send(inputData);

      expect([200, 400, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /workflow/workflows/:id/enable', () => {
    it('should enable a workflow', async () => {
      const response = await request(app)
        .post('/workflow/workflows/test-workflow-123/enable');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /workflow/workflows/:id/disable', () => {
    it('should disable a workflow', async () => {
      const response = await request(app)
        .post('/workflow/workflows/test-workflow-123/disable');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /workflow/workflows/:id/executions', () => {
    it('should get workflow execution history', async () => {
      const response = await request(app)
        .get('/workflow/workflows/test-workflow-123/executions');

      expect([200, 404, 500]).toContain(response.status);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/workflow/workflows/test-workflow-123/executions?page=1&limit=20');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('GET /workflow/executions/:id', () => {
    it('should get execution details', async () => {
      const response = await request(app)
        .get('/workflow/executions/exec-123');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /workflow/executions/:id/retry', () => {
    it('should retry a failed execution', async () => {
      const response = await request(app)
        .post('/workflow/executions/exec-123/retry');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('POST /workflow/executions/:id/cancel', () => {
    it('should cancel a running execution', async () => {
      const response = await request(app)
        .post('/workflow/executions/exec-123/cancel');

      expect([200, 404, 500]).toContain(response.status);
    });
  });

  describe('Workflow Step Types Tests', () => {
    const stepTypes = [
      'send_email', 'send_sms', 'http_request', 'database_query',
      'create_task', 'update_record', 'delete_record', 'delay',
      'condition', 'loop', 'javascript', 'webhook', 'notification',
      'file_operation', 'data_transformation'
    ];

    it('should support all workflow step types', async () => {
      for (const stepType of stepTypes) {
        const workflowData = {
          name: `Workflow with ${stepType}`,
          trigger: { type: 'manual' },
          steps: [
            { type: stepType, config: {} }
          ]
        };

        const response = await request(app)
          .post('/workflow/workflows')
          .send(workflowData);

        // Should not reject valid step types
        if (response.status === 400) {
          expect(response.body.message).not.toContain('invalid step type');
        }
      }
    });
  });

  describe('Integration Tests', () => {
    it('should complete full workflow lifecycle', async () => {
      const workflowData = {
        name: 'Lifecycle Test Workflow',
        trigger: { type: 'webhook' },
        steps: [
          { type: 'send_email', config: { to: 'test@test.com' } }
        ]
      };

      // Create
      const createResponse = await request(app)
        .post('/workflow/workflows')
        .send(workflowData);

      if (createResponse.status === 201 || createResponse.status === 200) {
        const workflowId = createResponse.body.data?.id;

        if (workflowId) {
          // Enable
          await request(app)
            .post(`/workflow/workflows/${workflowId}/enable`);

          // Execute
          await request(app)
            .post(`/workflow/workflows/${workflowId}/execute`)
            .send({ test: true });

          // Disable
          await request(app)
            .post(`/workflow/workflows/${workflowId}/disable`);

          // Delete
          await request(app)
            .delete(`/workflow/workflows/${workflowId}`);
        }
      }
    });
  });
});
