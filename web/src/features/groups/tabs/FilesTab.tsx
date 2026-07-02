import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  LinearProgress,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import { isHttpError, toMessage } from '@/lib/errors';
import { filevaultApi, type FileItem } from '@/api/filevault';
import { formatBytes, formatDate } from '@/features/files/util';
import type { GroupTabProps } from './types';

/**
 * Files (FileVault) tab for a group. Lists the group's root files, with
 * member+write-gated upload, authenticated download, and capability-gated
 * delete. Viewing is restricted to members (viewMemberContent); the backend is
 * the real enforcer, these gates are UX / defense-in-depth.
 */
export default function FilesTab({ groupId, ctx }: GroupTabProps) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  const canView = ctx.can('viewMemberContent');
  const canUpload = ctx.can('uploadMedia');
  const canDelete = ctx.can('deleteOthersContent');

  const filesKey = ['filevault', 'group-files', groupId] as const;

  const query = useQuery({
    queryKey: filesKey,
    queryFn: () => filevaultApi.listGroupFiles(groupId, { limit: 100 }),
    enabled: canView,
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => filevaultApi.uploadToGroup(groupId, file),
    onSuccess: (res) => {
      setToast(`Uploaded “${res.file?.name ?? 'file'}”`);
      qc.invalidateQueries({ queryKey: filesKey });
    },
    onError: (err) => setToast(toMessage(err)),
  });

  const downloadMutation = useMutation({
    mutationFn: (item: FileItem) => filevaultApi.download(item),
    onError: (err) => setToast(toMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (item: FileItem) => filevaultApi.deleteFile(item.id),
    onSuccess: (_res, item) => {
      setToast(`Deleted “${item.name}”`);
      qc.invalidateQueries({ queryKey: filesKey });
    },
    onError: (err) => setToast(toMessage(err)),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = ''; // allow re-selecting the same file
  };

  if (!canView) {
    return (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Files are visible to group members only. Join the group to see them.
      </Typography>
    );
  }

  const files = query.data?.files ?? [];

  return (
    <Stack spacing={2}>
      {canUpload && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            {files.length} file{files.length === 1 ? '' : 's'}
          </Typography>
          <input ref={inputRef} type="file" hidden onChange={onPick} />
          <Button
            size="small"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            disabled={uploadMutation.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
          </Button>
        </Stack>
      )}

      {uploadMutation.isPending && <LinearProgress />}

      {query.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress size={26} />
        </Box>
      )}

      {query.isError &&
        (isHttpError(query.error, 403) ? (
          <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
            Files are visible to group members only.
          </Typography>
        ) : (
          <Alert severity="error">{toMessage(query.error)}</Alert>
        ))}

      {query.isSuccess &&
        (files.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
            <FolderOutlinedIcon sx={{ fontSize: 44, color: 'text.disabled' }} />
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              No files yet.{canUpload ? ' Upload the first one.' : ''}
            </Typography>
          </Paper>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 220 }}>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Size</TableCell>
                  <TableCell>Modified</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {files.map((f) => {
                  const busy =
                    (downloadMutation.isPending && downloadMutation.variables?.id === f.id) ||
                    (deleteMutation.isPending && deleteMutation.variables?.id === f.id);
                  return (
                    <TableRow key={f.id} hover>
                      <TableCell sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <InsertDriveFileOutlinedIcon fontSize="small" color="action" />
                        <span style={{ wordBreak: 'break-all' }}>{f.name}</span>
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', overflowWrap: 'anywhere' }}>{f.mimetype ?? '—'}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>{formatBytes(f.size)}</TableCell>
                      <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                        {formatDate(f.updatedAt || f.createdAt)}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        {busy ? (
                          <CircularProgress size={18} sx={{ mx: 1.5 }} />
                        ) : (
                          <>
                            <Tooltip title="Download">
                              <IconButton size="small" onClick={() => downloadMutation.mutate(f)}>
                                <DownloadIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            {canDelete && (
                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => {
                                    if (
                                      window.confirm(`Delete “${f.name}”? This cannot be undone.`)
                                    ) {
                                      deleteMutation.mutate(f);
                                    }
                                  }}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ))}

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
