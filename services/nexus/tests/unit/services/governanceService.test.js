const governanceService = require('../../../src/services/governanceService');
const Proposal = require('../../../src/models/Proposal');

// Mock the model used by the methods under test.
jest.mock('../../../src/models/Proposal');

// Mock Redis (cache invalidation is fire-and-forget here).
jest.mock('../../../src/config/redis', () => ({
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK'),
  hmset: jest.fn().mockResolvedValue('OK')
}));

const PROPOSAL_ID = 'proposal-1';
const OWNER = 'user-owner';
const OTHER = 'user-other';

// Build a fake proposal whose .update() mutates the instance, like Sequelize.
function fakeProposal(overrides = {}) {
  const proposal = {
    id: PROPOSAL_ID,
    groupId: 'group-1',
    proposerId: OWNER,
    title: 'Original',
    description: 'Original description',
    proposalType: 'rule-change',
    status: 'active',
    totalVotes: 0,
    actionData: {},
    executedAt: null,
    ...overrides
  };
  proposal.update = jest.fn().mockImplementation(async (patch) => {
    Object.assign(proposal, patch);
    return proposal;
  });
  return proposal;
}

describe('GovernanceService — proposal lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('updateProposal', () => {
    it('throws when the proposal does not exist', async () => {
      Proposal.findByPk = jest.fn().mockResolvedValue(null);
      await expect(governanceService.updateProposal(PROPOSAL_ID, OWNER, { title: 'New title' }))
        .rejects.toThrow('PROPOSAL_NOT_FOUND');
    });

    it('rejects a non-owner', async () => {
      Proposal.findByPk = jest.fn().mockResolvedValue(fakeProposal());
      await expect(governanceService.updateProposal(PROPOSAL_ID, OTHER, { title: 'New title' }))
        .rejects.toThrow('NOT_PROPOSAL_OWNER');
    });

    it('rejects editing a resolved proposal', async () => {
      Proposal.findByPk = jest.fn().mockResolvedValue(fakeProposal({ status: 'passed' }));
      await expect(governanceService.updateProposal(PROPOSAL_ID, OWNER, { title: 'New title' }))
        .rejects.toThrow('PROPOSAL_NOT_EDITABLE');
    });

    it('rejects editing once votes are cast', async () => {
      Proposal.findByPk = jest.fn().mockResolvedValue(fakeProposal({ totalVotes: 3 }));
      await expect(governanceService.updateProposal(PROPOSAL_ID, OWNER, { title: 'New title' }))
        .rejects.toThrow('PROPOSAL_HAS_VOTES');
    });

    it('applies only whitelisted fields and ignores protected ones', async () => {
      const proposal = fakeProposal();
      Proposal.findByPk = jest.fn().mockResolvedValue(proposal);

      const result = await governanceService.updateProposal(PROPOSAL_ID, OWNER, {
        title: 'Updated title',
        description: 'Updated description',
        status: 'passed',        // protected — must be ignored
        totalVotes: 999,         // protected — must be ignored
        proposerId: OTHER        // protected — must be ignored
      });

      const patch = proposal.update.mock.calls[0][0];
      expect(patch).toEqual({ title: 'Updated title', description: 'Updated description' });
      expect(patch).not.toHaveProperty('status');
      expect(patch).not.toHaveProperty('totalVotes');
      expect(patch).not.toHaveProperty('proposerId');
      expect(result).toBe(proposal);
    });

    it('throws when no whitelisted field is supplied', async () => {
      Proposal.findByPk = jest.fn().mockResolvedValue(fakeProposal());
      await expect(governanceService.updateProposal(PROPOSAL_ID, OWNER, { somethingElse: true }))
        .rejects.toThrow('NO_UPDATABLE_FIELDS');
    });
  });

  describe('deleteProposal', () => {
    it('soft-cancels an active proposal for its owner', async () => {
      const proposal = fakeProposal();
      Proposal.findByPk = jest.fn().mockResolvedValue(proposal);

      const result = await governanceService.deleteProposal(PROPOSAL_ID, OWNER);

      expect(result).toBe(true);
      expect(proposal.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'cancelled' })
      );
      expect(proposal.status).toBe('cancelled');
    });

    it('rejects a non-owner', async () => {
      Proposal.findByPk = jest.fn().mockResolvedValue(fakeProposal());
      await expect(governanceService.deleteProposal(PROPOSAL_ID, OTHER))
        .rejects.toThrow('NOT_PROPOSAL_OWNER');
    });

    it('rejects cancelling a resolved proposal', async () => {
      Proposal.findByPk = jest.fn().mockResolvedValue(fakeProposal({ status: 'rejected' }));
      await expect(governanceService.deleteProposal(PROPOSAL_ID, OWNER))
        .rejects.toThrow('PROPOSAL_NOT_CANCELLABLE');
    });
  });

  describe('executeProposal', () => {
    it('rejects executing a proposal that has not passed', async () => {
      Proposal.findByPk = jest.fn().mockResolvedValue(fakeProposal({ status: 'active' }));
      await expect(governanceService.executeProposal(PROPOSAL_ID))
        .rejects.toThrow('PROPOSAL_NOT_PASSED');
    });

    it('rejects re-executing an already executed proposal', async () => {
      Proposal.findByPk = jest.fn().mockResolvedValue(
        fakeProposal({ status: 'passed', executedAt: 1700000000000 })
      );
      await expect(governanceService.executeProposal(PROPOSAL_ID))
        .rejects.toThrow('ALREADY_EXECUTED');
    });

    it('executes a passed proposal and stamps executedAt', async () => {
      const proposal = fakeProposal({ status: 'passed', actionData: {} });
      Proposal.findByPk = jest.fn().mockResolvedValue(proposal);

      const result = await governanceService.executeProposal(PROPOSAL_ID);

      expect(result.status).toBe('executed');
      expect(result.proposalId).toBe(PROPOSAL_ID);
      expect(proposal.executedAt).toBeTruthy();
    });
  });
});
