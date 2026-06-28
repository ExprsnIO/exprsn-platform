import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import { nexusApi, type AssignableRole, type GroupMember } from '@/api/nexus';
import { usersApi, type PublicUser } from '@/api/users';
import { isHttpError, toMessage } from '@/lib/errors';
import { avatarColor, personInitials } from '@/features/people/util';
import type { GroupTabProps } from './types';

const ROLE_COLOR = (role: string) =>
  role === 'owner' ? 'primary' : role === 'admin' ? 'secondary' : 'default';

function MemberRow({
  member,
  profile,
  canManage,
  onRole,
  onRemove,
}: {
  member: GroupMember;
  profile?: PublicUser;
  canManage: boolean;
  onRole: (member: GroupMember, role: AssignableRole) => void;
  onRemove: (member: GroupMember) => void;
}) {
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const name = profile?.displayName || 'Unnamed user';
  // Owner role is transfer-only — never offered in the role menu.
  const manageable = canManage && member.role !== 'owner';

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Avatar
          src={profile?.avatarUrl ?? undefined}
          sx={{ bgcolor: avatarColor(member.userId), width: 36, height: 36 }}
        >
          {personInitials(profile?.displayName, member.userId)}
        </Avatar>
        <Link
          component={RouterLink}
          to={`/people/${member.userId}`}
          underline="hover"
          color="inherit"
          sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}
          noWrap
        >
          {name}
        </Link>
        <Chip size="small" label={member.role} color={ROLE_COLOR(member.role)} />
        {manageable && (
          <>
            <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
              {(['admin', 'moderator', 'member'] as AssignableRole[])
                .filter((r) => r !== member.role)
                .map((r) => (
                  <MenuItem
                    key={r}
                    onClick={() => {
                      setAnchor(null);
                      onRole(member, r);
                    }}
                  >
                    Make {r}
                  </MenuItem>
                ))}
              <MenuItem
                onClick={() => {
                  setAnchor(null);
                  onRemove(member);
                }}
                sx={{ color: 'error.main' }}
              >
                Remove from group
              </MenuItem>
            </Menu>
          </>
        )}
      </Stack>
    </Paper>
  );
}

function InviteDialog({
  groupId,
  open,
  onClose,
  onToast,
}: {
  groupId: string;
  open: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [userId, setUserId] = useState('');
  const [message, setMessage] = useState('');
  const mutation = useMutation({
    mutationFn: () =>
      nexusApi.invite(groupId, {
        userId: userId.trim() || undefined,
        message: message.trim() || undefined,
      }),
    onSuccess: (res) => {
      const code = res.invite?.inviteCode;
      onToast(code ? `Invite created — code ${code}` : 'Invite created');
      setUserId('');
      setMessage('');
      onClose();
    },
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Invite to group</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}
          <TextField
            label="User ID (optional)"
            fullWidth
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            helperText="Leave blank for a shareable invite code"
          />
          <TextField
            label="Message (optional)"
            fullWidth
            multiline
            minRows={2}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Creating…' : 'Create invite'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Members list with admin role management + invites. */
export default function MembersTab({ groupId, ctx }: GroupTabProps) {
  const qc = useQueryClient();
  const canManage = ctx.can('manageMembers');
  const isMember = ctx.isMember || ctx.isPlatformAdmin;
  const [toast, setToast] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const members = useQuery({
    queryKey: ['nexus', 'members', groupId],
    queryFn: () => nexusApi.listMembers(groupId, { limit: 100 }),
    enabled: isMember,
  });

  const memberIds = (members.data?.members ?? []).map((m) => m.userId);
  const profilesQ = useQuery({
    queryKey: ['people', 'profiles', memberIds],
    queryFn: () => usersApi.profilesByIds(memberIds),
    enabled: memberIds.length > 0,
  });
  const profileMap = new Map((profilesQ.data?.users ?? []).map((u) => [u.id, u]));

  const roleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AssignableRole }) =>
      nexusApi.changeMemberRole(groupId, userId, role),
    onSuccess: () => {
      setToast('Member role updated');
      qc.invalidateQueries({ queryKey: ['nexus', 'members', groupId] });
    },
    onError: (err) => setToast(toMessage(err)),
  });
  const removeMut = useMutation({
    mutationFn: (userId: string) => nexusApi.removeMember(groupId, userId),
    onSuccess: () => {
      setToast('Member removed');
      qc.invalidateQueries({ queryKey: ['nexus', 'members', groupId] });
    },
    onError: (err) => setToast(toMessage(err)),
  });

  if (!isMember) {
    return (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Members are visible to group members only. Join the group to see them.
      </Typography>
    );
  }
  if (members.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={26} />
      </Box>
    );
  }
  if (members.isError) {
    return isHttpError(members.error, 403) ? (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Members are visible to group members only.
      </Typography>
    ) : (
      <Alert severity="error">{toMessage(members.error)}</Alert>
    );
  }

  const list = members.data?.members ?? [];

  return (
    <Stack spacing={1.5}>
      {canManage && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            {list.length} member{list.length === 1 ? '' : 's'}
          </Typography>
          <Button
            size="small"
            variant="outlined"
            startIcon={<PersonAddAlt1Icon />}
            onClick={() => setInviteOpen(true)}
          >
            Invite
          </Button>
        </Stack>
      )}

      {canManage && (
        // No backend endpoint lists pending join requests yet (only approve/reject
        // by id). Surfaced here so admins know where requests will appear.
        <Alert severity="info" variant="outlined">
          Join requests are approved from the requester’s notification link. A pending-requests
          list is not available yet.
        </Alert>
      )}

      {list.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
          No members yet.
        </Typography>
      ) : (
        list.map((m) => (
          <MemberRow
            key={m.id}
            member={m}
            profile={profileMap.get(m.userId)}
            canManage={canManage}
            onRole={(member, role) => roleMut.mutate({ userId: member.userId, role })}
            onRemove={(member) => removeMut.mutate(member.userId)}
          />
        ))
      )}

      <InviteDialog
        groupId={groupId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onToast={setToast}
      />
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
