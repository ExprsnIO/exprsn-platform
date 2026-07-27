import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
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
                    <Tooltip title="Anomalies"><IconButton aria-label="Anomalies" size="small" onClick={() => vaultAdminApi.tokenAnomalies(t.id).then((v) => setView({ title: 'Anomalies', value: v })).catch((e) => onToast((e as Error).message))}>!</IconButton></Tooltip>
                    <Tooltip title="Suspend"><IconButton aria-label="Suspend" size="small" onClick={() => act(() => vaultAdminApi.suspendToken(t.id), 'Suspended')}><PauseIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Reactivate"><IconButton aria-label="Reactivate" size="small" onClick={() => act(() => vaultAdminApi.reactivateToken(t.id), 'Reactivated')}><PlayArrowIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Revoke"><IconButton aria-label="Revoke" size="small" color="error" onClick={() => { if (confirm('Revoke token?')) act(() => vaultAdminApi.revokeToken(t.id, 'Revoked from admin console'), 'Revoked'); }}><BlockIcon fontSize="small" /></IconButton></Tooltip>
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

const EMPTY_POLICY_FORM = {
  name: '',
  description: '',
  policyType: 'secret',
  entityTypes: '',
  priority: '',
  enforcementMode: 'enforcing',
};

/**
 * Structured draft of the AccessPolicy `rules` JSONB. The known rule
 * vocabulary comes from services/vault/src/services/aiPolicyService.js
 * (the only producer in the codebase): pathRestrictions, ipWhitelist,
 * rateLimit and timeRestriction. Anything else lives in `extra` and is
 * editable via the JSON escape hatch.
 */
interface RulesDraft {
  pathRestrictions: string[] | null;
  ipWhitelist: string[] | null;
  rateLimit: { maxRequests: number | ''; windowMinutes: number | '' } | null;
  timeRestriction: { timezone: string; allowedHours: number[]; allowedDays: number[] } | null;
  extra: Record<string, unknown>;
}

const EMPTY_RULES: RulesDraft = { pathRestrictions: null, ipWhitelist: null, rateLimit: null, timeRestriction: null, extra: {} };
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_v, h) => h);

function rulesToJson(d: RulesDraft): Record<string, unknown> {
  const out: Record<string, unknown> = { ...d.extra };
  if (d.pathRestrictions) out.pathRestrictions = d.pathRestrictions;
  if (d.ipWhitelist) out.ipWhitelist = d.ipWhitelist;
  if (d.rateLimit) {
    out.rateLimit = {
      ...(d.rateLimit.maxRequests !== '' && { maxRequests: Number(d.rateLimit.maxRequests) }),
      ...(d.rateLimit.windowMinutes !== '' && { windowMinutes: Number(d.rateLimit.windowMinutes) }),
    };
  }
  if (d.timeRestriction) {
    out.timeRestriction = {
      timezone: d.timeRestriction.timezone.trim() || 'UTC',
      allowedHours: d.timeRestriction.allowedHours,
      allowedDays: d.timeRestriction.allowedDays,
    };
  }
  return out;
}

