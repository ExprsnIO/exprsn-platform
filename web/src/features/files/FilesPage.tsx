import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import CreateNewFolderOutlinedIcon from '@mui/icons-material/CreateNewFolderOutlined';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ShareOutlinedIcon from '@mui/icons-material/ShareOutlined';
import HistoryIcon from '@mui/icons-material/History';
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import RestoreFromTrashIcon from '@mui/icons-material/RestoreFromTrash';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import SearchIcon from '@mui/icons-material/Search';
import { useAppStore } from '@/app/store';
import { toMessage } from '@/lib/errors';
import { filevaultApi, type DirectoryItem, type FileItem } from '@/api/filevault';
import { ShareDialog } from './ShareDialog';
import { VersionHistoryDialog } from './VersionHistoryDialog';
import { FilePreview } from './FilePreview';
import { MoveDialog } from './MoveDialog';
import { formatBytes, formatDate } from './util';

interface Crumb {
  id: string | null;
  name: string;
}

type View = 'browse' | 'trash';

interface UploadTask {
  name: string;
  status: 'uploading' | 'done' | 'error';
  error?: string;
}

const EXPLORER_KEY = ['filevault', 'explorer'] as const;

/** Small modal that collects a single name (create folder / rename). */
function NameDialog({
  title,
  label,
  initial,
  confirmLabel,
  open,
  busy,
  onClose,
  onSubmit,
}: {
  title: string;
  label: string;
  initial?: string;
  confirmLabel: string;
  open: boolean;
  busy?: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const [name, setName] = useState(initial ?? '');
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          fullWidth
          margin="dense"
          label={label}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && name.trim()) onSubmit(name.trim());
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={busy || !name.trim()}
          onClick={() => onSubmit(name.trim())}
        >
          {busy ? 'Working…' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * FileVault explorer. Folder navigation (breadcrumbs), create/rename/move/delete
 * folders, multi-select + bulk delete, drag-and-drop + button upload into the
 * current folder, a storage quota bar, per-file preview/versions/share, and a
 * trash view (restore soft-deleted files).
 */
export function FilesPage() {
  const userId = useAppStore((s) => s.user?.id);
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<View>('browse');
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: 'Home' }]);
  const current = crumbs[crumbs.length - 1];
  const dirId = current.id;

  const [toast, setToast] = useState<string | null>(null);
  const [term, setTerm] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Dialogs
  const [shareTarget, setShareTarget] = useState<FileItem | null>(null);
  const [versionTarget, setVersionTarget] = useState<FileItem | null>(null);
  const [previewTarget, setPreviewTarget] = useState<FileItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<DirectoryItem | null>(null);
  const [renameTarget, setRenameTarget] = useState<DirectoryItem | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const explorer = useQuery({
    queryKey: [...EXPLORER_KEY, dirId],
    queryFn: () => filevaultApi.listDirectories(dirId),
    enabled: view === 'browse',
  });

  const trash = useQuery({
    queryKey: ['filevault', 'trash'],
    queryFn: () => filevaultApi.listTrash(),
    enabled: view === 'trash',
  });

  const quota = useQuery({
    queryKey: ['filevault', 'quota'],
    queryFn: () => filevaultApi.storageQuota(),
  });

  const searching = view === 'browse' && term.trim().length > 0;
  const searchQuery = useQuery({
    queryKey: ['filevault', 'search', term.trim()],
    queryFn: () => filevaultApi.search(term.trim()),
    enabled: searching,
  });

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: EXPLORER_KEY });
    qc.invalidateQueries({ queryKey: ['filevault', 'trash'] });
    qc.invalidateQueries({ queryKey: ['filevault', 'quota'] });
  }, [qc]);

  // --- Uploads (drag-drop + button) ---
  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (arr.length === 0) return;
      setUploads((u) => [...u, ...arr.map((f) => ({ name: f.name, status: 'uploading' as const }))]);
      for (const file of arr) {
        try {
          await filevaultApi.upload(file, { directoryId: dirId ?? undefined });
          setUploads((u) =>
            u.map((t) => (t.name === file.name && t.status === 'uploading' ? { ...t, status: 'done' } : t)),
          );
        } catch (err) {
          setUploads((u) =>
            u.map((t) =>
              t.name === file.name && t.status === 'uploading'
                ? { ...t, status: 'error', error: toMessage(err) }
                : t,
            ),
          );
        }
      }
      invalidate();
      // Clear the finished list shortly after so it doesn't linger.
      window.setTimeout(() => setUploads((u) => u.filter((t) => t.status === 'uploading')), 4000);
    },
    [dirId, invalidate],
  );

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) void uploadFiles(e.target.files);
    e.target.value = '';
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (view === 'browse' && e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files);
  };

  // --- Mutations ---
  const createFolder = useMutation({
    mutationFn: (name: string) => filevaultApi.createDirectory(name, dirId),
    onSuccess: () => {
      setToast('Folder created');
      setCreateOpen(false);
      invalidate();
    },
    onError: (err) => setToast(toMessage(err)),
  });

  const renameFolder = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => filevaultApi.renameDirectory(id, name),
    onSuccess: () => {
      setToast('Folder renamed');
      setRenameTarget(null);
      invalidate();
    },
    onError: (err) => setToast(toMessage(err)),
  });

  const moveFolder = useMutation({
    mutationFn: ({ id, dest }: { id: string; dest: string | null }) =>
      filevaultApi.moveDirectory(id, dest),
    onSuccess: () => {
      setToast('Folder moved');
      setMoveTarget(null);
      invalidate();
    },
    onError: (err) => setToast(toMessage(err)),
  });

  const deleteFile = useMutation({
    mutationFn: (id: string) => filevaultApi.deleteFile(id),
    onSuccess: () => invalidate(),
    onError: (err) => setToast(toMessage(err)),
  });

  const restoreFile = useMutation({
    mutationFn: (id: string) => filevaultApi.restoreFile(id),
    onSuccess: () => {
      setToast('File restored');
      invalidate();
    },
    onError: (err) => setToast(toMessage(err)),
  });

  const download = useMutation({
    mutationFn: (item: FileItem) => filevaultApi.download(item),
    onError: (err) => setToast(toMessage(err)),
  });

  // --- Selection / bulk delete ---
  const toggleSel = (key: string) => setSelected((s) => ({ ...s, [key]: !s[key] }));
  const selectedKeys = Object.keys(selected).filter((k) => selected[k]);

  const bulkDelete = useMutation({
    mutationFn: async (keys: string[]) => {
      for (const key of keys) {
        const [kind, id] = key.split(':');
        if (kind === 'f') await filevaultApi.deleteFile(id);
        else await filevaultApi.deleteDirectory(id, true);
      }
    },
    onSuccess: () => {
      setToast('Deleted selected items');
      setSelected({});
      invalidate();
    },
    onError: (err) => setToast(toMessage(err)),
  });

  if (!userId) return <Alert severity="error">Not signed in.</Alert>;

  const folders = searching ? [] : (explorer.data?.subdirectories ?? []);
  const files =
    view === 'trash'
      ? (trash.data?.files ?? [])
      : searching
        ? (searchQuery.data?.files ?? [])
        : (explorer.data?.files ?? []);
  const activeQuery = view === 'trash' ? trash : searching ? searchQuery : explorer;
  const quotaPct = quota.data ? Math.min(100, parseFloat(quota.data.quota.usedPercentage)) : 0;

  return (
    <Stack spacing={2} sx={{ maxWidth: 1000, mx: 'auto', pb: 6 }}>
      {/* Header */}
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Typography variant="h5">Files</Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={view}
          onChange={(_e, v: View | null) => v && setView(v)}
          sx={{ ml: 1 }}
        >
          <ToggleButton value="browse">My files</ToggleButton>
          <ToggleButton value="trash">Trash</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        {view === 'browse' && (
          <>
            <TextField
              size="small"
              placeholder="Search files…"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant="outlined"
              startIcon={<CreateNewFolderOutlinedIcon />}
              onClick={() => setCreateOpen(true)}
            >
              New folder
            </Button>
            <input ref={inputRef} type="file" hidden multiple onChange={onPick} />
            <Button
              variant="contained"
              startIcon={<UploadFileIcon />}
              onClick={() => inputRef.current?.click()}
            >
              Upload
            </Button>
          </>
        )}
      </Stack>

      {/* Quota bar */}
      {quota.isSuccess && (
        <Box>
          <LinearProgress variant="determinate" value={quotaPct} sx={{ height: 8, borderRadius: 1 }} />
          <Typography variant="caption" color="text.secondary">
            {formatBytes(quota.data.quota.used)} of {formatBytes(quota.data.quota.total)} used (
            {quota.data.quota.usedPercentage}%)
          </Typography>
        </Box>
      )}

      {/* Breadcrumbs (browse only) */}
      {view === 'browse' && searching && (
        <Typography variant="body2" color="text.secondary">
          Search results for “{term.trim()}”
        </Typography>
      )}
      {view === 'browse' && !searching && (
        <Breadcrumbs>
          {crumbs.map((c, i) =>
            i === crumbs.length - 1 ? (
              <Typography key={i} color="text.primary">
                {c.name}
              </Typography>
            ) : (
              <Link
                key={i}
                component="button"
                type="button"
                onClick={() => {
                  setSelected({});
                  setCrumbs((cr) => cr.slice(0, i + 1));
                }}
              >
                {c.name}
              </Link>
            ),
          )}
        </Breadcrumbs>
      )}

      {/* Bulk actions */}
      {selectedKeys.length > 0 && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2">{selectedKeys.length} selected</Typography>
          <Button
            size="small"
            color="error"
            startIcon={<DeleteOutlineIcon />}
            disabled={bulkDelete.isPending}
            onClick={() => {
              if (window.confirm(`Delete ${selectedKeys.length} item(s)? Folders delete their contents.`)) {
                bulkDelete.mutate(selectedKeys);
              }
            }}
          >
            Delete selected
          </Button>
        </Stack>
      )}

      {/* Upload progress */}
      {uploads.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5 }}>
          <Stack spacing={0.5}>
            {uploads.some((u) => u.status === 'uploading') && <LinearProgress />}
            {uploads.map((u, i) => (
              <Stack key={i} direction="row" spacing={1} alignItems="center">
                <Typography variant="caption" sx={{ flex: 1, wordBreak: 'break-all' }}>
                  {u.name}
                </Typography>
                <Typography
                  variant="caption"
                  color={u.status === 'error' ? 'error' : u.status === 'done' ? 'success.main' : 'text.secondary'}
                >
                  {u.status === 'uploading' ? 'Uploading…' : u.status === 'done' ? 'Done' : (u.error ?? 'Failed')}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>
      )}

      {/* Content / dropzone */}
      <Box
        onDragOver={(e) => {
          if (view === 'browse') {
            e.preventDefault();
            setDragActive(true);
          }
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        sx={{
          borderRadius: 1,
          outline: dragActive ? '2px dashed' : 'none',
          outlineColor: 'primary.main',
          outlineOffset: -4,
          transition: 'outline 120ms',
          minHeight: 120,
        }}
      >
        {activeQuery.isLoading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress size={28} />
          </Box>
        )}
        {activeQuery.isError && <Alert severity="error">{toMessage(activeQuery.error)}</Alert>}

        {activeQuery.isSuccess && folders.length === 0 && files.length === 0 ? (
          <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
            <InsertDriveFileOutlinedIcon sx={{ fontSize: 48, color: 'text.disabled' }} />
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {view === 'trash'
                ? 'Trash is empty.'
                : searching
                  ? 'No files match your search.'
                  : 'This folder is empty. Upload files or drag them here.'}
            </Typography>
          </Paper>
        ) : (
          (folders.length > 0 || files.length > 0) && (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell>Name</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell align="right">Size</TableCell>
                    <TableCell>{view === 'trash' ? 'Deleted' : 'Modified'}</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {/* Folders (browse only) */}
                  {view === 'browse' &&
                    folders.map((d) => {
                      const key = `d:${d.id}`;
                      return (
                        <TableRow key={key} hover>
                          <TableCell padding="checkbox">
                            <Checkbox
                              size="small"
                              checked={!!selected[key]}
                              onChange={() => toggleSel(key)}
                            />
                          </TableCell>
                          <TableCell>
                            <Link
                              component="button"
                              type="button"
                              underline="hover"
                              sx={{ display: 'flex', alignItems: 'center', gap: 1, textAlign: 'left' }}
                              onClick={() => {
                                setSelected({});
                                setCrumbs((c) => [...c, { id: d.id, name: d.name }]);
                              }}
                            >
                              <FolderOutlinedIcon fontSize="small" color="primary" />
                              <span style={{ wordBreak: 'break-all' }}>{d.name}</span>
                            </Link>
                          </TableCell>
                          <TableCell sx={{ color: 'text.secondary' }}>Folder</TableCell>
                          <TableCell align="right">—</TableCell>
                          <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                            {formatDate(d.updatedAt || d.createdAt)}
                          </TableCell>
                          <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                            <Tooltip title="Rename">
                              <IconButton size="small" onClick={() => setRenameTarget(d)}>
                                <DriveFileRenameOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Move">
                              <IconButton size="small" onClick={() => setMoveTarget(d)}>
                                <DriveFileMoveOutlinedIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Delete folder “${d.name}” and all its contents?`,
                                    )
                                  ) {
                                    filevaultApi
                                      .deleteDirectory(d.id, true)
                                      .then(() => {
                                        setToast('Folder deleted');
                                        invalidate();
                                      })
                                      .catch((err) => setToast(toMessage(err)));
                                  }
                                }}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                  {/* Files */}
                  {files.map((f) => {
                    const key = `f:${f.id}`;
                    const busy =
                      (download.isPending && download.variables?.id === f.id) ||
                      (deleteFile.isPending && deleteFile.variables === f.id) ||
                      (restoreFile.isPending && restoreFile.variables === f.id);
                    return (
                      <TableRow key={key} hover>
                        <TableCell padding="checkbox">
                          <Checkbox
                            size="small"
                            checked={!!selected[key]}
                            onChange={() => toggleSel(key)}
                            disabled={view === 'trash'}
                          />
                        </TableCell>
                        <TableCell>
                          {view === 'trash' ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <InsertDriveFileOutlinedIcon fontSize="small" color="action" />
                              <span style={{ wordBreak: 'break-all' }}>{f.name}</span>
                            </Box>
                          ) : (
                            <Link
                              component="button"
                              type="button"
                              underline="hover"
                              sx={{ display: 'flex', alignItems: 'center', gap: 1, textAlign: 'left' }}
                              onClick={() => setPreviewTarget(f)}
                            >
                              <InsertDriveFileOutlinedIcon fontSize="small" color="action" />
                              <span style={{ wordBreak: 'break-all' }}>{f.name}</span>
                            </Link>
                          )}
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>{f.mimetype ?? '—'}</TableCell>
                        <TableCell align="right">{formatBytes(f.size)}</TableCell>
                        <TableCell sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
                          {formatDate(view === 'trash' ? f.deletedAt : f.updatedAt || f.createdAt)}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {busy ? (
                            <CircularProgress size={18} sx={{ mx: 1.5 }} />
                          ) : view === 'trash' ? (
                            <Tooltip title="Restore">
                              <IconButton size="small" onClick={() => restoreFile.mutate(f.id)}>
                                <RestoreFromTrashIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : (
                            <>
                              <Tooltip title="Download">
                                <IconButton size="small" onClick={() => download.mutate(f)}>
                                  <DownloadIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Versions">
                                <IconButton size="small" onClick={() => setVersionTarget(f)}>
                                  <HistoryIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Share">
                                <IconButton size="small" onClick={() => setShareTarget(f)}>
                                  <ShareOutlinedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete">
                                <IconButton
                                  size="small"
                                  color="error"
                                  onClick={() => {
                                    if (window.confirm(`Delete “${f.name}”? It moves to Trash.`)) {
                                      deleteFile.mutate(f.id, {
                                        onSuccess: () => setToast(`Deleted “${f.name}”`),
                                      });
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
      </Box>

      {/* Dialogs */}
      {createOpen && (
        <NameDialog
          title="New folder"
          label="Folder name"
          confirmLabel="Create"
          open={createOpen}
          busy={createFolder.isPending}
          onClose={() => setCreateOpen(false)}
          onSubmit={(name) => createFolder.mutate(name)}
        />
      )}
      {renameTarget && (
        <NameDialog
          title="Rename folder"
          label="New name"
          initial={renameTarget.name}
          confirmLabel="Rename"
          open={!!renameTarget}
          busy={renameFolder.isPending}
          onClose={() => setRenameTarget(null)}
          onSubmit={(name) => renameFolder.mutate({ id: renameTarget.id, name })}
        />
      )}
      {moveTarget && (
        <MoveDialog
          title={`Move “${moveTarget.name}” to…`}
          open={!!moveTarget}
          excludeDirectoryId={moveTarget.id}
          busy={moveFolder.isPending}
          onClose={() => setMoveTarget(null)}
          onMove={(dest) => moveFolder.mutate({ id: moveTarget.id, dest })}
        />
      )}
      {previewTarget && (
        <FilePreview
          file={previewTarget}
          open={!!previewTarget}
          onClose={() => setPreviewTarget(null)}
          onDownload={(f) => download.mutate(f)}
          onShare={(f) => {
            setPreviewTarget(null);
            setShareTarget(f);
          }}
          onVersions={(f) => {
            setPreviewTarget(null);
            setVersionTarget(f);
          }}
        />
      )}
      {shareTarget && (
        <ShareDialog
          file={shareTarget}
          open={!!shareTarget}
          onClose={() => setShareTarget(null)}
          onToast={setToast}
        />
      )}
      {versionTarget && (
        <VersionHistoryDialog
          file={versionTarget}
          open={!!versionTarget}
          onClose={() => setVersionTarget(null)}
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
