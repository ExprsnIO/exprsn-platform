/**
 * Apps studio (/apps) — the standalone low-code app builder for administrators.
 * Lists the apps the current user may administer (the backend filters by scope
 * authority: platform admins see all; org/group admins see their scope; users
 * see their own), and opens one into the record runtime workspace.
 */
import { useState } from 'react';
import {
  Stack, Box, Paper, Typography, Button, List, ListItemButton, ListItemText,
  Chip, CircularProgress, Alert, Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { lowcodeApi, type LcApp } from '@/api/lowcode';
import { toMessage } from '@/lib/errors';
import AppWorkspace from './AppWorkspace';
import CreateAppDialog from './CreateAppDialog';

export function AppsPage() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const appsQ = useQuery({ queryKey: ['lowcode', 'apps'], queryFn: () => lowcodeApi.apps() });
  const apps = appsQ.data?.apps ?? [];
  const selected: LcApp | undefined = apps.find((a) => a.id === selectedId) ?? apps[0];

  return (
    <Stack spacing={3}>
      <Stack direction="row" alignItems="center">
        <Box>
          <Typography variant="h5" gutterBottom>Apps</Typography>
          <Typography variant="body2" color="text.secondary">Build and run low-code apps you administer.</Typography>
        </Box>
        <Box sx={{ flex: 1 }} />
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
    </Stack>
  );
}
