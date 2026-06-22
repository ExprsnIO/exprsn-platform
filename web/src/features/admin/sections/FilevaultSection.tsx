import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, TextField } from '@mui/material';
import { filevaultAdminApi, type Quota } from '@/api/admin/filevault';
import { formatBytes } from '@/features/files/util';
import { Card, DataTable, DataView, JsonDialog, QueryState, SectionHeader, StatCard, useToast } from '../ui';

function arr<T>(d: Record<string, unknown>, ...keys: string[]): T[] {
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as T[];
  return [];
}

function StorageTab() {
  const stats = useQuery({ queryKey: ['fv', 'stats'], queryFn: filevaultAdminApi.stats });
  const dedup = useQuery({ queryKey: ['fv', 'dedup'], queryFn: filevaultAdminApi.deduplication });
  const health = useQuery({ queryKey: ['fv', 'health'], queryFn: filevaultAdminApi.storageHealth });
  const s = (stats.data ?? {}) as Record<string, unknown>;
  return (
    <Stack spacing={2}>
      <QueryState query={stats}>
        {() => (
          <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
            <StatCard label="Files" value={(s.totalFiles ?? s.files) as number} />
            <StatCard label="Total size" value={formatBytes(Number(s.totalSize ?? s.totalBytes ?? 0))} />
            <StatCard label="Users" value={(s.totalUsers ?? s.users) as number} />
            <StatCard label="Blobs" value={(s.totalBlobs ?? s.blobs) as number} />
          </Stack>
        )}
      </QueryState>
      <Card title="Deduplication"><QueryState query={dedup}>{(d) => <DataView value={d} />}</QueryState></Card>
      <Card title="Storage backend health"><QueryState query={health}>{(d) => <DataView value={d} />}</QueryState></Card>
    </Stack>
  );
}

function QuotasTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Quota | null>(null);
  const [gb, setGb] = useState('10');
  const query = useQuery({ queryKey: ['fv', 'quotas'], queryFn: () => filevaultAdminApi.listQuotas(100) });
  const save = useMutation({
    mutationFn: () => filevaultAdminApi.setQuota(edit!.userId, Math.round(Number(gb) * 1024 ** 3)),
    onSuccess: () => { onToast('Quota updated'); setEdit(null); qc.invalidateQueries({ queryKey: ['fv', 'quotas'] }); },
    onError: (e) => onToast((e as Error).message),
  });
  return (
    <Stack spacing={2}>
      <QueryState query={query} empty="No quota records.">
        {(d) => (
          <DataTable
            rows={arr<Quota>(d, 'quotas', 'data')}
            rowKey={(qr, i) => String(qr.userId ?? i)}
            columns={[
              { key: 'userId', header: 'User', mono: true, render: (qr) => (qr.userId ?? '—').slice(0, 16) },
              { key: 'used', header: 'Used', align: 'right', render: (qr) => formatBytes(qr.usedBytes) },
              { key: 'quota', header: 'Quota', align: 'right', render: (qr) => formatBytes(qr.quotaBytes) },
              { key: 'files', header: 'Files', align: 'right', render: (qr) => qr.fileCount ?? '—' },
              { key: 'edit', header: '', align: 'right', render: (qr) => <Button size="small" onClick={() => { setEdit(qr); setGb(String(Math.round((qr.quotaBytes ?? 0) / 1024 ** 3) || 10)); }}>Set quota</Button> },
            ]}
          />
        )}
      </QueryState>
      <Dialog open={!!edit} onClose={() => setEdit(null)} fullWidth maxWidth="xs">
        <DialogTitle>Set quota</DialogTitle>
        <DialogContent>
          <TextField autoFocus fullWidth type="number" label="Quota (GB)" value={gb} onChange={(e) => setGb(e.target.value)} sx={{ mt: 1 }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Cancel</Button>
          <Button variant="contained" disabled={save.isPending} onClick={() => save.mutate()}>Save</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function MaintenanceTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [blobId, setBlobId] = useState('');
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const duplicates = useQuery({ queryKey: ['fv', 'duplicates'], queryFn: filevaultAdminApi.duplicates });
  const run = (fn: () => Promise<unknown>, title: string) =>
    fn().then((v) => { setView({ title, value: v ?? { ok: true } }); qc.invalidateQueries({ queryKey: ['fv'] }); }).catch((e) => onToast((e as Error).message));
  return (
    <Stack spacing={2}>
      <Alert severity="warning">Cleanup removes orphaned files/blobs older than the threshold; verify checks a blob&apos;s integrity.</Alert>
      <Card title="Operations">
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
          <Button variant="outlined" color="warning" onClick={() => { if (confirm('Run file cleanup?')) run(() => filevaultAdminApi.cleanup(), 'Cleanup'); }}>Cleanup files</Button>
          <Button variant="outlined" color="warning" onClick={() => { if (confirm('Run blob cleanup?')) run(() => filevaultAdminApi.cleanupBlobs(), 'Blob cleanup'); }}>Cleanup blobs</Button>
          <TextField size="small" label="Blob ID" value={blobId} onChange={(e) => setBlobId(e.target.value)} sx={{ minWidth: 240 }} />
          <Button variant="outlined" disabled={!blobId} onClick={() => run(() => filevaultAdminApi.verifyBlob(blobId), 'Verify blob')}>Verify</Button>
        </Stack>
      </Card>
      <Card title="Duplicate files">
        <QueryState query={duplicates} empty="No duplicates detected.">
          {(d) => (
            <DataTable
              rows={arr<Record<string, unknown>>(d, 'duplicates', 'data')}
              rowKey={(x, i) => String(x.hash ?? x.id ?? i)}
              columns={[
                { key: 'hash', header: 'Hash', mono: true, render: (x) => String(x.hash ?? x.checksum ?? '—').slice(0, 24) },
                { key: 'count', header: 'Copies', align: 'right', render: (x) => String(x.count ?? x.copies ?? '—') },
                { key: 'size', header: 'Size', align: 'right', render: (x) => formatBytes(Number(x.size ?? x.fileSize ?? 0)) },
              ]}
            />
          )}
        </QueryState>
      </Card>
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

type FvTab = 'storage' | 'quotas' | 'maintenance';

export function FilevaultSection() {
  const [tab, setTab] = useState<FvTab>('storage');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Files (FileVault)" subtitle="Storage stats, dedup, per-user quotas, blob maintenance — /filevault/api/admin" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="storage" label="Storage" />
        <Tab value="quotas" label="Quotas" />
        <Tab value="maintenance" label="Maintenance" />
      </Tabs>
      {tab === 'storage' && <StorageTab />}
      {tab === 'quotas' && <QuotasTab onToast={showToast} />}
      {tab === 'maintenance' && <MaintenanceTab onToast={showToast} />}
      {ToastHost}
    </Stack>
  );
}
