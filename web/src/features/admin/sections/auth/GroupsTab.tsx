import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, IconButton, Stack, Tooltip } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { authAdminApi } from '@/api/admin/auth';
import { DataTable, PermBadges, QueryState } from '@/features/admin/ui';
import { AdvancedGroupDialog } from './shared';

export function GroupsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [create, setCreate] = useState(false);
  const groups = useQuery({ queryKey: ['auth', 'groups', 'all'], queryFn: () => authAdminApi.listGroups() });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['auth', 'groups', 'all'] });

  const deleteMut = useMutation({
    mutationFn: (id: string) => authAdminApi.deleteGroup(id),
    onSuccess: () => { onToast('Group deleted'); invalidate(); },
    onError: (e) => onToast((e as Error).message),
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={() => setCreate(true)}>New group</Button>
      </Stack>
      <QueryState query={groups} empty="No groups.">
        {(d) => (
          <DataTable
            rows={d.groups ?? []}
            rowKey={(g) => g.id}
            tableId="auth.groups"
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'description', header: 'Description', render: (g) => g.description ?? '—' },
              {
                key: 'scope',
                header: 'Scope',
                render: (g) => (g.organizationId ? 'org' : 'global'),
                sortValue: (g) => (g.organizationId ? 'org' : 'global'),
                filterValue: (g) => (g.organizationId ? 'org' : 'global'),
              },
              {
                key: 'permissions',
                header: 'Base perms',
                render: (g) => <PermBadges perms={(g.permissions as Record<string, boolean>) ?? {}} />,
                filterValue: (g) => Object.entries((g.permissions as Record<string, boolean>) ?? {}).filter(([, v]) => v).map(([k]) => k).join(' '),
              },
              {
                key: 'members',
                header: 'Members',
                align: 'right',
                render: (g) => g.members?.length ?? 0,
                sortValue: (g) => g.members?.length ?? 0,
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                locked: true,
                render: (g) => (
                  <Tooltip title="Delete group">
                    <IconButton size="small" color="error" onClick={() => deleteMut.mutate(g.id)}><DeleteIcon fontSize="small" /></IconButton>
                  </Tooltip>
                ),
              },
            ]}
          />
        )}
      </QueryState>

      <AdvancedGroupDialog open={create} onClose={() => setCreate(false)} onDone={onToast} />
    </Stack>
  );
}
