const request = require('supertest');
const express = require('express');
const governanceRouter = require('../../../src/routes/governance');

// Mock middleware — real tokenAuth is exercised separately in authWiring.test.js.
jest.mock('../../../src/middleware/tokenAuth', () => ({
  requireToken: () => (req, res, next) => {
    req.user = { id: 'test-user-123' };
    req.token = { data: { userId: 'test-user-123' } };
    next();
  }
}));

jest.mock('../../../src/middleware/groupAuth', () => ({
  validateGroup: (req, res, next) => next(),
  requireGroupMember: (req, res, next) => next()
}));

// Mock service layer
jest.mock('../../../src/services/governanceService');

const governanceService = require('../../../src/services/governanceService');

// A syntactically valid UUID for the groupId body field (Joi .uuid()).
const GROUP_ID = '11111111-1111-4111-8111-111111111111';
const PROPOSAL_ID = '22222222-2222-4222-8222-222222222222';

describe('Governance Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    // Mounted exactly as the gateway mounts it: flat under /api/governance.
    app.use('/api/governance', governanceRouter);

    // Error handler mirrors the platform contract enough for assertions.
    app.use((err, req, res, next) => {
      res.status(err.status || 500).json({
        success: false,
        error: err.message
      });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/governance/proposals', () => {
    it('creates a proposal with valid input', async () => {
      governanceService.createProposal = jest.fn().mockResolvedValue({
        id: PROPOSAL_ID,
        groupId: GROUP_ID,
        title: 'Update Group Rules',
        proposalType: 'rule-change',
        status: 'active'
      });

      const response = await request(app)
        .post('/api/governance/proposals')
        .send({
          groupId: GROUP_ID,
          title: 'Update Group Rules',
          description: 'Proposal to update community guidelines',
          proposalType: 'rule-change',
          votingDuration: 7 * 24 * 60 * 60 * 1000
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.proposal.title).toBe('Update Group Rules');
      // groupId, proposerId, sanitized data are forwarded to the service.
      expect(governanceService.createProposal).toHaveBeenCalledWith(
        GROUP_ID,
        'test-user-123',
        expect.objectContaining({ proposalType: 'rule-change' })
      );
    });

    it('rejects an invalid proposalType', async () => {
      const response = await request(app)
        .post('/api/governance/proposals')
        .send({
          groupId: GROUP_ID,
          title: 'Test Proposal',
          description: 'Test',
          proposalType: 'invalid-type'
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('rejects missing required fields', async () => {
      const response = await request(app)
        .post('/api/governance/proposals')
        .send({ description: 'Missing groupId, title and type' })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('strips XSS from the title and preserves safe formatting in the description', async () => {
      governanceService.createProposal = jest.fn().mockResolvedValue({ id: PROPOSAL_ID });

      await request(app)
        .post('/api/governance/proposals')
        .send({
          groupId: GROUP_ID,
          title: '<img src=x onerror="alert(1)">Cleaned Title',
          description: '<p>Formatted</p> <ul><li>item</li></ul><script>bad()</script>',
          proposalType: 'rule-change'
        })
        .expect(201);

      const sanitized = governanceService.createProposal.mock.calls[0][2];
      expect(sanitized.title).not.toContain('onerror');
      expect(sanitized.title).not.toContain('<img');
      expect(sanitized.description).toContain('<p>Formatted</p>');
      expect(sanitized.description).toContain('<li>item</li>');
      expect(sanitized.description).not.toContain('script');
    });
  });

  describe('POST /api/governance/proposals/:id/vote', () => {
    it('casts a vote with valid input', async () => {
      governanceService.castVote = jest.fn().mockResolvedValue({
        id: 'vote-1',
        proposalId: PROPOSAL_ID,
        vote: 'yes'
      });

      const response = await request(app)
        .post(`/api/governance/proposals/${PROPOSAL_ID}/vote`)
        .send({ vote: 'yes', reason: 'I support this' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.vote.vote).toBe('yes');
      expect(governanceService.castVote).toHaveBeenCalledWith(
        PROPOSAL_ID,
        'test-user-123',
        expect.objectContaining({ vote: 'yes' })
      );
    });

    it('rejects an out-of-enum vote value', async () => {
      const response = await request(app)
        .post(`/api/governance/proposals/${PROPOSAL_ID}/vote`)
        .send({ vote: 'for' })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('allows voting without a reason', async () => {
      governanceService.castVote = jest.fn().mockResolvedValue({ id: 'vote-1', vote: 'no' });

      await request(app)
        .post(`/api/governance/proposals/${PROPOSAL_ID}/vote`)
        .send({ vote: 'no' })
        .expect(201);

      expect(governanceService.castVote).toHaveBeenCalled();
    });
  });

  describe('PUT /api/governance/proposals/:id', () => {
    it('updates a proposal and forwards sanitized fields', async () => {
      governanceService.updateProposal = jest.fn().mockResolvedValue({
        id: PROPOSAL_ID,
        description: 'Updated description'
      });

      const response = await request(app)
        .put(`/api/governance/proposals/${PROPOSAL_ID}`)
        .send({ description: '<b>Updated</b><script>bad()</script>' })
        .expect(200);

      expect(response.body.success).toBe(true);
      const [id, userId, patch] = governanceService.updateProposal.mock.calls[0];
      expect(id).toBe(PROPOSAL_ID);
      expect(userId).toBe('test-user-123');
      expect(patch.description).toContain('<b>Updated</b>');
      expect(patch.description).not.toContain('script');
    });

    it('rejects an empty update body', async () => {
      const response = await request(app)
        .put(`/api/governance/proposals/${PROPOSAL_ID}`)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/governance/proposals/:id', () => {
    it('cancels a proposal scoped to the requesting user', async () => {
      governanceService.deleteProposal = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .delete(`/api/governance/proposals/${PROPOSAL_ID}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(governanceService.deleteProposal).toHaveBeenCalledWith(PROPOSAL_ID, 'test-user-123');
    });
  });

  describe('POST /api/governance/proposals/:id/execute', () => {
    it('executes an approved proposal', async () => {
      governanceService.executeProposal = jest.fn().mockResolvedValue({
        proposalId: PROPOSAL_ID,
        status: 'executed',
        executedAt: 1700000000000
      });

      const response = await request(app)
        .post(`/api/governance/proposals/${PROPOSAL_ID}/execute`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.status).toBe('executed');
    });

    it('surfaces execution errors', async () => {
      governanceService.executeProposal = jest.fn().mockRejectedValue(new Error('PROPOSAL_NOT_PASSED'));

      const response = await request(app)
        .post(`/api/governance/proposals/${PROPOSAL_ID}/execute`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('PROPOSAL_NOT_PASSED');
    });
  });
});
