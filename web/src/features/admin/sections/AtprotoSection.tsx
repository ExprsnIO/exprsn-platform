import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import UndoOutlinedIcon from '@mui/icons-material/UndoOutlined';
import LinkOffOutlinedIcon from '@mui/icons-material/LinkOffOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import {
  atprotoAdminApi,
  type ExternalLabeler,
  type InboundLabel,
  type OutLabel,
} from '@/api/admin/atproto';
import { Card, DataTable, QueryState, SectionHeader, StatCard, useToast } from '../ui';

/** Short at:// URI / DID for table cells. */
function short(s?: string | null, n = 28): string {
  if (!s) return '—';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

/** Compact relative age, e.g. "5s", "2m", "1h", "3d". */
function ago(iso?: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'now';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** Active labeler with no fresh reconcile heartbeat → the worker may be down. */
function workerStale(l: ExternalLabeler): boolean {
  if (!l.active) return false;
  if (!l.heartbeatAt) return true;
  return Date.now() - new Date(l.heartbeatAt).getTime() > 45_000;
}

const STATUS_COLOR: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
  connected: 'success',
  connecting: 'warning',
  disconnected: 'error',
  idle: 'default',
};

interface Toaster {
  showToast: (m: string, sev?: 'success' | 'info' | 'error') => void;
  showError: (e: unknown) => void;
}

function OverviewTab() {
  const stats = useQuery({ queryKey: ['atproto', 'stats'], queryFn: atprotoAdminApi.stats });
  const identity = useQuery({ queryKey: ['atproto', 'identity'], queryFn: atprotoAdminApi.identity });
  const feed = useQuery({ queryKey: ['atproto', 'feed'], queryFn: atprotoAdminApi.feedRecord });

  return (
    <Stack spacing={2}>
      <QueryState query={stats}>
        {(d) => (
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <StatCard label="Labels issued" value={d.labels?.total ?? 0} hint={`last seq ${d.labels?.lastSeq ?? 0}`} />
            <StatCard label="Inbound labels" value={d.inboundLabels ?? 0} />
            <StatCard label="Queue waiting" value={d.queue?.waiting ?? 0} />
            <StatCard label="Queue active" value={d.queue?.active ?? 0} />
            <StatCard label="Queue failed" value={d.queue?.failed ?? 0} />
            {d.moderationDlq != null && (
              <StatCard label="DID moderation DLQ" value={d.moderationDlq} hint="dead-lettered DID items" />
            )}
          </Stack>
        )}
      </QueryState>

      <QueryState query={identity}>
        {(d) => (
          <Card title="Labeler identity">
            {d.did ? (
              <Stack spacing={0.5}>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {d.did}
                </Typography>
                <Stack direction="row" spacing={1}>
                  <Chip size="small" label={`did:${d.method}`} />
                  <Chip size="small" color={d.published ? 'success' : 'default'} label={d.published ? 'published' : 'unpublished'} />
                  <Chip size="small" variant="outlined" label={d.host} />
                </Stack>
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No labeler identity provisioned. Run <code>npm run atproto:provision</code>.
              </Typography>
            )}
          </Card>
        )}
      </QueryState>

      <QueryState query={feed}>
        {(d) => (
          <Card title="Feed generator">
            <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {d.uri ?? '—'}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {(d.record?.displayName as string) ?? d.rkey ?? '—'}
            </Typography>
          </Card>
        )}
      </QueryState>
    </Stack>
  );
}

/** Dialog to manually apply a label to a subject URI. */
function ApplyLabelDialog({ toaster }: { toaster: Toaster }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uri, setUri] = useState('');
  const [val, setVal] = useState('');
  const [neg, setNeg] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!uri.trim() || !val.trim()) return;
    setBusy(true);
    try {
      await atprotoAdminApi.applyLabel(uri.trim(), val.trim(), neg);
      toaster.showToast(`Applied ${neg ? '¬' : ''}${val} to ${short(uri, 24)}`, 'success');
      qc.invalidateQueries({ queryKey: ['atproto'] });
      setOpen(false);
      setUri('');
      setVal('');
      setNeg(false);
    } catch (e) {
      toaster.showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="contained" size="small" onClick={() => setOpen(true)}>
        Apply label
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Apply label</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Subject URI (at:// or did:)" value={uri} onChange={(e) => setUri(e.target.value)} fullWidth />
            <TextField label="Label value" value={val} onChange={(e) => setVal(e.target.value)} placeholder="spam, nsfw, !hide…" fullWidth />
            <FormControlLabel control={<Checkbox checked={neg} onChange={(e) => setNeg(e.target.checked)} />} label="Negation (retract this label)" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={busy || !uri.trim() || !val.trim()}>
            {busy ? 'Applying…' : 'Apply'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function OutLabelsTab({ toaster }: { toaster: Toaster }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['atproto', 'out-labels'], queryFn: () => atprotoAdminApi.outLabels(100) });

  const negate = (uri: string) =>
    atprotoAdminApi
      .negate(uri)
      .then(() => {
        toaster.showToast(`Queued negation for ${short(uri, 24)}`, 'success');
        qc.invalidateQueries({ queryKey: ['atproto'] });
      })
      .catch((e) => toaster.showError(e));

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <ApplyLabelDialog toaster={toaster} />
      </Stack>
      <QueryState query={query} empty="No labels issued yet.">
        {(d) => (
          <DataTable<OutLabel>
            rows={d.labels ?? []}
            rowKey={(l, i) => `${l.uri}:${l.val}:${i}`}
            columns={[
              { key: 'val', header: 'Label', render: (l) => <Chip size="small" color={l.neg ? 'default' : 'primary'} label={l.neg ? `¬${l.val}` : l.val} /> },
              { key: 'uri', header: 'Subject', render: (l) => short(l.uri, 40) },
              { key: 'src', header: 'Issuer', render: (l) => short(l.src) },
              { key: 'cts', header: 'Created', render: (l) => short(l.cts, 24) },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (l) =>
                  l.neg ? null : (
                    <Tooltip title="Negate all labels for this URI">
                      <Button size="small" startIcon={<UndoOutlinedIcon />} onClick={() => negate(l.uri)}>
                        Negate
                      </Button>
                    </Tooltip>
                  ),
              },
            ]}
          />
        )}
      </QueryState>
    </Stack>
  );
}

