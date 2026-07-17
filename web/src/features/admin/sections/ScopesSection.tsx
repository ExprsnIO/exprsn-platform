import { useQuery } from '@tanstack/react-query';
import { Alert, Chip, Stack } from '@mui/material';
import { authAdminApi, type Permission, type Role } from '@/api/admin/auth';
import { Card, DataTable, QueryState, SectionHeader } from '../ui';

/** One row per scope: its permissions and the roles that reference them. */
interface ScopeRow {
  scope: string;
  permissions: Permission[];
  /** Roles whose permission list explicitly names a permission in this scope. */
  explicitRoles: Role[];
  /** Roles carrying the `*` wildcard — they reach every scope implicitly. */
  wildcardRoles: number;
}

/**
 * Standalone Scopes admin — a read view over the permission catalog's scope
 * dimension (`system` / `organization` / `application` / `service`).
 *
 * The auth API has no scope-specific endpoints (GET /roles/permissions only
 * accepts `?scope=` as a filter), so scopes are derived client-side from the
 * permission catalog each permission carries.
 */
export function ScopesSection() {
  const perms = useQuery({ queryKey: ['auth', 'permissions'], queryFn: () => authAdminApi.listPermissions() });
  const roles = useQuery({ queryKey: ['auth', 'roles'], queryFn: () => authAdminApi.listRoles() });
  const roleList = (roles.data?.roles ?? roles.data?.data ?? []) as Role[];
  const wildcardRoles = roleList.filter((r) => (r.permissions ?? []).includes('*')).length;

  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Scopes" subtitle="Permission catalog grouped by scope — derived from /auth/api/roles/permissions" />
      <Card title="Permission scopes">
        <Alert severity="info" sx={{ mb: 1.5 }}>
          Every catalog permission carries a scope (system, organization, application or service).
          Scopes are derived client-side from the catalog — the auth API exposes no scope-specific
          endpoints. Roles listed per scope explicitly name one of its permissions; roles holding
          the <code>*</code> wildcard reach every scope and are counted separately.
        </Alert>
        <QueryState query={perms} empty="No permissions in the catalog.">
          {(d) => {
            const all = (d.permissions ?? d.data ?? []) as Permission[];
            const byScope = new Map<string, Permission[]>();
            for (const p of all) {
              const s = p.scope || 'unscoped';
              if (!byScope.has(s)) byScope.set(s, []);
              byScope.get(s)!.push(p);
            }
            const rows: ScopeRow[] = Array.from(byScope.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([scope, scopePerms]) => {
                const strings = new Set(scopePerms.map((p) => p.permissionString).filter(Boolean));
                return {
                  scope,
                  permissions: scopePerms,
                  explicitRoles: roleList.filter((r) => (r.permissions ?? []).some((ps) => strings.has(ps))),
                  wildcardRoles,
                };
              });
            return (
              <DataTable
                rows={rows}
                rowKey={(r) => r.scope}
                tableId="auth.scopes"
                columns={[
                  { key: 'scope', header: 'Scope', mono: true },
                  {
                    key: 'count',
                    header: 'Permissions',
                    align: 'right',
                    render: (r) => r.permissions.length,
                    sortValue: (r) => r.permissions.length,
                  },
                  {
                    key: 'permissions',
                    header: 'Permissions in scope',
                    render: (r) => (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {r.permissions.slice(0, 8).map((p, i) => (
                          <Chip key={p.permissionString ?? String(p.id ?? i)} size="small" label={p.permissionString ?? '—'} />
                        ))}
                        {r.permissions.length > 8 && <Chip size="small" label={`+${r.permissions.length - 8}`} />}
                      </Stack>
                    ),
                    sortValue: (r) => r.permissions.length,
                    filterValue: (r) => r.permissions.map((p) => p.permissionString ?? '').join(' '),
                  },
                  {
                    key: 'roles',
                    header: 'Roles referencing it',
                    render: (r) => (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {r.explicitRoles.slice(0, 6).map((role) => (
                          <Chip key={role.id} size="small" variant="outlined" label={role.name ?? role.id} />
                        ))}
                        {r.explicitRoles.length > 6 && <Chip size="small" variant="outlined" label={`+${r.explicitRoles.length - 6}`} />}
                        {r.wildcardRoles > 0 && <Chip size="small" color="warning" variant="outlined" label={`+${r.wildcardRoles} via *`} />}
                        {r.explicitRoles.length === 0 && r.wildcardRoles === 0 && '—'}
                      </Stack>
                    ),
                    sortValue: (r) => r.explicitRoles.length,
                    filterValue: (r) => r.explicitRoles.map((role) => role.name ?? '').join(' '),
                  },
                ]}
              />
            );
          }}
        </QueryState>
      </Card>
    </Stack>
  );
}
