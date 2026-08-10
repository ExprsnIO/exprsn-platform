const express = require('express');
const router = express.Router();
const { requireToken } = require('../middleware/tokenAuth');
const { requireGroupMember } = require('../middleware/groupAuth');
const { sanitizeProposalData } = require('../utils/sanitization');
const governanceService = require('../services/governanceService');
const Joi = require('joi');

/**
 * ═══════════════════════════════════════════════════════════
 * Governance Routes
 * Proposals and voting
 * ═══════════════════════════════════════════════════════════
 */

// Validation schemas
const createProposalSchema = Joi.object({
  groupId: Joi.string().uuid().required(),
  title: Joi.string().min(5).max(255).required(),
  description: Joi.string().required(),
  proposalType: Joi.string().valid('rule-change', 'role-change', 'member-action', 'general', 'other').required(),
  votingMethod: Joi.string().valid('simple-majority', 'supermajority', 'unanimous', 'weighted'),
  quorumRequired: Joi.number().integer().min(1).max(100),
  votingStartsAt: Joi.number().integer(),
  votingEndsAt: Joi.number().integer(),
  votingDuration: Joi.number().integer().min(3600000).max(2592000000), // 1 hour to 30 days
  actionData: Joi.object(),
  metadata: Joi.object()
});

const voteSchema = Joi.object({
  vote: Joi.string().valid('yes', 'no', 'abstain').required(),
  weight: Joi.number().min(0),
  reason: Joi.string().max(1000).allow(null, '')
});

/**
 * POST /api/governance/proposals
 * Create a new proposal
 */
router.post('/proposals',
  requireToken,
  async (req, res, next) => {
    try {
      const { error, value } = createProposalSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      // Sanitize user input to prevent XSS
      const sanitizedData = sanitizeProposalData(value);

      const userId = req.token.data.userId;
      const proposal = await governanceService.createProposal(sanitizedData.groupId, userId, sanitizedData);

      res.status(201).json({
        success: true,
        proposal
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/governance/proposals
 * List proposals (filtered by groupId)
 */
router.get('/proposals',
  requireToken,
  async (req, res, next) => {
    try {
      if (!req.query.groupId) {
        return res.status(400).json({
          error: 'MISSING_PARAMETER',
          message: 'groupId required'
        });
      }

      const filters = {
        status: req.query.status,
        proposalType: req.query.proposalType,
        activeOnly: req.query.activeOnly === 'true',
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };

      const result = await governanceService.listProposals(req.query.groupId, filters);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/governance/proposals/:id
 * Get proposal details
 */
router.get('/proposals/:id',
  requireToken,
  async (req, res, next) => {
    try {
      const proposal = await governanceService.getProposal(req.params.id);

      res.json({
        success: true,
        proposal
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/governance/proposals/:id/vote
 * Cast a vote on a proposal
 */
router.post('/proposals/:id/vote',
  requireToken,
  async (req, res, next) => {
    try {
      const { error, value } = voteSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const userId = req.token.data.userId;
      const vote = await governanceService.castVote(req.params.id, userId, value);

      res.status(201).json({
        success: true,
        vote,
        message: 'Vote recorded successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/governance/proposals/:id/results
 * Get proposal voting results
 */
router.get('/proposals/:id/results',
  requireToken,
  async (req, res, next) => {
    try {
      const results = await governanceService.getResults(req.params.id);

      res.json({
        success: true,
        results
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/governance/proposals/:id/votes
 * Get votes for a proposal
 */
router.get('/proposals/:id/votes',
  requireToken,
  async (req, res, next) => {
    try {
      const filters = {
        vote: req.query.vote,
        limit: parseInt(req.query.limit) || 100,
        offset: parseInt(req.query.offset) || 0
      };

      const result = await governanceService.getVotes(req.params.id, filters);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/governance/proposals/:id/close
 * Manually close a proposal (admin only)
 */
router.post('/proposals/:id/close',
  requireToken,
  async (req, res, next) => {
    try {
      const proposal = await governanceService.closeProposal(req.params.id);

      res.json({
        success: true,
        proposal,
        message: 'Proposal closed successfully'
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
