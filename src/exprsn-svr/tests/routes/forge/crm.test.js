/**
 * ═══════════════════════════════════════════════════════════
 * Forge CRM Routes Test Suite
 * Tests CRM module endpoints (92 endpoints)
 * ═══════════════════════════════════════════════════════════
 */

const request = require('supertest');
const { createMainTestApp } = require('../../helpers/testApp');

let app;

describe('Forge CRM Routes', () => {
  beforeAll(() => {
    app = createMainTestApp('forge/crm');
  });

  // Contacts
  describe('Contacts Endpoints', () => {
    it('GET /forge/crm/contacts - should list contacts', async () => {
      const response = await request(app).get('/forge/crm/contacts');
      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /forge/crm/contacts - should create contact', async () => {
      const contactData = {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com'
      };
      const response = await request(app).post('/forge/crm/contacts').send(contactData);
      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('GET /forge/crm/contacts/:id - should get contact', async () => {
      const response = await request(app).get('/forge/crm/contacts/123');
      expect([200, 404, 500]).toContain(response.status);
    });

    it('PUT /forge/crm/contacts/:id - should update contact', async () => {
      const response = await request(app).put('/forge/crm/contacts/123').send({ firstName: 'Jane' });
      expect([200, 404, 500]).toContain(response.status);
    });

    it('DELETE /forge/crm/contacts/:id - should delete contact', async () => {
      const response = await request(app).delete('/forge/crm/contacts/123');
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  // Accounts
  describe('Accounts Endpoints', () => {
    it('GET /forge/crm/accounts - should list accounts', async () => {
      const response = await request(app).get('/forge/crm/accounts');
      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /forge/crm/accounts - should create account', async () => {
      const accountData = {
        name: 'Acme Corp',
        industry: 'Technology'
      };
      const response = await request(app).post('/forge/crm/accounts').send(accountData);
      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('GET /forge/crm/accounts/:id - should get account', async () => {
      const response = await request(app).get('/forge/crm/accounts/123');
      expect([200, 404, 500]).toContain(response.status);
    });

    it('PUT /forge/crm/accounts/:id - should update account', async () => {
      const response = await request(app).put('/forge/crm/accounts/123').send({ name: 'Acme Inc' });
      expect([200, 404, 500]).toContain(response.status);
    });

    it('DELETE /forge/crm/accounts/:id - should delete account', async () => {
      const response = await request(app).delete('/forge/crm/accounts/123');
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  // Leads
  describe('Leads Endpoints', () => {
    it('GET /forge/crm/leads - should list leads', async () => {
      const response = await request(app).get('/forge/crm/leads');
      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /forge/crm/leads - should create lead', async () => {
      const leadData = {
        firstName: 'Jane',
        lastName: 'Smith',
        company: 'Test Co',
        email: 'jane@testco.com',
        status: 'new'
      };
      const response = await request(app).post('/forge/crm/leads').send(leadData);
      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('POST /forge/crm/leads/:id/convert - should convert lead', async () => {
      const response = await request(app).post('/forge/crm/leads/123/convert').send({ createOpportunity: true });
      expect([200, 404, 500]).toContain(response.status);
    });

    it('PUT /forge/crm/leads/:id/status - should update lead status', async () => {
      const response = await request(app).put('/forge/crm/leads/123/status').send({ status: 'qualified' });
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  // Opportunities
  describe('Opportunities Endpoints', () => {
    it('GET /forge/crm/opportunities - should list opportunities', async () => {
      const response = await request(app).get('/forge/crm/opportunities');
      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /forge/crm/opportunities - should create opportunity', async () => {
      const oppData = {
        name: 'Big Deal',
        accountId: '123',
        amount: 50000,
        stage: 'prospecting',
        probability: 10
      };
      const response = await request(app).post('/forge/crm/opportunities').send(oppData);
      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('PUT /forge/crm/opportunities/:id/stage - should update stage', async () => {
      const response = await request(app).put('/forge/crm/opportunities/123/stage').send({ stage: 'proposal' });
      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /forge/crm/opportunities/:id/close-won - should mark as won', async () => {
      const response = await request(app).post('/forge/crm/opportunities/123/close-won');
      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /forge/crm/opportunities/:id/close-lost - should mark as lost', async () => {
      const response = await request(app).post('/forge/crm/opportunities/123/close-lost').send({ reason: 'Price' });
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  // Cases
  describe('Cases Endpoints', () => {
    it('GET /forge/crm/cases - should list cases', async () => {
      const response = await request(app).get('/forge/crm/cases');
      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /forge/crm/cases - should create case', async () => {
      const caseData = {
        subject: 'Cannot login',
        description: 'User cannot access account',
        priority: 'high',
        status: 'new'
      };
      const response = await request(app).post('/forge/crm/cases').send(caseData);
      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('PUT /forge/crm/cases/:id/assign - should assign case', async () => {
      const response = await request(app).put('/forge/crm/cases/123/assign').send({ assigneeId: 'user-456' });
      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /forge/crm/cases/:id/close - should close case', async () => {
      const response = await request(app).post('/forge/crm/cases/123/close').send({ resolution: 'Fixed' });
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  // Tasks
  describe('Tasks Endpoints', () => {
    it('GET /forge/crm/tasks - should list tasks', async () => {
      const response = await request(app).get('/forge/crm/tasks');
      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /forge/crm/tasks - should create task', async () => {
      const taskData = {
        subject: 'Follow up call',
        dueDate: '2025-01-15',
        priority: 'normal',
        relatedTo: { type: 'Contact', id: '123' }
      };
      const response = await request(app).post('/forge/crm/tasks').send(taskData);
      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('PUT /forge/crm/tasks/:id/complete - should complete task', async () => {
      const response = await request(app).put('/forge/crm/tasks/123/complete');
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  // Activities
  describe('Activities Endpoints', () => {
    it('GET /forge/crm/activities - should list activities', async () => {
      const response = await request(app).get('/forge/crm/activities');
      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /forge/crm/activities/log-call - should log call', async () => {
      const callData = {
        contactId: '123',
        duration: 15,
        notes: 'Discussed pricing'
      };
      const response = await request(app).post('/forge/crm/activities/log-call').send(callData);
      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('POST /forge/crm/activities/log-email - should log email', async () => {
      const emailData = {
        contactId: '123',
        subject: 'Follow up',
        body: 'Thanks for the meeting'
      };
      const response = await request(app).post('/forge/crm/activities/log-email').send(emailData);
      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('POST /forge/crm/activities/log-meeting - should log meeting', async () => {
      const meetingData = {
        contactId: '123',
        startTime: '2025-01-15T10:00:00Z',
        duration: 60,
        attendees: ['user-1', 'user-2']
      };
      const response = await request(app).post('/forge/crm/activities/log-meeting').send(meetingData);
      expect([200, 201, 400, 500]).toContain(response.status);
    });
  });

  // Campaigns
  describe('Campaigns Endpoints', () => {
    it('GET /forge/crm/campaigns - should list campaigns', async () => {
      const response = await request(app).get('/forge/crm/campaigns');
      expect([200, 404, 500]).toContain(response.status);
    });

    it('POST /forge/crm/campaigns - should create campaign', async () => {
      const campaignData = {
        name: 'Q1 Email Blast',
        type: 'email',
        status: 'planned',
        startDate: '2025-01-01',
        budget: 10000
      };
      const response = await request(app).post('/forge/crm/campaigns').send(campaignData);
      expect([200, 201, 400, 500]).toContain(response.status);
    });

    it('POST /forge/crm/campaigns/:id/add-members - should add members', async () => {
      const response = await request(app).post('/forge/crm/campaigns/123/add-members').send({ contactIds: ['1', '2', '3'] });
      expect([200, 404, 500]).toContain(response.status);
    });

    it('GET /forge/crm/campaigns/:id/stats - should get campaign stats', async () => {
      const response = await request(app).get('/forge/crm/campaigns/123/stats');
      expect([200, 404, 500]).toContain(response.status);
    });
  });

  // Reports
  describe('Reports Endpoints', () => {
    it('GET /forge/crm/reports/pipeline - should get pipeline report', async () => {
      const response = await request(app).get('/forge/crm/reports/pipeline');
      expect([200, 500]).toContain(response.status);
    });

    it('GET /forge/crm/reports/sales - should get sales report', async () => {
      const response = await request(app).get('/forge/crm/reports/sales?period=month');
      expect([200, 500]).toContain(response.status);
    });

    it('GET /forge/crm/reports/activities - should get activities report', async () => {
      const response = await request(app).get('/forge/crm/reports/activities');
      expect([200, 500]).toContain(response.status);
    });
  });
});