function InboundTab({ toaster }: { toaster: Toaster }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['atproto', 'inbound'], queryFn: () => atprotoAdminApi.inboundLabels(100) });

  const hide = (uri: string) =>
    atprotoAdminApi
      .applyLabel(uri, '!hide')
      .then(() => {
        toaster.showToast(`Hidden ${short(uri, 24)}`, 'success');
        qc.invalidateQueries({ queryKey: ['atproto'] });
      })
      .catch((e) => toaster.showError(e));

  return (
    <QueryState query={query} empty="No inbound labels consumed yet.">
      {(d) => (
        <DataTable<InboundLabel>
          rows={d.labels ?? []}
          rowKey={(l, i) => `${l.src}:${l.uri}:${l.val}:${i}`}
          columns={[
            { key: 'val', header: 'Label', render: (l) => <Chip size="small" color={l.neg ? 'default' : 'secondary'} label={l.neg ? `¬${l.val}` : l.val} /> },
            { key: 'uri', header: 'Subject', render: (l) => short(l.uri, 34) },
            { key: 'src', header: 'Issuer', render: (l) => short(l.src) },
            { key: 'verified', header: 'Verified', render: (l) => <Chip size="small" color={l.verified ? 'success' : 'warning'} label={l.verified ? 'yes' : 'no'} /> },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (l) => (
                <Tooltip title="Apply our !hide label to this URI">
                  <Button size="small" startIcon={<VisibilityOffOutlinedIcon />} onClick={() => hide(l.uri)}>
                    Hide
                  </Button>
                </Tooltip>
              ),
            },
          ]}
        />
      )}
    </QueryState>
  );
}