function rulesFromJson(v: unknown): RulesDraft {
  const obj = (v && typeof v === 'object' && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const draft: RulesDraft = { ...EMPTY_RULES, extra: {} };
  for (const [k, val] of Object.entries(obj)) {
    if (k === 'pathRestrictions' && Array.isArray(val)) draft.pathRestrictions = val.map(String);
    else if (k === 'ipWhitelist' && Array.isArray(val)) draft.ipWhitelist = val.map(String);
    else if (k === 'rateLimit' && val != null && typeof val === 'object' && !Array.isArray(val)) {
      const r = val as Record<string, unknown>;
      draft.rateLimit = {
        maxRequests: typeof r.maxRequests === 'number' ? r.maxRequests : '',
        windowMinutes: typeof r.windowMinutes === 'number' ? r.windowMinutes : '',
      };
    } else if (k === 'timeRestriction' && val != null && typeof val === 'object' && !Array.isArray(val)) {
      const t = val as Record<string, unknown>;
      draft.timeRestriction = {
        timezone: typeof t.timezone === 'string' ? t.timezone : 'UTC',
        allowedHours: Array.isArray(t.allowedHours) ? t.allowedHours.map(Number).filter((h) => !Number.isNaN(h)) : [],
        allowedDays: Array.isArray(t.allowedDays) ? t.allowedDays.map(Number).filter((d) => !Number.isNaN(d)) : [],
      };
    } else {
      draft.extra[k] = val;
    }
  }
  return draft;
}

function PoliciesTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_POLICY_FORM);
  const [rules, setRules] = useState<RulesDraft>(EMPTY_RULES);
  const [rulesRaw, setRulesRaw] = useState(false);
  const [rulesText, setRulesText] = useState('{}');
  const [rulesError, setRulesError] = useState<string | null>(null);
  const set = (k: keyof typeof EMPTY_POLICY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setRule = <K extends keyof RulesDraft>(k: K, v: RulesDraft[K]) => setRules((r) => ({ ...r, [k]: v }));
  const query = useQuery({ queryKey: ['vault', 'policies'], queryFn: () => vaultAdminApi.listPolicies() });

  /** Resolve the rules object from whichever editor is active. */
  const resolveRules = (): Record<string, unknown> | null => {
    if (!rulesRaw) return rulesToJson(rules);
    try {
      const v = JSON.parse(rulesText || '{}');
      if (typeof v !== 'object' || v == null || Array.isArray(v)) throw new Error('object');
      return v as Record<string, unknown>;
    } catch {
      setRulesError('Rules must be a valid JSON object.');
      return null;
    }
  };

  const toggleRulesRaw = () => {
    if (!rulesRaw) {
      setRulesText(JSON.stringify(rulesToJson(rules), null, 2));
      setRulesRaw(true);
      setRulesError(null);
      return;
    }
    const v = resolveRules();
    if (!v) return;
    setRules(rulesFromJson(v));
    setRulesError(null);
    setRulesRaw(false);
  };

  const create = useMutation({
    mutationFn: () => {
      // Mirrors the backend createPolicySchema (services/vault/src/routes/admin.js).
      const resolved = resolveRules();
      if (!resolved) return Promise.reject(new Error('Rules must be a valid JSON object.'));
      setRulesError(null);
      const body: Record<string, unknown> = {
        name: form.name.trim(),
        policyType: form.policyType,
        rules: resolved,
        enforcementMode: form.enforcementMode,
      };
      if (form.description.trim()) body.description = form.description.trim();
      const entityTypes = form.entityTypes.split(',').map((s) => s.trim()).filter(Boolean);
      if (entityTypes.length) body.entityTypes = entityTypes;
      if (form.priority !== '') body.priority = Number(form.priority);
      return vaultAdminApi.createPolicy(body);
    },
    onSuccess: () => { onToast('Policy created'); setOpen(false); setForm(EMPTY_POLICY_FORM); setRules(EMPTY_RULES); setRulesRaw(false); setRulesText('{}'); qc.invalidateQueries({ queryKey: ['vault', 'policies'] }); },
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
              { key: 'del', header: '', align: 'right', render: (p) => <IconButton size="small" color="error" aria-label={`Delete policy ${p.name ?? p.id}`} onClick={() => del(p.id)}><DeleteIcon fontSize="small" /></IconButton> },
            ]}
          />
        )}
      </QueryState>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create policy</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Name" required value={form.name} onChange={set('name')} />
            <TextField label="Description" multiline minRows={2} value={form.description} onChange={set('description')} />
            <Stack direction="row" spacing={2}>
              <TextField select label="Policy type" required value={form.policyType} onChange={set('policyType')} sx={{ flex: 1 }}>
                {['secret', 'key', 'credential', 'global'].map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
              <TextField select label="Enforcement" value={form.enforcementMode} onChange={set('enforcementMode')} sx={{ flex: 1 }}>
                {['enforcing', 'permissive', 'audit'].map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </TextField>
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField label="Entity types" placeholder="comma-separated" value={form.entityTypes} onChange={set('entityTypes')} sx={{ flex: 2 }} />
              <TextField label="Priority" type="number" inputProps={{ min: 1, max: 1000 }} value={form.priority} onChange={set('priority')} sx={{ flex: 1 }} />
            </Stack>
            <Divider />
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle1" fontWeight={600}>Rules</Typography>
              <Button size="small" onClick={toggleRulesRaw}>{rulesRaw ? 'Form view' : 'Edit as JSON'}</Button>
            </Stack>
            {rulesError && <Alert severity="error">{rulesError}</Alert>}
            {rulesRaw ? (
              <TextField
                label="Rules (JSON object)"
                multiline
                minRows={6}
                value={rulesText}
                onChange={(e) => { setRulesText(e.target.value); setRulesError(null); }}
                inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
              />
            ) : (
              <Stack spacing={2}>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {rules.pathRestrictions == null && (
                    <Button size="small" variant="outlined" onClick={() => setRule('pathRestrictions', [])}>+ Path restrictions</Button>
                  )}
                  {rules.ipWhitelist == null && (
                    <Button size="small" variant="outlined" onClick={() => setRule('ipWhitelist', [])}>+ IP whitelist</Button>
                  )}
                  {rules.rateLimit == null && (
                    <Button size="small" variant="outlined" onClick={() => setRule('rateLimit', { maxRequests: '', windowMinutes: 60 })}>+ Rate limit</Button>
                  )}
                  {rules.timeRestriction == null && (
                    <Button size="small" variant="outlined" onClick={() => setRule('timeRestriction', { timezone: 'UTC', allowedHours: [], allowedDays: [] })}>+ Time restriction</Button>
                  )}
                </Stack>
                {rules.pathRestrictions == null && rules.ipWhitelist == null && rules.rateLimit == null && rules.timeRestriction == null && (
                  <Typography variant="caption" color="text.secondary">No rules yet — add at least one restriction above.</Typography>
                )}

                {rules.pathRestrictions != null && (
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Autocomplete
                      multiple
                      freeSolo
                      options={[]}
                      value={rules.pathRestrictions}
                      onChange={(_e, v) => setRule('pathRestrictions', v as string[])}
                      sx={{ flex: 1 }}
                      renderInput={(params) => (
                        <TextField {...params} label="Path restrictions" placeholder="add path prefix and press Enter" helperText="Secret paths this policy allows access to" />
                      )}
                    />
                    <IconButton size="small" color="error" onClick={() => setRule('pathRestrictions', null)} aria-label="remove path restrictions"><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                )}

                {rules.ipWhitelist != null && (
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <Autocomplete
                      multiple
                      freeSolo
                      options={[]}
                      value={rules.ipWhitelist}
                      onChange={(_e, v) => setRule('ipWhitelist', v as string[])}
                      sx={{ flex: 1 }}
                      renderInput={(params) => (
                        <TextField {...params} label="IP whitelist" placeholder="add IP / CIDR and press Enter" helperText="Only these addresses may use the policy target" />
                      )}
                    />
                    <IconButton size="small" color="error" onClick={() => setRule('ipWhitelist', null)} aria-label="remove ip whitelist"><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                )}

                {rules.rateLimit != null && (
                  <Stack direction="row" spacing={1} alignItems="center">
                    <TextField
                      size="small"
                      type="number"
                      label="Max requests"
                      inputProps={{ min: 1 }}
                      value={rules.rateLimit.maxRequests}
                      onChange={(e) => setRule('rateLimit', { ...rules.rateLimit!, maxRequests: e.target.value === '' ? '' : Number(e.target.value) })}
                      sx={{ width: 150 }}
                    />
                    <TextField
                      size="small"
                      type="number"
                      label="Window (minutes)"
                      inputProps={{ min: 1 }}
                      value={rules.rateLimit.windowMinutes}
                      onChange={(e) => setRule('rateLimit', { ...rules.rateLimit!, windowMinutes: e.target.value === '' ? '' : Number(e.target.value) })}
                      sx={{ width: 160 }}
                    />
                    <IconButton size="small" color="error" onClick={() => setRule('rateLimit', null)} aria-label="remove rate limit"><DeleteIcon fontSize="small" /></IconButton>
                  </Stack>
                )}

                {rules.timeRestriction != null && (
                  <Stack spacing={1}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField
                        size="small"
                        label="Timezone"
                        value={rules.timeRestriction.timezone}
                        onChange={(e) => setRule('timeRestriction', { ...rules.timeRestriction!, timezone: e.target.value })}
                        sx={{ width: 160 }}
                        helperText="IANA name, e.g. UTC"
                      />
                      <TextField
                        select
                        size="small"
                        label="Allowed days"
                        SelectProps={{ multiple: true, renderValue: (sel) => (sel as number[]).map((d) => DAY_LABELS[d] ?? d).join(', ') }}
                        value={rules.timeRestriction.allowedDays}
                        onChange={(e) => setRule('timeRestriction', { ...rules.timeRestriction!, allowedDays: (typeof e.target.value === 'string' ? e.target.value.split(',').map(Number) : (e.target.value as unknown as number[])) })}
                        sx={{ minWidth: 200 }}
                      >
                        {DAY_LABELS.map((d, i) => <MenuItem key={d} value={i}>{d}</MenuItem>)}
                      </TextField>
                      <IconButton size="small" color="error" onClick={() => setRule('timeRestriction', null)} aria-label="remove time restriction"><DeleteIcon fontSize="small" /></IconButton>
                    </Stack>
                    <TextField
                      select
                      size="small"
                      label="Allowed hours (empty = all)"
                      SelectProps={{ multiple: true, renderValue: (sel) => (sel as number[]).map((h) => `${h}:00`).join(', ') }}
                      value={rules.timeRestriction.allowedHours}
                      onChange={(e) => setRule('timeRestriction', { ...rules.timeRestriction!, allowedHours: (typeof e.target.value === 'string' ? e.target.value.split(',').map(Number) : (e.target.value as unknown as number[])) })}
                    >
                      {HOURS.map((h) => <MenuItem key={h} value={h}>{`${h}:00 – ${h}:59`}</MenuItem>)}
                    </TextField>
                  </Stack>
                )}

                {Object.keys(rules.extra).length > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {Object.keys(rules.extra).length} additional rule key{Object.keys(rules.extra).length === 1 ? '' : 's'} preserved — use “Edit as JSON” to change them.
                  </Typography>
                )}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={create.isPending || !form.name.trim()} onClick={() => create.mutate()}>Create</Button>
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
