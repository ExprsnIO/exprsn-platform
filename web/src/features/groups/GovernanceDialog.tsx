import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HowToVoteIcon from '@mui/icons-material/HowToVote';
import { toMessage } from '@/lib/errors';
import {
  nexusApi,
  type Group,
  type Proposal,
  type ProposalStatus,
  type ProposalType,
  type VoteValue,
} from '@/api/nexus';

const PROPOSAL_TYPES: { value: ProposalType; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'rule-change', label: 'Rule change' },
  { value: 'role-change', label: 'Role change' },
  { value: 'member-action', label: 'Member action' },
  { value: 'other', label: 'Other' },
];

const STATUS_COLOR: Record<ProposalStatus, 'default' | 'primary' | 'success' | 'error' | 'warning'> = {
  draft: 'default',
  active: 'primary',
  passed: 'success',
  rejected: 'error',
  cancelled: 'default',
  expired: 'warning',
};

const VOTE_OPTIONS: { value: VoteValue; label: string; color: 'success' | 'error' | 'inherit' }[] = [
  { value: 'yes', label: 'Yes', color: 'success' },
  { value: 'no', label: 'No', color: 'error' },
  { value: 'abstain', label: 'Abstain', color: 'inherit' },
];

function ProposalCard({
  proposal,
  userId,
  onToast,
  onChanged,
}: {
  proposal: Proposal;
  userId: string;
  onToast: (msg: string) => void;
  onChanged: () => void;
}) {
  const isOwner = proposal.proposerId === userId;
  const isActive = proposal.status === 'active';
  const editable = isOwner && ['draft', 'active'].includes(proposal.status) && !(proposal.totalVotes ?? 0);

  const vote = useMutation({
    mutationFn: (value: VoteValue) => nexusApi.voteOnProposal(proposal.id, value),
    onSuccess: (_d, value) => {
      onToast(`Voted "${value}"`);
      onChanged();
    },
    onError: (err) => onToast(toMessage(err)),
  });
  const execute = useMutation({
    mutationFn: () => nexusApi.executeProposal(proposal.id),
    onSuccess: () => {
      onToast('Proposal executed');
      onChanged();
    },
    onError: (err) => onToast(toMessage(err)),
  });
  const cancel = useMutation({
    mutationFn: () => nexusApi.cancelProposal(proposal.id),
    onSuccess: () => {
      onToast('Proposal cancelled');
      onChanged();
    },
    onError: (err) => onToast(toMessage(err)),
  });

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
          {proposal.title}
        </Typography>
        <Chip size="small" label={proposal.proposalType} variant="outlined" />
        <Chip size="small" label={proposal.status} color={STATUS_COLOR[proposal.status]} />
      </Stack>
      {proposal.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {proposal.description}
        </Typography>
      )}
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
        {proposal.voteCountYes ?? 0} yes · {proposal.voteCountNo ?? 0} no ·{' '}
        {proposal.voteCountAbstain ?? 0} abstain
      </Typography>

      <Stack direction="row" spacing={1} sx={{ mt: 1.5, flexWrap: 'wrap' }} alignItems="center">
        {isActive &&
          VOTE_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              size="small"
              color={opt.color}
              variant="outlined"
              disabled={vote.isPending}
              onClick={() => vote.mutate(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        {proposal.status === 'passed' && !proposal.executedAt && (
          <Button
            size="small"
            variant="contained"
            color="success"
            disabled={execute.isPending}
            onClick={() => execute.mutate()}
          >
            Execute
          </Button>
        )}
        {proposal.executedAt && <Chip size="small" label="Executed" color="success" variant="outlined" />}
        <Box sx={{ flex: 1 }} />
        {editable && (
          <Tooltip title="Cancel this proposal">
            <span>
              <Button
                size="small"
                color="inherit"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Cancel
              </Button>
            </span>
          </Tooltip>
        )}
      </Stack>
    </Paper>
  );
}

/**
 * Per-group governance: list proposals, create a proposal, vote, execute a
 * passed proposal, and cancel your own. Backed by /nexus/api/governance/*.
 */
export function GovernanceDialog({
  group,
  userId,
  open,
  onClose,
  onToast,
}: {
  group: Group | null;
  userId: string;
  open: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proposalType, setProposalType] = useState<ProposalType>('general');

  const groupId = group?.id ?? '';
  const proposals = useQuery({
    queryKey: ['nexus', 'governance', groupId],
    queryFn: () => nexusApi.listProposals(groupId),
    enabled: open && !!groupId,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['nexus', 'governance', groupId] });

  const create = useMutation({
    mutationFn: () =>
      nexusApi.createProposal({ groupId, title: title.trim(), description: description.trim(), proposalType }),
    onSuccess: () => {
      onToast('Proposal created');
      setTitle('');
      setDescription('');
      setProposalType('general');
      refresh();
    },
    onError: (err) => onToast(toMessage(err)),
  });

  const canSubmit = title.trim().length >= 5 && description.trim().length > 0 && !create.isPending;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1} alignItems="center">
          <HowToVoteIcon fontSize="small" />
          <Box sx={{ flex: 1 }}>Governance — {group?.name}</Box>
          <IconButton size="small" onClick={onClose} aria-label="close">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              New proposal
            </Typography>
            <Stack spacing={1.5}>
              <TextField
                label="Title"
                size="small"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                helperText="At least 5 characters"
                fullWidth
              />
              <TextField
                label="Description"
                size="small"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                multiline
                minRows={2}
                fullWidth
              />
              <TextField
                label="Type"
                size="small"
                select
                value={proposalType}
                onChange={(e) => setProposalType(e.target.value as ProposalType)}
                sx={{ maxWidth: 220 }}
              >
                {PROPOSAL_TYPES.map((t) => (
                  <MenuItem key={t.value} value={t.value}>
                    {t.label}
                  </MenuItem>
                ))}
              </TextField>
              <Box>
                <Button variant="contained" disabled={!canSubmit} onClick={() => create.mutate()}>
                  Create proposal
                </Button>
              </Box>
            </Stack>
          </Paper>

          <Divider>Proposals</Divider>

          {proposals.isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {proposals.isError && <Alert severity="error">{toMessage(proposals.error)}</Alert>}
          {proposals.isSuccess && (proposals.data.proposals?.length ?? 0) === 0 && (
            <Typography color="text.secondary" sx={{ textAlign: 'center', p: 2 }}>
              No proposals yet.
            </Typography>
          )}
          {(proposals.data?.proposals ?? []).map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              userId={userId}
              onToast={onToast}
              onChanged={refresh}
            />
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
