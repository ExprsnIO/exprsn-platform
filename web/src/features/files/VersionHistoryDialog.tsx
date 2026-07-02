import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import RestoreIcon from '@mui/icons-material/Restore';
import DifferenceOutlinedIcon from '@mui/icons-material/DifferenceOutlined';
import { isHttpError, toMessage } from '@/lib/errors';
import { filevaultApi, type FileItem, type VersionDiffChange } from '@/api/filevault';
import { formatBytes, formatDate, isTextType } from './util';

function DiffView({ changes }: { changes: VersionDiffChange[] }) {
  return (
    <Box
      component="pre"
      sx={{
        m: 0,
        p: 1.5,
        maxHeight: 280,
        overflow: 'auto',
        borderRadius: 1,
        bgcolor: 'action.hover',
        fontFamily: 'monospace',
        fontSize: 12,
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {changes.map((c, i) => {
        const sign = c.added ? '+' : c.removed ? '-' : ' ';
        const color = c.added
          ? 'success.main'
          : c.removed
            ? 'error.main'
            : 'text.secondary';
        const bg = c.added
          ? 'color-mix(in srgb, var(--exprsn-success) 12%, transparent)'
          : c.removed
            ? 'color-mix(in srgb, var(--exprsn-danger) 12%, transparent)'
            : 'transparent';
        // Prefix each line of the hunk with the +/-/space marker.
        const lines = c.value.replace(/\n$/, '').split('\n');
        return (
          <Box key={i} component="span" sx={{ display: 'block', color, bgcolor: bg }}>
            {lines.map((ln, j) => (
              <Box key={j} component="span" sx={{ display: 'block' }}>
                {sign} {ln}
              </Box>
            ))}
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * Version history for a file: list every stored revision, restore one (creates a
 * new current version), and — for text files — show a line diff between any two
 * versions.
 */
export function VersionHistoryDialog({
  file,
  open,
  onClose,
  onToast,
}: {
  file: FileItem;
  open: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const versionsKey = ['filevault', 'versions', file.id] as const;
  const [fromV, setFromV] = useState<number | ''>('');
  const [toV, setToV] = useState<number | ''>('');

  const versions = useQuery({
    queryKey: versionsKey,
    queryFn: () => filevaultApi.listVersions(file.id),
    enabled: open,
  });

  const list = useMemo(() => versions.data?.versions ?? [], [versions.data]);
  const textDiffable = isTextType(file.mimetype);

  const restoreMutation = useMutation({
    mutationFn: (versionNumber: number) => filevaultApi.restoreVersion(file.id, versionNumber),
    onSuccess: (_res, versionNumber) => {
      onToast(`Restored version ${versionNumber}`);
      qc.invalidateQueries({ queryKey: versionsKey });
      qc.invalidateQueries({ queryKey: ['filevault', 'explorer'] });
    },
    onError: (err) => onToast(toMessage(err)),
  });

  const diff = useMutation({
    mutationFn: () => {
      if (fromV === '' || toV === '') throw new Error('Pick two versions to compare.');
      return filevaultApi.diffVersions(file.id, fromV, toV);
    },
    onError: (err) => onToast(toMessage(err)),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Version history — “{file.name}”</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {versions.isLoading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress size={24} />
            </Box>
          )}
          {versions.isError && <Alert severity="error">{toMessage(versions.error)}</Alert>}
          {versions.isSuccess && list.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No version history.
            </Typography>
          )}

          {list.length > 0 && (
            <List dense disablePadding>
              {list.map((v) => {
                const isCurrent = v.version === file.currentVersion;
                return (
                  <ListItem
                    key={v.id}
                    disableGutters
                    secondaryAction={
                      !isCurrent && (
                        <Tooltip title="Restore this version">
                          <IconButton
                            edge="end"
                            size="small"
                            disabled={restoreMutation.isPending}
                            onClick={() => restoreMutation.mutate(v.version)}
                          >
                            <RestoreIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )
                    }
                  >
                    <ListItemText
                      primary={`Version ${v.version}${isCurrent ? ' (current)' : ''} · ${formatBytes(v.size)}`}
                      secondary={
                        [formatDate(v.createdAt), v.changeDescription]
                          .filter(Boolean)
                          .join(' · ') || undefined
                      }
                    />
                  </ListItem>
                );
              })}
            </List>
          )}

          {list.length > 1 && (
            <>
              <Divider />
              <Typography variant="subtitle2">Compare versions</Typography>
              {!textDiffable && (
                <Typography variant="body2" color="text.secondary">
                  Diffs are only available for text files.
                </Typography>
              )}
              {textDiffable && (
                <>
                  <Stack direction="row" spacing={2}>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label="From"
                      value={fromV}
                      onChange={(e) => setFromV(e.target.value === '' ? '' : Number(e.target.value))}
                    >
                      {list.map((v) => (
                        <MenuItem key={v.id} value={v.version}>
                          v{v.version}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField
                      select
                      fullWidth
                      size="small"
                      label="To"
                      value={toV}
                      onChange={(e) => setToV(e.target.value === '' ? '' : Number(e.target.value))}
                    >
                      {list.map((v) => (
                        <MenuItem key={v.id} value={v.version}>
                          v{v.version}
                        </MenuItem>
                      ))}
                    </TextField>
                    <Button
                      variant="outlined"
                      startIcon={<DifferenceOutlinedIcon />}
                      disabled={fromV === '' || toV === '' || diff.isPending}
                      onClick={() => diff.mutate()}
                    >
                      Diff
                    </Button>
                  </Stack>

                  {diff.isPending && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                      <CircularProgress size={22} />
                    </Box>
                  )}
                  {diff.isError && isHttpError(diff.error, 400) && (
                    <Alert severity="info">No diff available for these versions.</Alert>
                  )}
                  {diff.isSuccess && (
                    <Stack spacing={1}>
                      <Typography variant="caption" color="text.secondary">
                        +{diff.data.diff.summary.additionsCount} / −
                        {diff.data.diff.summary.deletionsCount} change(s)
                      </Typography>
                      <DiffView changes={diff.data.diff.diff.changes} />
                    </Stack>
                  )}
                </>
              )}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
