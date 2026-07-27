import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import TagIcon from '@mui/icons-material/Tag';
import {
  nexusApi,
  type CreateSubGroupInput,
  type SubGroup,
  type SubGroupType,
  type SubGroupVisibility,
} from '@/api/nexus';
import { isHttpError, toMessage } from '@/lib/errors';
import type { GroupTabProps } from './types';

const TYPES: SubGroupType[] = ['channel', 'subgroup'];
const VISIBILITIES: SubGroupVisibility[] = ['public', 'members', 'restricted'];

function SubGroupDialog({
  parentGroupId,
  existing,
  open,
  onClose,
  onToast,
}: {
  parentGroupId: string;
  existing?: SubGroup;
  open: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<SubGroupType>('channel');
  const [visibility, setVisibility] = useState<SubGroupVisibility>('members');

  useEffect(() => {
    if (open) {
      setName(existing?.name ?? '');
      setDescription((existing?.description as string) ?? '');
      setType(existing?.type ?? 'channel');
      setVisibility(existing?.visibility ?? 'members');
    }
  }, [open, existing]);

  const mutation = useMutation({
    mutationFn: () => {
      if (existing) {
        return nexusApi.updateSubgroup(existing.id, {
          name: name.trim(),
          description: description.trim() || undefined,
          visibility,
        });
      }
      const payload: CreateSubGroupInput = {
        parentGroupId,
        name: name.trim(),
        description: description.trim() || undefined,
        type,
        visibility,
      };
      return nexusApi.createSubgroup(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nexus', 'subgroups', parentGroupId] });
      onToast(existing ? 'Channel updated' : 'Channel created');
      onClose();
    },
  });

  const canSubmit = name.trim().length >= 2 && !mutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{existing ? 'Edit channel' : 'New channel'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}
          <TextField
            label="Name"
            required
            fullWidth
            value={name}
            onChange={(e) => setName(e.target.value)}
            helperText="At least 2 characters"
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          {!existing && (
            <TextField select label="Type" fullWidth value={type} onChange={(e) => setType(e.target.value as SubGroupType)}>
              {TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            label="Visibility"
            fullWidth
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as SubGroupVisibility)}
          >
            {VISIBILITIES.map((v) => (
              <MenuItem key={v} value={v}>
                {v}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Saving…' : existing ? 'Save' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AddMemberDialog({
  subGroupId,
  open,
  onClose,
  onToast,
}: {
  subGroupId: string;
  open: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [userId, setUserId] = useState('');
  const mutation = useMutation({
    mutationFn: () => nexusApi.addSubgroupMember(subGroupId, userId.trim()),
    onSuccess: () => {
      onToast('Member added to channel');
      setUserId('');
      onClose();
    },
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add channel member</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}
          <TextField
            label="User ID"
            required
            fullWidth
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!userId.trim() || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? 'Adding…' : 'Add'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function SubGroupRow({
  subGroup,
  canManage,
  onEdit,
  onAddMember,
  onToast,
}: {
  subGroup: SubGroup;
  canManage: boolean;
  onEdit: (sg: SubGroup) => void;
  onAddMember: (sg: SubGroup) => void;
  onToast: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const del = useMutation({
    mutationFn: () => nexusApi.deleteSubgroup(subGroup.id),
    onSuccess: () => {
      onToast('Channel archived');
      qc.invalidateQueries({ queryKey: ['nexus', 'subgroups', subGroup.parentGroupId] });
    },
    onError: (err) => onToast(toMessage(err)),
  });

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <TagIcon fontSize="small" color="disabled" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap>
            {subGroup.name}
          </Typography>
          {subGroup.description ? (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
              {subGroup.description as string}
            </Typography>
          ) : null}
        </Box>
        <Chip size="small" variant="outlined" label={subGroup.visibility} />
        {canManage && (
          <>
            <IconButton size="small" aria-label="Subgroup actions" onClick={(e) => setAnchor(e.currentTarget)}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
              <MenuItem
                onClick={() => {
                  setAnchor(null);
                  onEdit(subGroup);
                }}
              >
                Edit
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnchor(null);
                  onAddMember(subGroup);
                }}
              >
                Add member
              </MenuItem>
              <MenuItem
                onClick={() => {
                  setAnchor(null);
                  del.mutate();
                }}
                sx={{ color: 'error.main' }}
              >
                Archive
              </MenuItem>
            </Menu>
          </>
        )}
      </Stack>
    </Paper>
  );
}

/** Channels / sub-groups within a group. */
export default function SubgroupsTab({ groupId, ctx }: GroupTabProps) {
  const canManage = ctx.can('editGroup');
  const [toast, setToast] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SubGroup | undefined>(undefined);
  const [memberTarget, setMemberTarget] = useState<SubGroup | undefined>(undefined);

  const q = useQuery({
    queryKey: ['nexus', 'subgroups', groupId],
    queryFn: () => nexusApi.listSubgroups(groupId),
  });

  const openCreate = () => {
    setEditing(undefined);
    setDialogOpen(true);
  };
  const openEdit = (sg: SubGroup) => {
    setEditing(sg);
    setDialogOpen(true);
  };

  let body: ReactNode = null;
  if (q.isLoading) {
    body = (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={26} />
      </Box>
    );
  } else if (q.isError) {
    body = isHttpError(q.error, 403) ? (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Channels are visible to group members only.
      </Typography>
    ) : (
      <Alert severity="error">{toMessage(q.error)}</Alert>
    );
  } else {
    const list = q.data?.subGroups ?? [];
    body =
      list.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
          No channels yet.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {list.map((sg) => (
            <SubGroupRow
              key={sg.id}
              subGroup={sg}
              canManage={canManage}
              onEdit={openEdit}
              onAddMember={(s) => setMemberTarget(s)}
              onToast={setToast}
            />
          ))}
        </Stack>
      );
  }

  return (
    <Stack spacing={1.5}>
      {canManage && (
        <Box>
          <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={openCreate}>
            New channel
          </Button>
        </Box>
      )}
      {body}

      <SubGroupDialog
        parentGroupId={groupId}
        existing={editing}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onToast={setToast}
      />
      {memberTarget && (
        <AddMemberDialog
          subGroupId={memberTarget.id}
          open={!!memberTarget}
          onClose={() => setMemberTarget(undefined)}
          onToast={setToast}
        />
      )}
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Stack>
  );
}