/** Dialog to subscribe to an external labeler by DID or wss URL. */
function SubscribeLabelerDialog({ toaster }: { toaster: Toaster }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [labeler, setLabeler] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!labeler.trim()) return;
    setBusy(true);
    try {
      await atprotoAdminApi.subscribeLabeler(labeler.trim());
      toaster.showToast('Subscribed — the worker connects shortly.', 'success');
      qc.invalidateQueries({ queryKey: ['atproto', 'labelers'] });
      setOpen(false);
      setLabeler('');
    } catch (e) {
      toaster.showError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="contained" size="small" onClick={() => setOpen(true)}>
        Subscribe
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Subscribe to a labeler</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <TextField
              label="Labeler DID or wss URL"
              value={labeler}
              onChange={(e) => setLabeler(e.target.value)}
              placeholder="did:plc:… or wss://mod.example/xrpc/com.atproto.label.subscribeLabels"
              fullWidth
            />
            <Typography variant="caption" color="text.secondary">
              e.g. <code>did:plc:ar7c4by46qjdydhdevvrndac</code> (Bluesky Moderation).
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={submit} disabled={busy || !labeler.trim()}>
            {busy ? 'Subscribing…' : 'Subscribe'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** Connection-health chip: status, or a "stale?" warning if the heartbeat is old. */
function HealthChip({ l }: { l: ExternalLabeler }) {
  if (workerStale(l)) {
    return (
      <Tooltip title="No recent worker heartbeat — the firehose worker may not be running.">
        <Chip size="small" color="warning" variant="outlined" label="stale?" />
      </Tooltip>
    );
  }
  return <Chip size="small" color={STATUS_COLOR[l.status] ?? 'default'} label={l.status} />;
}

function LabelersTab({ toaster }: { toaster: Toaster }) {
  const qc = useQueryClient();
  const [purgeTarget, setPurgeTarget] = useState<string | null>(null);
  // Poll so health (status / last-seen) stays live while the tab is open.
  const query = useQuery({
    queryKey: ['atproto', 'labelers'],
    queryFn: atprotoAdminApi.externalLabelers,
    refetchInterval: 10_000,
  });

  const act = (p: Promise<unknown>, msg: string) =>
    p.then(() => {
      toaster.showToast(msg, 'success');
      qc.invalidateQueries({ queryKey: ['atproto', 'labelers'] });
    }).catch((e) => toaster.showError(e));

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <SubscribeLabelerDialog toaster={toaster} />
      </Stack>
      <QueryState query={query} empty="Not subscribed to any external labelers.">
        {(d) => (
          <DataTable<ExternalLabeler>
            rows={d.labelers ?? []}
            rowKey={(l) => l.endpoint}
            columns={[
              { key: 'health', header: 'Health', render: (l) => <HealthChip l={l} /> },
              { key: 'did', header: 'DID', render: (l) => short(l.did, 22) },
              { key: 'endpoint', header: 'Endpoint', render: (l) => short(l.endpoint, 32) },
              { key: 'cursor', header: 'Cursor', render: (l) => l.cursor ?? '—' },
              { key: 'lastEvent', header: 'Last seen', render: (l) => ago(l.lastEventAt ?? l.lastConnectedAt) },
              { key: 'reconnects', header: 'Conn.', align: 'right', render: (l) => l.connectAttempts ?? 0 },
              { key: 'lastError', header: 'Last error', render: (l) => short(l.lastError, 24) },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (l) => (
                  <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                    {l.active && (
                      <Tooltip title="Stop consuming (keeps cursor)">
                        <Button size="small" color="warning" startIcon={<LinkOffOutlinedIcon />} onClick={() => act(atprotoAdminApi.unsubscribeLabeler(l.endpoint), 'Unsubscribed.')}>
                          Unsubscribe
                        </Button>
                      </Tooltip>
                    )}
                    <Tooltip title="Delete this labeler and its cursor">
                      <Button size="small" color="error" startIcon={<DeleteOutlineOutlinedIcon />} onClick={() => setPurgeTarget(l.endpoint)}>
                        Purge
                      </Button>
                    </Tooltip>
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </QueryState>

      <Dialog open={!!purgeTarget} onClose={() => setPurgeTarget(null)} fullWidth maxWidth="sm">
        <DialogTitle>Purge labeler?</DialogTitle>
        <DialogContent>
          <Typography variant="body2">
            This deletes the labeler subscription <strong>and its cursor</strong>. Re-subscribing later
            will backfill from the beginning. To pause without losing the cursor, use Unsubscribe instead.
          </Typography>
          <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', display: 'block', mt: 1 }}>
            {purgeTarget}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPurgeTarget(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              const ep = purgeTarget!;
              setPurgeTarget(null);
              act(atprotoAdminApi.unsubscribeLabeler(ep, true), 'Purged.');
            }}
          >
            Purge
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

const TABS = ['Overview', 'Our labels', 'Inbound labels', 'Labelers'];

/**
 * Admin view of the AT-Protocol / Bluesky bridge: stats + identity + feed, the
 * labels we issue (with apply/negate operator actions), the labels we consume
 * from external labelers (with a one-click hide), and our subscriptions.
 * Mutations require a platform-admin bearer (adminGuard).
 */
export function AtprotoSection() {
  const [tab, setTab] = useState(0);
  const { showToast, showError, ToastHost } = useToast();

  const toaster: Toaster = { showToast, showError };

  return (
    <Stack spacing={2}>
      <SectionHeader title="AT-Protocol / Bluesky" subtitle="Firehose moderation bridge, labeler, and feed generator" />
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          {TABS.map((t) => <Tab key={t} label={t} />)}
        </Tabs>
      </Box>
      {tab === 0 && <OverviewTab />}
      {tab === 1 && <OutLabelsTab toaster={toaster} />}
      {tab === 2 && <InboundTab toaster={toaster} />}
      {tab === 3 && <LabelersTab toaster={toaster} />}
      {ToastHost}
    </Stack>
  );
}
