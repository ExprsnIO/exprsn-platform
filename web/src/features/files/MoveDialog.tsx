import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from '@mui/material';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { toMessage } from '@/lib/errors';
import { filevaultApi, type DirectoryItem } from '@/api/filevault';

interface Crumb {
  id: string | null;
  name: string;
}

/**
 * Folder picker for moving a directory. Navigates the tree level-by-level
 * (listDirectories per level) and returns the chosen destination id (null =
 * root). The directory being moved (and its current parent are not specially
 * filtered beyond hiding itself) — the backend rejects moves into descendants.
 */
export function MoveDialog({
  title,
  open,
  excludeDirectoryId,
  busy,
  onClose,
  onMove,
}: {
  title: string;
  open: boolean;
  excludeDirectoryId?: string;
  busy?: boolean;
  onClose: () => void;
  onMove: (destinationId: string | null) => void;
}) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: 'Home' }]);
  const current = crumbs[crumbs.length - 1];

  const query = useQuery({
    queryKey: ['filevault', 'move-picker', current.id],
    queryFn: () => filevaultApi.listDirectories(current.id),
    enabled: open,
  });

  const folders = (query.data?.subdirectories ?? []).filter(
    (d: DirectoryItem) => d.id !== excludeDirectoryId,
  );

  const enter = (dir: DirectoryItem) => setCrumbs((c) => [...c, { id: dir.id, name: dir.name }]);
  const goTo = (index: number) => setCrumbs((c) => c.slice(0, index + 1));

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent dividers>
        <Breadcrumbs sx={{ mb: 1 }}>
          {crumbs.map((c, i) =>
            i === crumbs.length - 1 ? (
              <Typography key={i} color="text.primary" variant="body2">
                {c.name}
              </Typography>
            ) : (
              <Link
                key={i}
                component="button"
                type="button"
                variant="body2"
                onClick={() => goTo(i)}
              >
                {c.name}
              </Link>
            ),
          )}
        </Breadcrumbs>

        {query.isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={22} />
          </Box>
        )}
        {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}
        {query.isSuccess && folders.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 1 }}>
            No subfolders here.
          </Typography>
        )}
        {folders.length > 0 && (
          <List dense>
            {folders.map((d) => (
              <ListItemButton key={d.id} onClick={() => enter(d)}>
                <ListItemIcon sx={{ minWidth: 36 }}>
                  <FolderOutlinedIcon fontSize="small" />
                </ListItemIcon>
                <ListItemText primary={d.name} />
              </ListItemButton>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy} onClick={() => onMove(current.id)}>
          {busy ? 'Moving…' : `Move here (${current.name})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
