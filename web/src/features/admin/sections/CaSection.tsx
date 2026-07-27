import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import BlockIcon from '@mui/icons-material/Block';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  caAdminApi,
  type IssueCertInput,
  type GenerateTokenInput,
  type CertExportFormat,
} from '@/api/admin/ca';
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

/** good → success, revoked → error, unknown → warning. */
const LIVE_STATUS_COLOR: Record<string, 'success' | 'error' | 'warning' | 'default'> = {
  good: 'success',
  valid: 'success',
  active: 'success',
  revoked: 'error',
  unknown: 'warning',
};

/**
 * Live revocation badge for one cert. Polls /ca/api/certificates/:id/status
 * (~30s) so OCSP/CRL state stays fresh without a manual refresh. Stops polling
 * once a cert is revoked (terminal). When both OCSP and CRL responders are
 * disabled it shows "checking disabled" — the per-cert lookup can't validate.
 */
function CertLiveStatus({ cert }: { cert: Certificate }) {
  const q = useQuery({
    queryKey: ['ca', 'admin', 'cert-status', cert.id],
    queryFn: () => caAdminApi.certificateStatus(cert.id),
    refetchInterval: (query) => (query.state.data?.revoked ? false : 30000),
    staleTime: 25000,
  });

  if (q.isLoading) {
    return <Chip size="small" variant="outlined" icon={<CircularProgress size={10} />} label="checking…" />;
  }
  if (q.isError || !q.data) {
    return <Chip size="small" variant="outlined" color="warning" label="unknown" />;
  }

  const d = q.data;
  const ocspOn = !!d.ocsp?.enabled;
  const crlOn = !!d.crl?.enabled;
  if (!ocspOn && !crlOn) {
    return (
      <Tooltip title="OCSP and CRL responders are both disabled — live status cannot be checked">
        <Chip size="small" variant="outlined" color="default" label="checking disabled" />
      </Tooltip>
    );
  }

  const label = d.revoked ? 'revoked' : (d.status ?? 'unknown').toLowerCase();
  const color = LIVE_STATUS_COLOR[label] ?? 'default';
  const tip = [
    ocspOn ? `OCSP: ${d.ocsp?.status ?? 'enabled'}` : 'OCSP: disabled',
    crlOn ? `CRL #${d.crl?.crlNumber ?? '?'}${d.crl?.listed ? ' (listed)' : ''}` : 'CRL: disabled',
    d.crl?.nextUpdate ? `Next update ${formatDate(d.crl.nextUpdate)}` : null,
    d.revoked && d.revocationReason ? `Reason: ${d.revocationReason}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Tooltip title={tip}>
      <Chip size="small" variant="outlined" color={color} label={label} />
    </Tooltip>
  );
}

const EXPORT_FORMATS: Array<{ format: CertExportFormat; label: string }> = [
  { format: 'pem', label: 'PEM certificate' },
  { format: 'der', label: 'DER (binary)' },
  { format: 'chain', label: 'Full chain (PEM)' },
  { format: 'pkcs12', label: 'PKCS#12 (.p12, with passphrase)' },
];

/** X.509 revocation reasons (mirrors the Certificate.revocationReason ENUM). */
const CERT_REVOCATION_REASONS = [
  'unspecified',
  'keyCompromise',
  'caCompromise',
  'affiliationChanged',
  'superseded',
  'cessationOfOperation',
  'privilegeWithdrawn',
];

function CertificatesTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [issueOpen, setIssueOpen] = useState(false);
  const [exportMenu, setExportMenu] = useState<{ anchor: HTMLElement; cert: Certificate } | null>(null);
  const [pk12, setPk12] = useState<{ cert: Certificate; password: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<Certificate | null>(null);
  const [revokeReason, setRevokeReason] = useState('unspecified');
  const query = useQuery({
    queryKey: ['ca', 'admin', 'certificates'],
    queryFn: () => caAdminApi.listCertificates({ limit: 100 }),
  });
  const download = useMutation({ mutationFn: (c: Certificate) => caApi.downloadCertificate(c), onError: (e) => onToast((e as Error).message) });
  const exportCert = useMutation({
    mutationFn: ({ cert, format, password }: { cert: Certificate; format: CertExportFormat; password?: string }) =>
      caAdminApi.exportCertificate(cert, format, password),
    onSuccess: (_r, v) => onToast(`Exported ${v.format.toUpperCase()}`),
    onError: (e) => onToast((e as Error).message),
  });
  const revoke = useMutation({
    mutationFn: (c: Certificate) => caAdminApi.revokeCertificate(c.id, revokeReason),
    onSuccess: (r, c) => {
      const n = r.revokedTokenCount ?? 0;
      onToast(
        n > 0
          ? `Certificate revoked — revoked ${n} dependent token${n === 1 ? '' : 's'}`
          : 'Certificate revoked',
      );
      // Refresh certs, the cascaded tokens, and this cert's live status.
      qc.invalidateQueries({ queryKey: ['ca', 'admin', 'certificates'] });
      qc.invalidateQueries({ queryKey: ['ca', 'admin', 'tokens'] });
      qc.invalidateQueries({ queryKey: ['ca', 'admin', 'cert-status', c.id] });
      setRevokeTarget(null);
    },
    onError: (e) => onToast((e as Error).message),
  });

  const runExport = (format: CertExportFormat) => {
    const cert = exportMenu?.cert;
    setExportMenu(null);
    if (!cert) return;
    if (format === 'pkcs12') {
      setPk12({ cert, password: '' });
      return;
    }
    exportCert.mutate({ cert, format });
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" onClick={() => setIssueOpen(true)}>Issue certificate</Button>
      </Stack>
      <QueryState query={query}>
        {(d) => (
          <DataTable
            rows={d.certificates ?? []}
            rowKey={(c) => c.id}
            columns={[
              { key: 'commonName', header: 'Common name', render: (c) => c.commonName ?? '—' },
              { key: 'type', header: 'Type' },
              { key: 'serialNumber', header: 'Serial', mono: true, render: (c) => `${c.serialNumber?.slice(0, 16) ?? ''}…` },
              { key: 'status', header: 'Status', render: (c) => <StatusChip status={c.status} /> },
              { key: 'live', header: 'Live status', render: (c) => <CertLiveStatus cert={c} /> },
              { key: 'notAfter', header: 'Expires', render: (c) => formatDate(c.notAfter) },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (c) => (
                  <>
                    <Tooltip title="Download PEM">
                      <IconButton aria-label="Download PEM" size="small" onClick={() => download.mutate(c)}><DownloadIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title="Export…">
                      <IconButton aria-label="Export…" size="small" onClick={(e) => setExportMenu({ anchor: e.currentTarget, cert: c })}>
                        <FileDownloadIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Revoke">
                      <span>
                        <IconButton size="small" color="error" aria-label="Revoke" disabled={c.status !== 'active'} onClick={() => { setRevokeReason('unspecified'); setRevokeTarget(c); }}>
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
      <Menu anchorEl={exportMenu?.anchor ?? null} open={!!exportMenu} onClose={() => setExportMenu(null)}>
        {EXPORT_FORMATS.map((f) => (
          <MenuItem key={f.format} onClick={() => runExport(f.format)}>{f.label}</MenuItem>
        ))}
      </Menu>
      <Dialog open={!!pk12} onClose={() => setPk12(null)} fullWidth maxWidth="xs">
        <DialogTitle>Export PKCS#12</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            type="password"
            label="Passphrase"
            value={pk12?.password ?? ''}
            onChange={(e) => setPk12((p) => (p ? { ...p, password: e.target.value } : p))}
            sx={{ mt: 1 }}
            autoComplete="new-password"
            helperText="Required to encrypt the private key in the .p12 bundle."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPk12(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!pk12?.password || exportCert.isPending}
            onClick={() => {
              if (!pk12?.password) return;
              exportCert.mutate({ cert: pk12.cert, format: 'pkcs12', password: pk12.password });
              setPk12(null);
            }}
          >
            Export
          </Button>
        </DialogActions>
      </Dialog>
      <IssueCertDialog open={issueOpen} onClose={() => setIssueOpen(false)} onDone={onToast} />
      {/* Revoke certificate — cascades to every token it signed. */}
      <Dialog open={!!revokeTarget} onClose={() => setRevokeTarget(null)} fullWidth maxWidth="xs">
        <DialogTitle>Revoke certificate</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Certificate" value={revokeTarget?.commonName ?? ''} disabled size="small" />
            <TextField
              select
              label="Reason"
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
            >
              {CERT_REVOCATION_REASONS.map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </TextField>
            <Chip
              color="warning"
              variant="outlined"
              label="Every API token backed by this certificate will also be revoked"
              sx={{ height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRevokeTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={revoke.isPending}
            onClick={() => revokeTarget && revoke.mutate(revokeTarget)}
          >
            {revoke.isPending ? 'Revoking…' : 'Revoke'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

/* ----------------------------------------------------------------- tokens */

/** Group types that count as an "organization" for token scoping. */
const ORG_GROUP_TYPES = ['organizational_unit', 'department'];

const EMPTY_TOKEN_FORM: GenerateTokenInput = {
  certificateId: '',
  resourceType: 'url',
  resourceValue: '*',
  expiryType: 'time',
  expirySeconds: 3600,
  maxUses: 10,
  permissions: { read: true },
  userId: '',
  groupId: '',
  organizationId: '',
};

function GenerateTokenDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (m: string) => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<GenerateTokenInput>({ ...EMPTY_TOKEN_FORM });

  // Live data for the pickers — signing certs (CA certs can't sign tokens),
  // subject users, and directory groups/organizations.
  const certs = useQuery({
    queryKey: ['ca', 'admin', 'certificates'],
    queryFn: () => caAdminApi.listCertificates({ limit: 100 }),
    enabled: open,
  });
  const users = useQuery({
    queryKey: ['ca', 'admin', 'users'],
    queryFn: () => caAdminApi.listUsers({ limit: 100 }),
    enabled: open,
  });
  const groups = useQuery({
    queryKey: ['ca', 'admin', 'groups'],
    queryFn: caAdminApi.listGroups,
    enabled: open,
  });

  const signingCerts = (certs.data?.certificates ?? []).filter(
    (c) => c.status === 'active' && c.type !== 'root' && c.type !== 'intermediate',
  );
  const allGroups = groups.data?.groups ?? [];
  const orgGroups = allGroups.filter((g) => ORG_GROUP_TYPES.includes(String(g.type ?? '')));

  const mut = useMutation({
    mutationFn: () => {
      const body: GenerateTokenInput = {
        certificateId: form.certificateId,
        resourceType: form.resourceType,
        resourceValue: form.resourceValue,
        expiryType: form.expiryType,
        permissions: form.permissions,
      };
      if (form.expiryType === 'time') body.expirySeconds = form.expirySeconds;
      if (form.expiryType === 'use') body.maxUses = form.maxUses;
      if (form.userId) body.userId = form.userId;
      if (form.groupId) body.groupId = form.groupId;
      if (form.organizationId) body.organizationId = form.organizationId;
      return caAdminApi.generateToken(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ca', 'admin', 'tokens'] });
      onDone('Token generated');
      setForm({ ...EMPTY_TOKEN_FORM });
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
          <TextField
            select
            label="Signing certificate"
            required
            value={form.certificateId}
            onChange={(e) => setForm({ ...form, certificateId: e.target.value })}
            helperText={
              signingCerts.length === 0
                ? 'No active token-capable certificates (root/intermediate CA certs cannot sign tokens)'
                : 'The token is backed by this certificate — revoking it revokes the token'
            }
          >
            {signingCerts.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.commonName} ({c.type}) — {c.serialNumber?.slice(0, 12)}…
              </MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={2}>
            <TextField select label="Resource type" value={form.resourceType} onChange={(e) => setForm({ ...form, resourceType: e.target.value })} sx={{ minWidth: 140 }}>
              {['url', 'did', 'cid'].map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </TextField>
            <TextField label="Resource value" fullWidth required value={form.resourceValue} onChange={(e) => setForm({ ...form, resourceValue: e.target.value })} />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField select label="Expiry" value={form.expiryType} onChange={(e) => setForm({ ...form, expiryType: e.target.value })} sx={{ minWidth: 140 }}>
              <MenuItem value="time">time</MenuItem>
              <MenuItem value="use">use</MenuItem>
              <MenuItem value="persistent">persistent</MenuItem>
            </TextField>
            {form.expiryType === 'time' && (
              <TextField label="Expires in (seconds)" type="number" fullWidth value={form.expirySeconds} onChange={(e) => setForm({ ...form, expirySeconds: Number(e.target.value) })} inputProps={{ min: 1 }} />
            )}
            {form.expiryType === 'use' && (
              <TextField label="Max uses" type="number" fullWidth value={form.maxUses} onChange={(e) => setForm({ ...form, maxUses: Number(e.target.value) })} inputProps={{ min: 1 }} />
            )}
          </Stack>
          <Stack direction="row" spacing={1}>
            {['read', 'write', 'append', 'update', 'delete'].map((p) => (
              <Button key={p} size="small" variant={form.permissions?.[p] ? 'contained' : 'outlined'} onClick={() => togglePerm(p)}>{p}</Button>
            ))}
          </Stack>
          <TextField
            select
            label="Subject user (optional)"
            value={form.userId}
            onChange={(e) => setForm({ ...form, userId: e.target.value })}
            helperText="Mint the token on behalf of this user; defaults to you"
          >
            <MenuItem value=""><em>Me (acting admin)</em></MenuItem>
            {(users.data?.users ?? []).map((u) => (
              <MenuItem key={u.id} value={u.id}>{u.username ?? u.email ?? u.id}</MenuItem>
            ))}
          </TextField>
          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Group scope (optional)"
              value={form.groupId}
              onChange={(e) => setForm({ ...form, groupId: e.target.value })}
              sx={{ flex: 1 }}
              disabled={allGroups.length === 0}
              helperText="Group admins can invalidate the token"
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {allGroups.map((g) => (
                <MenuItem key={g.id} value={g.id}>{String(g.name ?? g.id)} ({String(g.type ?? '')})</MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Organization scope (optional)"
              value={form.organizationId}
              onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
              sx={{ flex: 1 }}
              disabled={orgGroups.length === 0}
              helperText="Org admins can invalidate the token"
            >
              <MenuItem value=""><em>None</em></MenuItem>
              {orgGroups.map((g) => (
                <MenuItem key={g.id} value={g.id}>{String(g.name ?? g.id)}</MenuItem>
              ))}
            </TextField>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!form.certificateId || !form.resourceValue || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? 'Generating…' : 'Generate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Structured revoke dialog (single token) — reason is recorded on the token. */
function RevokeTokenDialog({
  token,
  onClose,
  onDone,
}: {
  token: CaToken | null;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const mut = useMutation({
    mutationFn: () => caAdminApi.revokeToken(token!.id, reason.trim() || 'Revoked by administrator'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ca', 'admin', 'tokens'] });
      onDone('Token revoked');
      setReason('');
      onClose();
    },
    onError: (e) => onDone((e as Error).message),
  });
  return (
    <Dialog open={!!token} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Revoke token</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Token" value={token?.id ?? ''} disabled size="small" />
          <TextField
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            inputProps={{ maxLength: 255 }}
            helperText="Recorded on the token (revokedReason) with your identity (revokedBy)"
            autoFocus
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" disabled={mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? 'Revoking…' : 'Revoke'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Bulk invalidation by scope: all tokens of a user, group, or organization. */
function BulkRevokeDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [scope, setScope] = useState<'user' | 'group' | 'organization'>('user');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');

  const users = useQuery({
    queryKey: ['ca', 'admin', 'users'],
    queryFn: () => caAdminApi.listUsers({ limit: 100 }),
    enabled: open && scope === 'user',
  });
  const groups = useQuery({
    queryKey: ['ca', 'admin', 'groups'],
    queryFn: caAdminApi.listGroups,
    enabled: open && scope !== 'user',
  });

  const allGroups = groups.data?.groups ?? [];
  const options =
    scope === 'user'
      ? (users.data?.users ?? []).map((u) => ({ id: u.id, label: u.username ?? u.email ?? u.id }))
      : allGroups
          .filter((g) => (scope === 'organization' ? ORG_GROUP_TYPES.includes(String(g.type ?? '')) : true))
          .map((g) => ({ id: g.id, label: `${String(g.name ?? g.id)} (${String(g.type ?? '')})` }));

  const mut = useMutation({
    mutationFn: () => caAdminApi.bulkRevokeTokens(scope, targetId, reason.trim() || `Bulk revocation (${scope})`),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['ca', 'admin', 'tokens'] });
      onDone(`Revoked ${r.revokedCount} token${r.revokedCount === 1 ? '' : 's'}`);
      setTargetId('');
      setReason('');
      onClose();
    },
    onError: (e) => onDone((e as Error).message),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Bulk revoke tokens</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            select
            label="Scope"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as typeof scope);
              setTargetId('');
            }}
            helperText="Every active token in the selected scope is invalidated"
          >
            <MenuItem value="user">User — all of a user's tokens</MenuItem>
            <MenuItem value="group">Group — tokens scoped to a group</MenuItem>
            <MenuItem value="organization">Organization — tokens scoped to an org</MenuItem>
          </TextField>
          <TextField
            select
            label={scope === 'user' ? 'User' : scope === 'group' ? 'Group' : 'Organization'}
            required
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            disabled={options.length === 0}
            helperText={options.length === 0 ? 'No entries available for this scope' : undefined}
          >
            {options.map((o) => (
              <MenuItem key={o.id} value={o.id}>{o.label}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            inputProps={{ maxLength: 255 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" disabled={!targetId || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? 'Revoking…' : 'Revoke all'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Expiry cell: date for time-based, uses-left for use-based, else the type.
 * Token timestamps are epoch-ms BIGINTs (serialized as numeric strings). */
function tokenExpiryCell(t: CaToken) {
  if (t.expiryType === 'time') {
    const v = t.expiresAt;
    if (v == null) return '—';
    const n = Number(v);
    return formatDate(Number.isFinite(n) ? new Date(n).toISOString() : String(v));
  }
  if (t.expiryType === 'use') return `${t.usesRemaining ?? '?'}${t.maxUses ? ` / ${t.maxUses}` : ''} uses left`;
  return t.expiryType ?? '—';
}

/** Compact scope cell (group / organization names). */
function tokenScopeCell(t: CaToken) {
  const parts: string[] = [];
  if (t.organization?.name) parts.push(`org: ${t.organization.name}`);
  if (t.group?.name) parts.push(`group: ${t.group.name}`);
  return parts.length ? parts.join(' · ') : '—';
}

function TokensTab({ onToast }: { onToast: (m: string) => void }) {
  const [genOpen, setGenOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<CaToken | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [expiryFilter, setExpiryFilter] = useState('');
  const query = useQuery({
    queryKey: ['ca', 'admin', 'tokens', statusFilter, expiryFilter],
    queryFn: () =>
      caAdminApi.listTokens({
        limit: 100,
        status: statusFilter || undefined,
        expiryType: expiryFilter || undefined,
      }),
  });
  const validate = useMutation({
    mutationFn: (t: CaToken) => caAdminApi.validateToken(t.id),
    onSuccess: (d) => onToast(`Validate: ${JSON.stringify(d).slice(0, 120)}`),
    onError: (e) => onToast((e as Error).message),
  });

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <TextField select size="small" label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          {['active', 'revoked', 'expired', 'exhausted'].map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Expiry type" value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value)} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          {['time', 'use', 'persistent'].map((s) => (
            <MenuItem key={s} value={s}>{s}</MenuItem>
          ))}
        </TextField>
        <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
          <Button color="error" variant="outlined" onClick={() => setBulkOpen(true)}>Bulk revoke…</Button>
          <Button variant="contained" onClick={() => setGenOpen(true)}>Generate token</Button>
        </Stack>
      </Stack>
      <QueryState query={query}>
        {(d) => (
          <DataTable
            rows={d.tokens ?? []}
            rowKey={(t) => t.id}
            columns={[
              { key: 'id', header: 'Token', mono: true, render: (t) => `${t.id.slice(0, 8)}…` },
              { key: 'user', header: 'User', render: (t) => t.user?.username ?? t.user?.email ?? (t.userId ? `${String(t.userId).slice(0, 8)}…` : '—') },
              {
                key: 'cert',
                header: 'Certificate',
                render: (t) =>
                  t.certificate ? (
                    <Tooltip title={t.certificate.status === 'revoked' ? 'Certificate revoked — token invalid' : `Serial ${t.certificate.serialNumber ?? ''}`}>
                      <Chip
                        size="small"
                        variant="outlined"
                        color={t.certificate.status === 'revoked' ? 'error' : 'default'}
                        label={t.certificate.commonName ?? t.certificate.id.slice(0, 8)}
                      />
                    </Tooltip>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'perms',
                header: 'Permissions',
                render: (t) => (
                  <PermBadges perms={{ read: t.permissionRead, write: t.permissionWrite, append: t.permissionAppend, update: t.permissionUpdate, delete: t.permissionDelete }} />
                ),
              },
              { key: 'resource', header: 'Resource', mono: true, render: (t) => `${t.resourceType ?? ''}:${t.resourceValue ?? ''}` },
              { key: 'scope', header: 'Scope', render: (t) => tokenScopeCell(t) },
              { key: 'expiresAt', header: 'Expiry', render: (t) => tokenExpiryCell(t) },
              {
                key: 'status',
                header: 'Status',
                render: (t) =>
                  t.status === 'revoked' && (t.revokedReason || t.revokedBy) ? (
                    <Tooltip title={`${t.revokedReason ?? ''}${t.revokedBy ? ` · by ${String(t.revokedBy).slice(0, 8)}…` : ' · by system'}`}>
                      <span><StatusChip status={t.status} /></span>
                    </Tooltip>
                  ) : (
                    <StatusChip status={t.status} />
                  ),
              },
              {
                key: 'actions',
                header: 'Actions',
                align: 'right',
                render: (t) => (
                  <>
                    <Tooltip title="Validate"><IconButton aria-label="Validate" size="small" onClick={() => validate.mutate(t)}><RefreshIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Revoke">
                      <span>
                        <IconButton size="small" color="error" aria-label="Revoke" disabled={t.status !== 'active'} onClick={() => setRevokeTarget(t)}>
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
      <RevokeTokenDialog token={revokeTarget} onClose={() => setRevokeTarget(null)} onDone={onToast} />
      <BulkRevokeDialog open={bulkOpen} onClose={() => setBulkOpen(false)} onDone={onToast} />
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
              rows={d.users ?? []}
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
            <DataTable rows={d.groups ?? []} rowKey={(g, i) => String(g.id ?? i)} columns={[{ key: 'name', header: 'Name', render: (g) => String(g.name ?? g.id ?? '—') }]} />
          )}
        </QueryState>
      </Card>
      <Card title="Roles">
        <QueryState query={roles} empty="No roles.">
          {(d) => (
            <DataTable rows={d.roles ?? []} rowKey={(r, i) => String(r.id ?? i)} columns={[{ key: 'name', header: 'Name', render: (r) => String(r.name ?? r.id ?? '—') }]} />
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
