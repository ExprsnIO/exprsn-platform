import { Fragment, ReactNode, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Chip, Stack, TextField, Typography } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { authAdminApi, type AuthUser } from '@/api/admin/auth';
import { formatDate } from '@/features/files/util';
import { Card, DataTable, DataView, QueryState, StatusChip } from '@/features/admin/ui';

/**
 * Full user inspector — everything the platform knows about the user:
 * profile, organizations (with member role), groups, roles, resolved
 * permissions, and recent sessions. Backed by GET /users/:id/detail.
 */
function UserDetailView({ user, onBack }: { user: AuthUser; onBack: () => void }) {
  const detail = useQuery({
    queryKey: ['auth', 'user', user.id, 'detail'],
    queryFn: () => authAdminApi.getUserDetail(user.id),
  });
  const d = detail.data;
  const profile = d?.user ?? user;

  const profileRows: Array<[string, ReactNode]> = [
    ['Email', profile.email],
    ['Display name', profile.displayName ?? '—'],
    ['First name', profile.firstName ?? '—'],
    ['Last name', profile.lastName ?? '—'],
    ['Status', <StatusChip key="s" status={profile.status} />],
    ['Email verified', profile.emailVerified ? 'yes' : 'no'],
    ['MFA', profile.mfaEnabled ? 'enabled' : 'off'],
    ['Last login', formatDate(profile.lastLoginAt ?? undefined)],
    ['Created', formatDate(profile.createdAt)],
    ['User ID', <Typography key="id" component="span" sx={{ fontFamily: 'monospace', fontSize: 12 }}>{profile.id}</Typography>],
  ];

  return (
    <Stack spacing={2}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Button startIcon={<ArrowBackIcon />} onClick={onBack}>Users</Button>
        <Typography variant="h6">{profile.email}</Typography>
        <StatusChip status={profile.status} />
      </Stack>

      {detail.isError && <Alert severity="error">Could not load the full user record; showing summary data.</Alert>}

      <Card title="Profile">
        <Stack spacing={0.75} sx={{ display: 'grid', gridTemplateColumns: 'minmax(150px, max-content) 1fr', columnGap: 2.5, rowGap: 0.75, alignItems: 'baseline' }}>
          {profileRows.map(([label, value]) => (
            <Fragment key={label}>
              <Typography component="span" sx={{ color: 'text.secondary', fontSize: 13 }}>{label}</Typography>
              <Typography component="span" sx={{ fontSize: 14 }}>{value}</Typography>
            </Fragment>
          ))}
        </Stack>
      </Card>

      <Card title="Organizations">
        {(d?.organizations?.length ?? 0) === 0 ? (
          <Alert severity="info">Not a member of any organization.</Alert>
        ) : (
          <DataTable
            rows={d!.organizations}
            rowKey={(o) => o.id}
            columns={[
              { key: 'name', header: 'Organization', render: (o) => o.name ?? o.id },
              { key: 'memberRole', header: 'Member role', render: (o) => o.memberRole ?? '—' },
              { key: 'memberStatus', header: 'Membership', render: (o) => <StatusChip status={o.memberStatus ?? undefined} /> },
              { key: 'status', header: 'Org status', render: (o) => <StatusChip status={o.status} /> },
            ]}
          />
        )}
      </Card>

      <Card title="Groups">
        {(d?.groups?.length ?? 0) === 0 ? (
          <Alert severity="info">No group memberships.</Alert>
        ) : (
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {d!.groups.map((g) => (
              <Chip key={g.id} size="small" variant="outlined" label={g.name} title={g.description ?? undefined} />
            ))}
          </Stack>
        )}
      </Card>

      <Card title="Roles">
        {(d?.roles?.length ?? 0) === 0 ? (
          <Alert severity="info">No roles assigned.</Alert>
        ) : (
          <DataTable
            rows={d!.roles}
            rowKey={(r) => r.id}
            columns={[
              { key: 'name', header: 'Role' },
              { key: 'type', header: 'Type', render: (r) => r.type ?? '—' },
              { key: 'scope', header: 'Scope', render: (r) => (r.organizationId ? 'org' : 'global') },
              {
                key: 'permissions',
                header: 'Permissions',
                render: (r) => (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {(r.permissions ?? []).slice(0, 6).map((p) => <Chip key={p} size="small" label={p} />)}
                    {(r.permissions?.length ?? 0) > 6 && <Chip size="small" label={`+${r.permissions!.length - 6}`} />}
                    {(r.permissions?.length ?? 0) === 0 && '—'}
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </Card>

      {d?.permissions != null && (
        <Card title="Resolved permissions">
          <DataView value={d.permissions} />
        </Card>
      )}

      <Card title="Recent sessions">
        {(d?.sessions?.length ?? 0) === 0 ? (
          <Alert severity="info">No sessions recorded.</Alert>
        ) : (
          <DataTable
            rows={d!.sessions}
            rowKey={(s) => s.id}
            columns={[
              { key: 'ipAddress', header: 'IP', mono: true, render: (s) => s.ipAddress ?? '—' },
              { key: 'userAgent', header: 'User agent', render: (s) => (s.userAgent ?? '—').slice(0, 60) },
              { key: 'createdAt', header: 'Started', render: (s) => formatDate(s.createdAt) },
              { key: 'lastActivityAt', header: 'Last active', render: (s) => formatDate(s.lastActivityAt) },
            ]}
          />
        )}
      </Card>
    </Stack>
  );
}

export function UsersTab() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<AuthUser | null>(null);
  const users = useQuery({ queryKey: ['auth', 'users', search], queryFn: () => authAdminApi.listUsers({ limit: 200, search }) });

  // Row click and the Details button both open the full inspector.
  if (view) {
    return <UserDetailView user={view} onBack={() => setView(null)} />;
  }

  return (
    <Stack spacing={2}>
      {/* Server-side search — drives the listUsers query, distinct from the table's client-side search. */}
      <TextField size="small" label="Search by email or name" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ maxWidth: 360 }} />
      <QueryState query={users} empty="No users.">
        {(d) => (
          <DataTable
            rows={d.users ?? []}
            rowKey={(u) => u.id}
            tableId="auth.users"
            onRowClick={(u) => setView(u)}
            columns={[
              { key: 'email', header: 'Email' },
              { key: 'displayName', header: 'Name', render: (u) => u.displayName ?? '—' },
              { key: 'firstName', header: 'First name', defaultHidden: true, render: (u) => u.firstName ?? '—' },
              { key: 'lastName', header: 'Last name', defaultHidden: true, render: (u) => u.lastName ?? '—' },
              {
                key: 'status',
                header: 'Status',
                render: (u) => <StatusChip status={u.status} />,
                sortValue: (u) => u.status ?? '',
                filterValue: (u) => u.status ?? '',
              },
              {
                key: 'emailVerified',
                header: 'Verified',
                render: (u) => (u.emailVerified ? 'yes' : 'no'),
                sortValue: (u) => (u.emailVerified ? 1 : 0),
                filterValue: (u) => (u.emailVerified ? 'yes' : 'no'),
              },
              {
                key: 'mfaEnabled',
                header: 'MFA',
                render: (u) => (u.mfaEnabled ? 'on' : 'off'),
                sortValue: (u) => (u.mfaEnabled ? 1 : 0),
                filterValue: (u) => (u.mfaEnabled ? 'on' : 'off'),
              },
              {
                key: 'lastLoginAt',
                header: 'Last login',
                render: (u) => formatDate(u.lastLoginAt ?? undefined),
                sortValue: (u) => u.lastLoginAt ?? null,
              },
              {
                key: 'createdAt',
                header: 'Created',
                defaultHidden: true,
                render: (u) => formatDate(u.createdAt),
                sortValue: (u) => u.createdAt ?? null,
              },
              { key: 'view', header: '', align: 'right', locked: true, render: (u) => <Button size="small" onClick={() => setView(u)}>Details</Button> },
            ]}
          />
        )}
      </QueryState>
    </Stack>
  );
}
