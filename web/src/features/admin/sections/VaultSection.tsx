import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import PauseIcon from '@mui/icons-material/Pause';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import DeleteIcon from '@mui/icons-material/Delete';
import {
  vaultAdminApi,
  VAULT_CONFIG_SECTIONS,
  type VaultToken,
  type Policy,
  type VaultKey,
  type AuditLog,
  type Lease,
  type Secret,
} from '@/api/admin/vault';
import { formatDate } from '@/features/files/util';
import { Card, ConfigSectionEditor, DataTable, DataView, JsonDialog, PermBadges, QueryState, SectionHeader, StatCard, StatusChip, useToast } from '../ui';

function arr<T>(d: Record<string, unknown>, ...keys: string[]): T[] {
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as T[];
  return [];
}

/* ----------------------------------------------------------------- tabs */

function OverviewTab() {
  const stats = useQuery({ queryKey: ['vault', 'dash'], queryFn: vaultAdminApi.dashboardStats });
  // Shape: { success, data: { tokens:{total,byStatus}, secrets:{total}, keys:{total}, risk:{...} } }
  const raw = (stats.data ?? {}) as Record<string, unknown>;
  const d = ((raw.data as Record<string, Record<string, unknown> | undefined>) ?? (raw as Record<string, Record<string, unknown> | undefined>));
  const n = (group: string, key = 'total') => {
    const v = d[group]?.[key];
    return typeof v === 'number' ? v : v == null ? undefined : Number(v) || undefined;
  };
  const risk = (d.risk ?? {}) as Record<string, unknown>;
  return (
    <QueryState query={stats}>
      {() => (
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <StatCard label="Tokens" value={n('tokens')} />
          <StatCard label="Secrets" value={n('secrets')} />
          <StatCard label="Keys" value={n('keys')} />
          <StatCard label="High risk" value={risk.high as number} />
          <StatCard label="Medium risk" value={risk.medium as number} />
          <StatCard label="Low risk" value={risk.low as number} />
        </Stack>
      )}
    </QueryState>
  );
}

function TokensTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const query = useQuery({ queryKey: ['vault', 'tokens'], queryFn: () => vaultAdminApi.listTokens({ limit: 100 }) });
  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); qc.invalidateQueries({ queryKey: ['vault', 'tokens'] }); }).catch((e) => onToast((e as Error).message));
  return (
    <Stack spacing={2}>
      <QueryState query={query} empty="No vault tokens.">
        {(d) => (
          <DataTable
            rows={arr<VaultToken>(d, 'tokens', 'data')}
            rowKey={(t) => t.id}
            columns={[
              { key: 'displayName', header: 'Name', render: (t) => t.displayName ?? '—' },
              { key: 'entity', header: 'Entity', render: (t) => `${t.entityType ?? ''}:${(t.entityId ?? '').slice(0, 8)}` },
              { key: 'perms', header: 'Perms', render: (t) => <PermBadges perms={t.permissions ?? {}} /> },
              { key: 'status', header: 'Status', render: (t) => <StatusChip status={t.status} /> },
              { key: 'expiresAt', header: 'Expires', render: (t) => formatDate(t.expiresAt) },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (t) => (
                  <>
                    <Tooltip title="Anomalies"><IconButton size="small" onClick={() => vaultAdminApi.tokenAnomalies(t.id).then((v) => setView({ title: 'Anomalies', value: v })).catch((e) => onToast((e as Error).message))}>!</IconButton></Tooltip>
                    <Tooltip title="Suspend"><IconButton size="small" onClick={() => act(() => vaultAdminApi.suspendToken(t.id), 'Suspended')}><PauseIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Reactivate"><IconButton size="small" onClick={() => act(() => vaultAdminApi.reactivateToken(t.id), 'Reactivated')}><PlayArrowIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Revoke"><IconButton size="small" color="error" onClick={() => { if (confirm('Revoke token?')) act(() => vaultAdminApi.revokeToken(t.id, 'Revoked from admin console'), 'Revoked'); }}><BlockIcon fontSize="small" /></IconButton></Tooltip>
                  </>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

function PoliciesTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState('{\n  "name": "",\n  "policyType": "secret",\n  "rules": {}\n}');
  const query = useQuery({ queryKey: ['vault', 'policies'], queryFn: () => vaultAdminApi.listPolicies() });
  const create = useMutation({
    mutationFn: () => vaultAdminApi.createPolicy(JSON.parse(json)),
    onSuccess: () => { onToast('Policy created'); setOpen(false); qc.invalidateQueries({ queryKey: ['vault', 'policies'] }); },
    onError: (e) => onToast((e as Error).message),
  });
  const del = (id: string) => vaultAdminApi.deletePolicy(id).then(() => { onToast('Policy deleted'); qc.invalidateQueries({ queryKey: ['vault', 'policies'] }); }).catch((e) => onToast((e as Error).message));
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end"><Button variant="contained" onClick={() => setOpen(true)}>New policy</Button></Stack>
      <QueryState query={query} empty="No policies.">
        {(d) => (
          <DataTable
            rows={arr<Policy>(d, 'policies', 'data')}
            rowKey={(p) => p.id}
            columns={[
              { key: 'name', header: 'Name', render: (p) => p.name ?? '—' },
              { key: 'policyType', header: 'Type', render: (p) => p.policyType ?? '—' },
              { key: 'priority', header: 'Priority', align: 'right', render: (p) => p.priority ?? '—' },
              { key: 'enforcementMode', header: 'Mode', render: (p) => p.enforcementMode ?? '—' },
              { key: 'status', header: 'Status', render: (p) => <StatusChip status={p.status} /> },
              { key: 'del', header: '', align: 'right', render: (p) => <IconButton size="small" color="error" onClick={() => del(p.id)}><DeleteIcon fontSize="small" /></IconButton> },
            ]}
          />
        )}
      </QueryState>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create policy</DialogTitle>
        <DialogContent>
          <TextField fullWidth multiline minRows={8} value={json} onChange={(e) => setJson(e.target.value)} inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={create.isPending} onClick={() => create.mutate()}>Create</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function InventoryTab() {
  const secrets = useQuery({ queryKey: ['vault', 'secrets'], queryFn: vaultAdminApi.listSecrets });
  const keys = useQuery({ queryKey: ['vault', 'keys'], queryFn: () => vaultAdminApi.listKeys() });
  const creds = useQuery({ queryKey: ['vault', 'creds'], queryFn: () => vaultAdminApi.listCredentials() });
  const leases = useQuery({ queryKey: ['vault', 'leases'], queryFn: () => vaultAdminApi.listLeases() });
  return (
    <Stack spacing={2}>
      <Card title="Secrets (metadata)">
        <QueryState query={secrets} empty="No secrets.">
          {(d) => (
            <DataTable
              rows={arr<Secret>(d as Record<string, unknown>, 'data')}
              rowKey={(s) => s.id}
              columns={[
                { key: 'path', header: 'Path', mono: true },
                { key: 'key', header: 'Key' },
                { key: 'version', header: 'Ver', align: 'right', render: (s) => s.version ?? '—' },
                { key: 'status', header: 'Status', render: (s) => <StatusChip status={s.status} /> },
                { key: 'updatedAt', header: 'Updated', render: (s) => formatDate(s.updatedAt) },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <Card title="Encryption keys">
        <QueryState query={keys} empty="No keys.">
          {(d) => (
            <DataTable
              rows={arr<VaultKey>(d, 'keys', 'data')}
              rowKey={(k) => k.id}
              columns={[
                { key: 'name', header: 'Name', render: (k) => k.name ?? '—' },
                { key: 'purpose', header: 'Purpose', render: (k) => k.purpose ?? '—' },
                { key: 'status', header: 'Status', render: (k) => <StatusChip status={k.status} /> },
                { key: 'createdAt', header: 'Created', render: (k) => formatDate(k.createdAt) },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <Card title="Dynamic leases">
        <QueryState query={leases} empty="No active leases.">
          {(d) => (
            <DataTable
              rows={arr<Lease>(d, 'leases', 'data')}
              rowKey={(l, i) => String(l.leaseId ?? l.id ?? i)}
              columns={[
                { key: 'leaseId', header: 'Lease', mono: true, render: (l) => String(l.leaseId ?? l.id ?? '—') },
                { key: 'secretType', header: 'Type', render: (l) => l.secretType ?? '—' },
                { key: 'status', header: 'Status', render: (l) => <StatusChip status={l.status} /> },
                { key: 'expiresAt', header: 'Expires', render: (l) => formatDate(l.expiresAt) },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <Card title="Credentials">
        <QueryState query={creds} empty="No credentials.">
          {(d) => (
            <DataTable
              rows={arr<Record<string, unknown>>(d, 'credentials', 'data')}
              rowKey={(c, i) => String(c.id ?? i)}
              columns={[
                { key: 'service', header: 'Service', render: (c) => String(c.service ?? '—') },
                { key: 'name', header: 'Name', render: (c) => String(c.name ?? c.username ?? '—') },
                { key: 'status', header: 'Status', render: (c) => <StatusChip status={c.status as string} /> },
              ]}
            />
          )}
        </QueryState>
      </Card>
    </Stack>
  );
}

function AuditTab() {
  const logs = useQuery({ queryKey: ['vault', 'audit'], queryFn: () => vaultAdminApi.auditLogs({ limit: 100 }) });
  const stats = useQuery({ queryKey: ['vault', 'auditstats'], queryFn: vaultAdminApi.auditStats });
  return (
    <Stack spacing={2}>
      <Card title="Audit stats">
        <QueryState query={stats}>{(d) => <DataView value={d} />}</QueryState>
      </Card>
      <Card title="Audit log">
        <QueryState query={logs} empty="No audit entries.">
          {(d) => (
            <DataTable
              rows={arr<AuditLog>(d, 'logs', 'data')}
              rowKey={(l, i) => String(l.id ?? i)}
              columns={[
                { key: 'action', header: 'Action', render: (l) => l.action ?? '—' },
                { key: 'actor', header: 'Actor', mono: true, render: (l) => (l.actor ?? '—').toString().slice(0, 12) },
                { key: 'resourcePath', header: 'Resource', mono: true, render: (l) => l.resourcePath ?? l.resourceType ?? '—' },
                { key: 'success', header: 'OK', render: (l) => (l.success ? '✓' : '✗') },
                { key: 'createdAt', header: 'When', render: (l) => formatDate(l.createdAt) },
              ]}
            />
          )}
        </QueryState>
      </Card>
    </Stack>
  );
}

function MaintenanceTab({ onToast }: { onToast: (m: string) => void }) {
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const run = (fn: () => Promise<unknown>, title: string) =>
    fn().then((v) => setView({ title, value: v ?? { ok: true } })).catch((e) => onToast((e as Error).message));
  return (
    <Stack spacing={2}>
      <Alert severity="warning">Maintenance operations affect the whole vault. Use with care.</Alert>
      <Card title="Operations">
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button variant="outlined" onClick={() => run(() => vaultAdminApi.accessReport(), 'Access report')}>Access report</Button>
          <Button variant="outlined" color="warning" onClick={() => { if (confirm('Clear vault cache?')) run(() => vaultAdminApi.clearCache(), 'Cache cleared'); }}>Clear cache</Button>
          <Button variant="outlined" color="error" onClick={() => { if (confirm('Purge expired/revoked vault data?')) run(() => vaultAdminApi.purge(), 'Purge complete'); }}>Purge</Button>
        </Stack>
      </Card>
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

/* ------------------------------------------------------------------- page */

type VaultTab = 'overview' | 'tokens' | 'policies' | 'inventory' | 'audit' | 'maintenance' | 'config';

export function VaultSection() {
  const [tab, setTab] = useState<VaultTab>('overview');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Vault" subtitle="Tokens, policies, secrets/keys inventory, audit & maintenance — /vault/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab value="overview" label="Overview" />
        <Tab value="tokens" label="Tokens" />
        <Tab value="policies" label="Policies" />
        <Tab value="inventory" label="Inventory" />
        <Tab value="audit" label="Audit" />
        <Tab value="maintenance" label="Maintenance" />
        <Tab value="config" label="Config" />
      </Tabs>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'tokens' && <TokensTab onToast={showToast} />}
      {tab === 'policies' && <PoliciesTab onToast={showToast} />}
      {tab === 'inventory' && <InventoryTab />}
      {tab === 'audit' && <AuditTab />}
      {tab === 'maintenance' && <MaintenanceTab onToast={showToast} />}
      {tab === 'config' && <ConfigSectionEditor sections={VAULT_CONFIG_SECTIONS} load={(s) => vaultAdminApi.getConfigSection(s)} save={(s, data) => vaultAdminApi.saveConfigSection(s, data)} />}
      {ToastHost}
    </Stack>
  );
}
