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
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { filevaultApi, type FileItem } from '@/api/filevault';
import { formatBytes, formatDate } from './util';

const FILES_KEY = ['filevault', 'files'] as const;

/**
 * Phase 5 — Files (FileVault). Upload, list, download, and delete files for the
 * signed-in user against the filevault module (`/filevault/api/files`). Download
 * streams via an authenticated fetch→blob; delete needs the `delete` permission
 * (surfaced as an error if the token lacks it).
 */
export function FilesPage() {
  const userId = useAppStore((s) => s.user?.id);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [toast, setToast] = useState<string | null>(null);

  const query = useQuery({
    queryKey: FILES_KEY,
    queryFn: () => filevaultApi.listFiles({ limit: 100 }),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => filevaultApi.upload(file),
    onSuccess: (res) => {
      setToast(`Uploaded “${res.file?.name ?? 'file'}”`);
      qc.invalidateQueries({ queryKey: FILES_KEY });
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
      qc.invalidateQueries({ queryKey: FILES_KEY });
    },
    onError: (err) => setToast(toMessage(err)),
  });

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = ''; // allow re-selecting the same file
  };

  if (!userId) return <Alert severity="error">Not signed in.</Alert>;

  const files = query.data?.files ?? [];

  return (
    <Stack spacing={2} sx={{ maxWidth: 920, mx: 'auto', pb: 6 }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5">Files</Typography>
        <Box sx={{ flex: 1 }} />
        <input ref={inputRef} type="file" hidden onChange={onPick} />
        <Button
          variant="contained"
          startIcon={<UploadFileIcon />}
          disabled={uploadMutation.isPending}
          onClick={() => inputRef.current?.click()}
        >
          {uploadMutation.isPending ? 'Uploading…' : 'Upload'}
        </Button>
      </Stack>

      {uploadMutation.isPending && <LinearProgress />}

      {query.isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress size={28} />
        </Box>
      )}
      {query.isError && <Alert severity="error">{toMessage(query.error)}</Alert>}

      {query.isSuccess && files.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
          <InsertDriveFileOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            No files yet. Upload your first file.
          </Typography>
        </Paper>
      ) : (
        files.length > 0 && (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
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
                      <TableCell sx={{ color: 'text.secondary' }}>{f.mimetype ?? '—'}</TableCell>
                      <TableCell align="right">{formatBytes(f.size)}</TableCell>
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
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => {
                                  if (window.confirm(`Delete “${f.name}”? This cannot be undone.`)) {
                                    deleteMutation.mutate(f);
                                  }
                                }}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )
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
