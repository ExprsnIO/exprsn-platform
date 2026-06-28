import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  Link,
  Paper,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { nexusApi } from '@/api/nexus';
import { toMessage } from '@/lib/errors';
import { EditGroupDialog } from '../EditGroupDialog';
import type { GroupTabProps } from './types';

/** Group "About" — description/meta plus owner/admin edit + delete actions. */
export default function AboutTab({ ctx }: GroupTabProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const group = ctx.group;
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const del = useMutation({
    mutationFn: () => nexusApi.deleteGroup(group!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nexus'] });
      navigate('/groups');
    },
    onError: (err) => setToast(toMessage(err)),
  });

  if (!group) return null;

  const canEdit = ctx.can('editGroup');
  const canDelete = ctx.role === 'owner' || ctx.isPlatformAdmin;

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        <Typography variant="body1">
          {(group.description as string) || 'No description provided.'}
        </Typography>
        {Boolean(group.location || group.website) && <Divider />}
        {group.location ? (
          <Typography variant="body2" color="text.secondary">
            📍 {group.location as string}
          </Typography>
        ) : null}
        {group.website ? (
          <Link href={group.website as string} target="_blank" rel="noopener" variant="body2">
            {group.website as string}
          </Link>
        ) : null}
        {Array.isArray(group.tags) && group.tags.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
            {(group.tags as string[]).map((t) => (
              <Chip key={t} size="small" label={t} />
            ))}
          </Stack>
        )}

        {(canEdit || canDelete) && (
          <>
            <Divider />
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
              {canEdit && (
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<EditOutlinedIcon />}
                  onClick={() => setEditOpen(true)}
                >
                  Edit group
                </Button>
              )}
              {canDelete && (
                <Button
                  size="small"
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteOutlineIcon />}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete group
                </Button>
              )}
            </Stack>
          </>
        )}
      </Stack>

      <EditGroupDialog
        group={group}
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={setToast}
      />

      <Dialog open={confirmDelete} onClose={() => setConfirmDelete(false)}>
        <DialogTitle>Delete this group?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            “{group.name}” will be deleted. This cannot be undone from here.
          </DialogContentText>
          {del.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {toMessage(del.error)}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmDelete(false)}>
            Cancel
          </Button>
          <Button color="error" disabled={del.isPending} onClick={() => del.mutate()}>
            {del.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Paper>
  );
}
