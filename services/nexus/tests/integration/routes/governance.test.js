const request = require('supertest');
const express = require('express');
const governanceRouter = require('../../../src/routes/governance');

// Mock middleware
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

// Mock services
jest.mock('../../../src/services/governanceService');

const governanceService = require('../../../src/services/governanceService');

describe('Governance Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/groups/:groupId/governance', governanceRouter);

    // Error handler
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

  describe('POST /api/groups/:groupId/governance/proposals', () => {
    it('should create proposal with valid input', async () => {
      const mockProposal = {
        id: 'proposal-123',
        groupId: 'group-123',
        title: 'Update Group Rules',
        description: 'Proposal to update community guidelines',
        type: 'rule_change',
        proposerId: 'test-user-123',
        status: 'active',
        votesFor: 0,
        votesAgainst: 0,
        votesAbstain: 0
      };

      governanceService.createProposal = jest.fn().mockResolvedValue(mockProposal);

      const response = await request(app)
        .post('/api/groups/group-123/governance/proposals')
        .send({
          title: 'Update Group Rules',
          description: 'Proposal to update community guidelines',
          type: 'rule_change',
          votingPeriod: 7
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.proposal.title).toBe('Update Group Rules');
      expect(governanceService.createProposal).toHaveBeenCalled();
    });

    it('should sanitize HTML in proposal description', async () => {
      const mockProposal = {
        id: 'proposal-123',
        title: 'Test Proposal',
        description: 'Safe content'
      };

      governanceService.createProposal = jest.fn().mockResolvedValue(mockProposal);

      await request(app)
        .post('/api/groups/group-123/governance/proposals')
        .send({
          title: 'Test Proposal',
          description: '<script>alert("xss")</script>Safe content',
          type: 'rule_change'
        })
        .expect(201);

      const sanitizedData = governanceService.createProposal.mock.calls[0][2];
      expect(sanitizedData.description).not.toContain('script');
      expect(sanitizedData.description).not.toContain('alert');
    });

    it('should reject invalid proposal type', async () => {
      const response = await request(app)
        .post('/api/groups/group-123/governance/proposals')
        .send({
          title: 'Test Proposal',
          description: 'Test',
          type: 'invalid-type'
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/groups/group-123/governance/proposals')
        .send({
          description: 'Missing title and type'
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should allow safe HTML formatting in rationale', async () => {
      const mockProposal = {
        id: 'proposal-123',
        rationale: '<b>Important</b> reasons'
      };

      governanceService.createProposal = jest.fn().mockResolvedValue(mockProposal);

      await request(app)
        .post('/api/groups/group-123/governance/proposals')
        .send({
          title: 'Test Proposal',
          description: 'Test description',
          rationale: '<b>Important</b> <i>reasons</i>',
          type: 'rule_change'
        })
        .expect(201);

      const sanitizedData = governanceService.createProposal.mock.calls[0][2];
      expect(sanitizedData.rationale).toContain('<b>Important</b>');
      expect(sanitizedData.rationale).toContain('<i>reasons</i>');
    });
  });

  describe('POST /api/groups/:groupId/governance/proposals/:proposalId/vote', () => {
    it('should cast vote with valid input', async () => {
      const mockVote = {
        id: 'vote-123',
        proposalId: 'proposal-123',
        userId: 'test-user-123',
        vote: 'for',
        weight: 1
      };

      governanceService.castVote = jest.fn().mockResolvedValue(mockVote);

      const response = await request(app)
        .post('/api/groups/group-123/governance/proposals/proposal-123/vote')
        .send({
          vote: 'for',
          comment: 'I support this proposal'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.vote.vote).toBe('for');
    });

    it('should reject invalid vote type', async () => {
      const response = await request(app)
        .post('/api/groups/group-123/governance/proposals/proposal-123/vote')
        .send({
          vote: 'invalid-vote'
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should sanitize vote comment', async () => {
      const mockVote = {
        id: 'vote-123',
        comment: 'I support this'
      };

      governanceService.castVote = jest.fn().mockResolvedValue(mockVote);

      await request(app)
        .post('/api/groups/group-123/governance/proposals/proposal-123/vote')
        .send({
          vote: 'for',
          comment: '<script>alert("xss")</script>I support this'
        })
        .expect(200);

      const sanitizedData = governanceService.castVote.mock.calls[0][3];
      expect(sanitizedData.comment).not.toContain('script');
    });

    it('should allow voting without comment', async () => {
      const mockVote = {
        id: 'vote-123',
        vote: 'against'
      };

      governanceService.castVote = jest.fn().mockResolvedValue(mockVote);

      await request(app)
        .post('/api/groups/group-123/governance/proposals/proposal-123/vote')
        .send({
          vote: 'against'
        })
        .expect(200);

      expect(governanceService.castVote).toHaveBeenCalled();
    });
  });

  describe('POST /api/groups/:groupId/governance/proposals/:proposalId/execute', () => {
    it('should execute approved proposal', async () => {
      const mockResult = {
        proposalId: 'proposal-123',
        status: 'executed',
        executedAt: Date.now()
      };

      governanceService.executeProposal = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/groups/group-123/governance/proposals/proposal-123/execute')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.result.status).toBe('executed');
    });

    it('should handle execution errors', async () => {
      governanceService.executeProposal = jest.fn().mockRejectedValue(
        new Error('QUORUM_NOT_MET')
      );

      const response = await request(app)
        .post('/api/groups/group-123/governance/proposals/proposal-123/execute')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/groups/:groupId/governance/proposals/:proposalId', () => {
    it('should update proposal with valid input', async () => {
      const mockProposal = {
        id: 'proposal-123',
        title: 'Updated Proposal',
        description: 'Updated description'
      };

      governanceService.updateProposal = jest.fn().mockResolvedValue(mockProposal);

      const response = await request(app)
        .put('/api/groups/group-123/governance/proposals/proposal-123')
        .send({
          description: 'Updated description'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.proposal.description).toBe('Updated description');
    });

    it('should sanitize updated description', async () => {
      const mockProposal = {
        id: 'proposal-123',
        description: 'Safe content'
      };

      governanceService.updateProposal = jest.fn().mockResolvedValue(mockProposal);

      await request(app)
        .put('/api/groups/group-123/governance/proposals/proposal-123')
        .send({
          description: '<b>Updated</b><script>bad()</script>'
        })
        .expect(200);

      const sanitizedData = governanceService.updateProposal.mock.calls[0][2];
      expect(sanitizedData.description).toContain('<b>Updated</b>');
      expect(sanitizedData.description).not.toContain('script');
    });
  });

  describe('DELETE /api/groups/:groupId/governance/proposals/:proposalId', () => {
    it('should delete proposal', async () => {
      governanceService.deleteProposal = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/groups/group-123/governance/proposals/proposal-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(governanceService.deleteProposal).toHaveBeenCalledWith(
        'proposal-123',
        'test-user-123'
      );
    });
  });

  describe('Input Sanitization', () => {
    it('should remove XSS attempts from proposal title', async () => {
      const mockProposal = {
        id: 'proposal-123',
        title: 'Test Proposal'
      };

      governanceService.createProposal = jest.fn().mockResolvedValue(mockProposal);

      await request(app)
        .post('/api/groups/group-123/governance/proposals')
        .send({
          title: '<img src=x onerror="alert(1)">Test Proposal',
          description: 'Test',
          type: 'rule_change'
        })
        .expect(201);

      const sanitizedData = governanceService.createProposal.mock.calls[0][2];
      expect(sanitizedData.title).not.toContain('onerror');
      expect(sanitizedData.title).not.toContain('<img');
    });

    it('should preserve formatting in proposal descriptions', async () => {
      const mockProposal = {
        id: 'proposal-123',
        description: '<p>Formatted</p> content'
      };

      governanceService.createProposal = jest.fn().mockResolvedValue(mockProposal);

      await request(app)
        .post('/api/groups/group-123/governance/proposals')
        .send({
          title: 'Test Proposal',
          description: '<p>Formatted</p> <ul><li>content</li></ul>',
          type: 'rule_change'
        })
        .expect(201);

      const sanitizedData = governanceService.createProposal.mock.calls[0][2];
      expect(sanitizedData.description).toContain('<p>Formatted</p>');
      expect(sanitizedData.description).toContain('<ul>');
      expect(sanitizedData.description).toContain('<li>content</li>');
    });
  });
});
