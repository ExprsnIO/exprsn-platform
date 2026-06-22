import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import BlockIcon from '@mui/icons-material/Block';
import RefreshIcon from '@mui/icons-material/Refresh';
import { caAdminApi, type IssueCertInput, type GenerateTokenInput } from '@/api/admin/ca';
import { caApi, type Certificate, type CaToken } from '@/api/ca';
import { formatDate } from '@/features/files/util';
import {
  Card,
  ConfigSectionEditor,
  DataTable,
  DataView,
  JsonDialog,
  PermBadges,
  QueryState,
  SectionHeader,
  StatCard,
  StatusChip,
  useToast,
} from '../ui';

/* --------------------------------------------------------------- overview */

function OverviewTab() {
  const stats = useQuery({ queryKey: ['ca', 'admin', 'stats'], queryFn: caAdminApi.stats });
  const activity = useQuery({
    queryKey: ['ca', 'admin', 'activity'],
    queryFn: () => caAdminApi.activity({ limit: 25 }),
  });

  // Shape: { certificates: {total,active,revoked,…}, tokens: {total,active,…}, users?: {total} }
  const s = (stats.data ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const n = (group: string, key: string) => {
    const v = s[group]?.[key];
    if (typeof v === 'number') return v;
    if (v == null || typeof v === 'object') return undefined;
    return Number(v) || String(v);
  };

  return (
    <Stack spacing={2}>
      <QueryState query={stats}>
        {() => (
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <StatCard label="Certificates" value={n('certificates', 'total')} />
            <StatCard label="Active certs" value={n('certificates', 'active')} />
            <StatCard label="Revoked certs" value={n('certificates', 'revoked')} />
            <StatCard label="Tokens" value={n('tokens', 'total')} />
            <StatCard label="Active tokens" value={n('tokens', 'active')} />
            <StatCard label="Users" value={n('users', 'total')} />
          </Stack>
        )}
      </QueryState>
      <Card title="Recent activity">
        <QueryState query={activity} empty="No recent activity.">
          {(d) => (
            <DataTable
              rows={d.activities ?? d.activity ?? d.data ?? []}
              rowKey={(r, i) => String(r.id ?? i)}
              columns={[
                { key: 'type', header: 'Type', render: (r) => r.type ?? r.action ?? '—' },
                { key: 'description', header: 'Description', render: (r) => r.description ?? '—' },
                { key: 'createdAt', header: 'When', render: (r) => formatDate(r.createdAt) },
              ]}
            />
          )}
        </QueryState>
      </Card>
    </Stack>
  );
}

/* ------------------------------------------------------------ certificates */

const CERT_TYPES = ['entity', 'san', 'code_signing', 'client', 'server'];

function IssueCertDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<IssueCertInput>({ type: 'entity', commonName: '', keySize: 2048, validityDays: 365 });
  const mut = useMutation({
    mutationFn: () => caAdminApi.issueCertificate(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ca', 'admin', 'certificates'] });
      onDone('Certificate issued');
      onClose();
    },
    onError: (e) => onDone(`Issue failed: ${(e as Error).message}`),
  });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Issue certificate</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {CERT_TYPES.map((t) => (
              <MenuItem key={t} value={t}>{t}</MenuItem>
            ))}
          </TextField>
          <TextField label="Common name" required value={form.commonName} onChange={(e) => setForm({ ...form, commonName: e.target.value })} />
          <TextField label="Organization" value={form.organization ?? ''} onChange={(e) => setForm({ ...form, organization: e.target.value })} />
          <Stack direction="row" spacing={2}>
            <TextField select label="Key size" value={form.keySize} onChange={(e) => setForm({ ...form, keySize: Number(e.target.value) })} sx={{ flex: 1 }}>
              {[2048, 4096].map((k) => (
                <MenuItem key={k} value={k}>{k}</MenuItem>
              ))}
            </TextField>
            <TextField label="Validity (days)" type="number" value={form.validityDays} onChange={(e) => setForm({ ...form, validityDays: Number(e.target.value) })} sx={{ flex: 1 }} />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!form.commonName || mut.isPending} onClick={() => mut.mutate()}>
          Issue
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CertificatesTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [issueOpen, setIssueOpen] = useState(false);
  const query = useQuery({
    queryKey: ['ca', 'admin', 'certificates'],
    queryFn: () => caAdminApi.listCertificates({ limit: 100 }),
  });
  const download = useMutation({ mutationFn: (c: Certificate) => caApi.downloadCertificate(c), onError: (e) => onToast((e as Error).message) });
  const revoke = useMutation({
    mutationFn: (c: Certificate) => caAdminApi.revokeCertificate(c.id, 'Revoked from admin console'),
    onSuccess: () => {
      onToast('Certificate revoked');
      qc.invalidateQueries({ queryKey: ['ca', 'admin', 'certificates'] });
    },
    onError: (e) => onToast((e as Error).message),
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={() => setIssueOpen(true)}>Issue certificate</Button>
      </Stack>
      <QueryState query={query}>
        {(d) => (
          <DataTable
            rows={d.certificates}
            rowKey={(c) => c.id}
            columns={[
              { key: 'commonName', header: 'Common name', render: (c) => c.commonName ?? '—' },
              { key: 'type', header: 'Type' },
              { key: 'serialNumber', header: 'Serial', mono: true, render: (c) => `${c.serialNumber?.slice(0, 16) ?? ''}…` },
              { key: 'status', header: 'Status', render: (c) => <StatusChip status={c.status} /> },
              { key: 'notAfter', header: 'Expires', render: (c) => formatDate(c.notAfter) },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (c) => (
                  <>
                    <Tooltip title="Download PEM">
                      <IconButton size="small" onClick={() => download.mutate(c)}><DownloadIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Revoke">
                      <span>
                        <IconButton size="small" color="error" disabled={c.status !== 'active'} onClick={() => { if (confirm(`Revoke “${c.commonName}”?`)) revoke.mutate(c); }}>
                          <BlockIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <IssueCertDialog open={issueOpen} onClose={() => setIssueOpen(false)} onDone={onToast} />
    </Stack>
  );
}

/* ----------------------------------------------------------------- tokens */

function GenerateTokenDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<GenerateTokenInput>({ certificateId: '', resourceType: 'service', resourceValue: '*', expiryType: 'time', expiryValue: 3600, permissions: { read: true } });
  const mut = useMutation({
    mutationFn: () => caAdminApi.generateToken(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ca', 'admin', 'tokens'] });
      onDone('Token generated');
      onClose();
    },
    onError: (e) => onDone(`Generate failed: ${(e as Error).message}`),
  });
  const togglePerm = (k: string) => setForm({ ...form, permissions: { ...form.permissions, [k]: !form.permissions?.[k] } });
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Generate token</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Certificate ID (UUID)" required value={form.certificateId} onChange={(e) => setForm({ ...form, certificateId: e.target.value })} />
          <Stack direction="row" spacing={2}>
            <TextField label="Resource type" value={form.resourceType} onChange={(e) => setForm({ ...form, resourceType: e.target.value })} sx={{ flex: 1 }} />
            <TextField label="Resource value" value={form.resourceValue} onChange={(e) => setForm({ ...form, resourceValue: e.target.value })} sx={{ flex: 1 }} />
          </Stack>
          <TextField label="Expiry (seconds)" type="number" value={form.expiryValue} onChange={(e) => setForm({ ...form, expiryValue: Number(e.target.value) })} />
          <Stack direction="row" spacing={1}>
            {['read', 'write', 'update', 'delete', 'admin'].map((p) => (
              <Button key={p} size="small" variant={form.permissions?.[p] ? 'contained' : 'outlined'} onClick={() => togglePerm(p)}>{p}</Button>
            ))}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!form.certificateId || mut.isPending} onClick={() => mut.mutate()}>Generate</Button>
      </DialogActions>
    </Dialog>
  );
}

function TokensTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [genOpen, setGenOpen] = useState(false);
  const query = useQuery({ queryKey: ['ca', 'admin', 'tokens'], queryFn: () => caAdminApi.listTokens({ limit: 100 }) });
  const revoke = useMutation({
    mutationFn: (t: CaToken) => caAdminApi.revokeToken(t.id, 'Revoked from admin console'),
    onSuccess: () => {
      onToast('Token revoked');
      qc.invalidateQueries({ queryKey: ['ca', 'admin', 'tokens'] });
    },
    onError: (e) => onToast((e as Error).message),
  });
  const validate = useMutation({
    mutationFn: (t: CaToken) => caAdminApi.validateToken(t.id),
    onSuccess: (d) => onToast(`Validate: ${JSON.stringify(d).slice(0, 120)}`),
    onError: (e) => onToast((e as Error).message),
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={() => setGenOpen(true)}>Generate token</Button>
      </Stack>
      <QueryState query={query}>
        {(d) => (
          <DataTable
            rows={d.tokens}
            rowKey={(t) => t.id}
            columns={[
              { key: 'id', header: 'Token', mono: true, render: (t) => `${t.id.slice(0, 8)}…` },
              {
                key: 'perms',
                header: 'Permissions',
                render: (t) => (
                  <PermBadges perms={{ read: t.permissionRead, write: t.permissionWrite, append: t.permissionAppend, update: t.permissionUpdate, delete: t.permissionDelete }} />
                ),
              },
              { key: 'resource', header: 'Resource', mono: true, render: (t) => `${t.resourceType ?? ''}:${t.resourceValue ?? ''}` },
              { key: 'status', header: 'Status', render: (t) => <StatusChip status={t.status} /> },
              { key: 'expiresAt', header: 'Expires', render: (t) => (t.expiryType === 'time' ? formatDate(t.expiresAt) : t.expiryType ?? '—') },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (t) => (
                  <>
                    <Tooltip title="Validate"><IconButton size="small" onClick={() => validate.mutate(t)}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Revoke">
                      <span>
                        <IconButton size="small" color="error" disabled={t.status !== 'active'} onClick={() => { if (confirm(`Revoke token ${t.id.slice(0, 8)}…?`)) revoke.mutate(t); }}>
                          <BlockIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <GenerateTokenDialog open={genOpen} onClose={() => setGenOpen(false)} onDone={onToast} />
    </Stack>
  );
}

/* -------------------------------------------------------------- directory */

function DirectoryTab() {
  const users = useQuery({ queryKey: ['ca', 'admin', 'users'], queryFn: () => caAdminApi.listUsers({ limit: 100 }) });
  const groups = useQuery({ queryKey: ['ca', 'admin', 'groups'], queryFn: caAdminApi.listGroups });
  const roles = useQuery({ queryKey: ['ca', 'admin', 'roles'], queryFn: caAdminApi.listRoles });
  return (
    <Stack spacing={2}>
      <Card title="Users">
        <QueryState query={users} empty="No users (ca.users is unseeded in this deployment).">
          {(d) => (
            <DataTable
              rows={d.users}
              rowKey={(u) => u.id}
              columns={[
                { key: 'username', header: 'Username', render: (u) => u.username ?? '—' },
                { key: 'email', header: 'Email', render: (u) => u.email ?? '—' },
                { key: 'status', header: 'Status', render: (u) => <StatusChip status={u.status} /> },
                { key: 'createdAt', header: 'Created', render: (u) => formatDate(u.createdAt) },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <Card title="Groups">
        <QueryState query={groups} empty="No groups.">
          {(d) => (
            <DataTable rows={d.groups} rowKey={(g, i) => String(g.id ?? i)} columns={[{ key: 'name', header: 'Name', render: (g) => String(g.name ?? g.id ?? '—') }]} />
          )}
        </QueryState>
      </Card>
      <Card title="Roles">
        <QueryState query={roles} empty="No roles.">
          {(d) => (
            <DataTable rows={d.roles} rowKey={(r, i) => String(r.id ?? i)} columns={[{ key: 'name', header: 'Name', render: (r) => String(r.name ?? r.id ?? '—') }]} />
          )}
        </QueryState>
      </Card>
    </Stack>
  );
}

/* ------------------------------------------------------------- ocsp / crl */

function PkiTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const ocsp = useQuery({ queryKey: ['ca', 'admin', 'ocsp'], queryFn: caAdminApi.ocspStatus });
  const crl = useQuery({ queryKey: ['ca', 'admin', 'crl'], queryFn: caAdminApi.crlStatus });
  const gen = useMutation({
    mutationFn: caAdminApi.generateCrl,
    onSuccess: () => {
      onToast('CRL generated');
      qc.invalidateQueries({ queryKey: ['ca', 'admin', 'crl'] });
    },
    onError: (e) => onToast((e as Error).message),
  });
  return (
    <Stack spacing={2}>
      <Card title="OCSP responder" actions={<Button size="small" onClick={() => setView({ title: 'OCSP status', value: ocsp.data })} disabled={!ocsp.data}>View raw</Button>}>
        <QueryState query={ocsp}>{(d) => <DataView value={d} />}</QueryState>
      </Card>
      <Card title="Certificate Revocation List" actions={<Button size="small" variant="contained" onClick={() => gen.mutate()} disabled={gen.isPending}>Generate CRL</Button>}>
        <QueryState query={crl}>{(d) => <DataView value={d} />}</QueryState>
      </Card>
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

/* ------------------------------------------------------------------ config */

function ConfigTab() {
  const cfg = useQuery({ queryKey: ['ca', 'admin', 'config'], queryFn: caAdminApi.getConfig });
  return (
    <Stack spacing={2}>
      <Card title="Masked configuration">
        <QueryState query={cfg}>{(d) => <DataView value={d} />}</QueryState>
      </Card>
      <ConfigSectionEditor
        sections={['__updates__']}
        load={async () => (await caAdminApi.getConfig())}
        save={async (_s, data) => caAdminApi.updateConfig(data as Record<string, unknown>)}
      />
    </Stack>
  );
}

/* ------------------------------------------------------------------- page */

const TABS = ['overview', 'certificates', 'tokens', 'directory', 'pki', 'config'] as const;
type CaTab = (typeof TABS)[number];

export function CaSection() {
  const [tab, setTab] = useState<CaTab>('overview');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Certificate Authority" subtitle="Certificates, tokens, OCSP/CRL and directory — /ca/admin/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab value="overview" label="Overview" />
        <Tab value="certificates" label="Certificates" />
        <Tab value="tokens" label="Tokens" />
        <Tab value="directory" label="Directory" />
        <Tab value="pki" label="OCSP / CRL" />
        <Tab value="config" label="Config" />
      </Tabs>
      {tab === 'overview' && <OverviewTab />}
      {tab === 'certificates' && <CertificatesTab onToast={showToast} />}
      {tab === 'tokens' && <TokensTab onToast={showToast} />}
      {tab === 'directory' && <DirectoryTab />}
      {tab === 'pki' && <PkiTab onToast={showToast} />}
      {tab === 'config' && <ConfigTab />}
      {ToastHost}
    </Stack>
  );
}
