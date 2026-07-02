/**
 * Apps studio (/apps) — the standalone low-code app builder for administrators.
 * Lists the apps the current user may administer (the backend filters by scope
 * authority: platform admins see all; org/group admins see their scope; users
 * see their own), and opens one into the record runtime workspace.
 */
import { useRef, useState } from 'react';
import {
  Stack, Box, Paper, Typography, Button, List, ListItemButton, ListItemText,
  Chip, CircularProgress, Alert, Divider, Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import FileUploadOutlinedIcon from '@mui/icons-material/FileUploadOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lowcodeApi, type AppBundle, type LcApp } from '@/api/lowcode';
import { toMessage } from '@/lib/errors';
import { useToast } from '@/features/admin/ui';
import AppWorkspace from './AppWorkspace';
import CreateAppDialog from './CreateAppDialog';

export function AppsPage() {
  const qc = useQueryClient();
  const { showToast, showError, ToastHost } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const appsQ = useQuery({ queryKey: ['lowcode', 'apps'], queryFn: () => lowcodeApi.apps() });
  const apps = appsQ.data?.apps ?? [];
  const selected: LcApp | undefined = apps.find((a) => a.id === selectedId) ?? apps[0];

  const exportApp = useMutation({
    mutationFn: (id: string) => lowcodeApi.exportApp(id),
    onSuccess: ({ bundle }) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = `${bundle.app.key}.lowcode.json`; a.click();
      URL.revokeObjectURL(url);
    },
    onError: showError,
  });

  const importApp = useMutation({
    mutationFn: (bundle: AppBundle) => lowcodeApi.importApp({ bundle }),
    onSuccess: (r) => {
      showToast(`Imported "${r.app.name}" (${Object.entries(r.imported).map(([k, v]) => `${v} ${k}`).join(', ')})`, 'success');
      setSelectedId(r.app.id);
      qc.invalidateQueries({ queryKey: ['lowcode', 'apps'] });
    },
    onError: showError,
  });

  const pickBundle = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      // Accept both the download shape ({...bundle}) and a wrapped { bundle }.
      importApp.mutate((parsed.bundle ?? parsed) as AppBundle);
    } catch { showToast('Not a valid app bundle (JSON).', 'error'); }
    if (importRef.current) importRef.current.value = '';
  };

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Box>
          <Typography variant="h5" gutterBottom>Apps</Typography>
          <Typography variant="body2" color="text.secondary">Build and run low-code apps you administer.</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
        {selected && (
          <Tooltip title="Export this app's definition (entities, forms, flows — no records)">
            <Button size="small" variant="outlined" startIcon={<FileDownloadOutlinedIcon />} disabled={exportApp.isPending} onClick={() => exportApp.mutate(selected.id)}>
              Export
            </Button>
          </Tooltip>
        )}
        <Tooltip title="Import an app bundle as a new app">
          <Button size="small" variant="outlined" startIcon={<FileUploadOutlinedIcon />} disabled={importApp.isPending} onClick={() => importRef.current?.click()}>
            Import
          </Button>
        </Tooltip>
        <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={(e) => pickBundle(e.target.files?.[0])} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>New app</Button>
      </Stack>

      {appsQ.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : appsQ.isError ? (
        <Alert severity="error">{toMessage(appsQ.error)}</Alert>
      ) : !apps.length ? (
        <Alert severity="info">You have no apps yet. Create one to get started.</Alert>
      ) : (
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={3} alignItems="flex-start">
          <Paper variant="outlined" sx={{ width: { xs: '100%', md: 260 }, flexShrink: 0 }}>
            <List dense disablePadding>
              {apps.map((a, i) => (
                <Box key={a.id}>
                  {i > 0 && <Divider component="li" />}
                  <ListItemButton selected={selected?.id === a.id} onClick={() => setSelectedId(a.id)}>
                    <ListItemText
                      primary={a.name}
                      secondary={a.key}
                      primaryTypographyProps={{ noWrap: true }}
                      secondaryTypographyProps={{ noWrap: true }}
                    />
                    <Chip size="small" label={String((a as { scopeType?: string }).scopeType ?? 'platform')} />
                  </ListItemButton>
                </Box>
              ))}
            </List>
          </Paper>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            {selected ? <AppWorkspace app={selected} canEdit /> : <Typography color="text.secondary">Select an app.</Typography>}
          </Box>
        </Stack>
      )}

      <CreateAppDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(app) => { setCreateOpen(false); setSelectedId(app.id); qc.invalidateQueries({ queryKey: ['lowcode', 'apps'] }); }}
      />
      {ToastHost}
    </Stack>
  );
}
