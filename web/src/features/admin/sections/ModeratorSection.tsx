import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, IconButton, MenuItem, Stack, Tab, Tabs, TextField, Tooltip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import { useAppStore } from '@/app/store';
import {
  moderatorAdminApi,
  MODERATOR_CONFIG_SECTIONS,
  type QueueItem,
  type ModReport,
  type ModRule,
  type Appeal,
  type Workflow,
} from '@/api/admin/moderator';
import { formatDate } from '@/features/files/util';
import { Card, ConfigSectionEditor, DataTable, JsonDialog, QueryState, SectionHeader, StatusChip, useToast } from '../ui';

function arr<T>(d: Record<string, unknown>, ...keys: string[]): T[] {
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as T[];
  return [];
}

function QueueTab({ onToast, moderatorId }: { onToast: (m: string) => void; moderatorId: string }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState('pending');
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const query = useQuery({ queryKey: ['mod', 'queue', status], queryFn: () => moderatorAdminApi.queue({ status, limit: 50 }) });
  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); qc.invalidateQueries({ queryKey: ['mod', 'queue'] }); }).catch((e) => onToast((e as Error).message));
  return (
    <Stack spacing={2}>
      <TextField select size="small" label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ maxWidth: 200 }}>
        {['pending', 'approved', 'rejected', 'all'].map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
      </TextField>
      <QueryState query={query} empty="Queue is empty.">
        {(d) => (
          <DataTable
            rows={arr<QueueItem>(d, 'items', 'queue', 'data')}
            rowKey={(it) => it.id}
            columns={[
              { key: 'contentType', header: 'Content', render: (it) => it.contentType ?? '—' },
              { key: 'sourceService', header: 'Source', render: (it) => it.sourceService ?? '—' },
              { key: 'riskScore', header: 'Risk', align: 'right', render: (it) => it.riskScore ?? '—' },
              { key: 'priority', header: 'Priority', render: (it) => String(it.priority ?? '—') },
              { key: 'status', header: 'Status', render: (it) => <StatusChip status={it.status} /> },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (it) => (
                  <>
                    <Tooltip title="Approve"><IconButton size="small" color="success" onClick={() => act(() => moderatorAdminApi.approve(it.id, moderatorId), 'Approved')}><CheckIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Reject"><IconButton size="small" color="error" onClick={() => act(() => moderatorAdminApi.reject(it.id, moderatorId), 'Rejected')}><CloseIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Analyze"><IconButton size="small" onClick={() => moderatorAdminApi.analyze(it.id).then((v) => setView({ title: 'AI analysis', value: v })).catch((e) => onToast((e as Error).message))}>AI</IconButton></Tooltip>
                    <Button size="small" onClick={() => act(() => moderatorAdminApi.warn(it.id), 'Warned')}>Warn</Button>
                    <Button size="small" color="warning" onClick={() => act(() => moderatorAdminApi.remove(it.id), 'Removed')}>Remove</Button>
                    <Button size="small" color="error" onClick={() => act(() => moderatorAdminApi.ban(it.id), 'Banned')}>Ban</Button>
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

function ReportsTab({ onToast, moderatorId }: { onToast: (m: string) => void; moderatorId: string }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['mod', 'reports'], queryFn: () => moderatorAdminApi.reports({ limit: 50 }) });
  const resolve = (id: string) => moderatorAdminApi.resolveReport(id, moderatorId, 'reviewed').then(() => { onToast('Report resolved'); qc.invalidateQueries({ queryKey: ['mod', 'reports'] }); }).catch((e) => onToast((e as Error).message));
  return (
    <QueryState query={query} empty="No reports.">
      {(d) => (
        <DataTable
          rows={arr<ModReport>(d, 'reports', 'data')}
          rowKey={(r) => r.id}
          columns={[
            { key: 'contentType', header: 'Content', render: (r) => r.contentType ?? '—' },
            { key: 'reason', header: 'Reason', render: (r) => r.reason ?? '—' },
            { key: 'reportedBy', header: 'By', mono: true, render: (r) => (r.reportedBy ?? '—').slice(0, 12) },
            { key: 'status', header: 'Status', render: (r) => <StatusChip status={r.status} /> },
            { key: 'createdAt', header: 'When', render: (r) => formatDate(r.createdAt) },
            { key: 'resolve', header: '', align: 'right', render: (r) => <Button size="small" disabled={r.status === 'resolved'} onClick={() => resolve(r.id)}>Resolve</Button> },
          ]}
        />
      )}
    </QueryState>
  );
}

function RulesTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['mod', 'rules'], queryFn: () => moderatorAdminApi.rules() });
  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); qc.invalidateQueries({ queryKey: ['mod', 'rules'] }); }).catch((e) => onToast((e as Error).message));
  return (
    <QueryState query={query} empty="No rules.">
      {(d) => (
        <DataTable
          rows={arr<ModRule>(d, 'rules', 'data')}
          rowKey={(r) => r.id}
          columns={[
            { key: 'name', header: 'Name', render: (r) => r.name ?? '—' },
            { key: 'action', header: 'Action', render: (r) => r.action ?? '—' },
            { key: 'appliesTo', header: 'Applies to', render: (r) => r.appliesTo ?? '—' },
            { key: 'priority', header: 'Priority', align: 'right', render: (r) => r.priority ?? 0 },
            { key: 'enabled', header: 'Enabled', render: (r) => (r.enabled ? 'yes' : 'no') },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (r) => (
                <>
                  <Button size="small" onClick={() => act(() => (r.enabled ? moderatorAdminApi.disableRule(r.id) : moderatorAdminApi.enableRule(r.id)), 'Toggled')}>{r.enabled ? 'Disable' : 'Enable'}</Button>
                  <IconButton size="small" color="error" onClick={() => { if (confirm('Delete rule?')) act(() => moderatorAdminApi.deleteRule(r.id), 'Deleted'); }}><DeleteIcon fontSize="small" /></IconButton>
                </>
              ),
            },
          ]}
        />
      )}
    </QueryState>
  );
}

function AppealsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['mod', 'appeals'], queryFn: () => moderatorAdminApi.appeals({ limit: 50 }) });
  const stats = useQuery({ queryKey: ['mod', 'appealstats'], queryFn: moderatorAdminApi.appealStats });
  const review = (id: string, decision: 'approve' | 'deny') =>
    moderatorAdminApi.reviewAppeal(id, decision, `${decision} from admin console`).then(() => { onToast(`Appeal ${decision}d`); qc.invalidateQueries({ queryKey: ['mod', 'appeals'] }); }).catch((e) => onToast((e as Error).message));
  return (
    <Stack spacing={2}>
      <Card title="Appeal stats">
        <QueryState query={stats}>{(d) => <pre style={{ margin: 0, fontSize: 12, overflow: 'auto' }}>{JSON.stringify(d, null, 2)}</pre>}</QueryState>
      </Card>
      <QueryState query={query} empty="No appeals.">
        {(d) => (
          <DataTable
            rows={arr<Appeal>(d, 'appeals', 'data')}
            rowKey={(a) => a.id}
            columns={[
              { key: 'reason', header: 'Reason', render: (a) => (a.reason ?? '—').slice(0, 60) },
              { key: 'userId', header: 'User', mono: true, render: (a) => (a.userId ?? '—').slice(0, 12) },
              { key: 'status', header: 'Status', render: (a) => <StatusChip status={a.status} /> },
              { key: 'createdAt', header: 'When', render: (a) => formatDate(a.createdAt) },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (a) => (
                  <>
                    <Button size="small" color="success" onClick={() => review(a.id, 'approve')}>Approve</Button>
                    <Button size="small" color="error" onClick={() => review(a.id, 'deny')}>Deny</Button>
                  </>
                ),
              },
            ]}
          />
        )}
      </QueryState>
    </Stack>
  );
}

function WorkflowsTab({ onToast }: { onToast: (m: string) => void }) {
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const query = useQuery({ queryKey: ['mod', 'workflows'], queryFn: moderatorAdminApi.workflows });
  return (
    <Stack spacing={2}>
      <QueryState query={query} empty="No workflows.">
        {(d) => (
          <DataTable
            rows={arr<Workflow>(d, 'workflows', 'data')}
            rowKey={(w) => w.id}
            columns={[
              { key: 'name', header: 'Name', render: (w) => w.name ?? '—' },
              { key: 'trigger', header: 'Trigger', render: (w) => w.trigger ?? '—' },
              { key: 'enabled', header: 'Enabled', render: (w) => (w.enabled ? 'yes' : 'no') },
              { key: 'exec', header: '', align: 'right', render: (w) => <Button size="small" onClick={() => moderatorAdminApi.executeWorkflow(w.id).then((v) => setView({ title: 'Execution', value: v })).catch((e) => onToast((e as Error).message))}>Execute</Button> },
            ]}
          />
        )}
      </QueryState>
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

function MetricsTab() {
  const [period, setPeriod] = useState('today');
  const metrics = useQuery({ queryKey: ['mod', 'metrics', period], queryFn: () => moderatorAdminApi.metrics(period) });
  const providers = useQuery({ queryKey: ['mod', 'providers'], queryFn: moderatorAdminApi.providersStatus });
  const actions = useQuery({ queryKey: ['mod', 'actions'], queryFn: () => moderatorAdminApi.recentActions(25) });
  return (
    <Stack spacing={2}>
      <TextField select size="small" label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} sx={{ maxWidth: 200 }}>
        {['today', 'week', 'month', 'all'].map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
      </TextField>
      <Card title="Metrics"><QueryState query={metrics}>{(d) => <pre style={{ margin: 0, fontSize: 12, overflow: 'auto' }}>{JSON.stringify(d, null, 2)}</pre>}</QueryState></Card>
      <Card title="AI providers"><QueryState query={providers}>{(d) => <pre style={{ margin: 0, fontSize: 12, overflow: 'auto' }}>{JSON.stringify(d, null, 2)}</pre>}</QueryState></Card>
      <Card title="Recent actions">
        <QueryState query={actions} empty="No recent actions.">
          {(d) => (
            <DataTable
              rows={arr<Record<string, unknown>>(d, 'actions', 'data')}
              rowKey={(a, i) => String(a.id ?? i)}
              columns={[
                { key: 'actionType', header: 'Action', render: (a) => String(a.actionType ?? '—') },
                { key: 'contentType', header: 'Content', render: (a) => String(a.contentType ?? '—') },
                { key: 'moderatorId', header: 'Moderator', mono: true, render: (a) => String(a.moderatorId ?? '—').slice(0, 12) },
                { key: 'createdAt', header: 'When', render: (a) => formatDate(a.createdAt as string) },
              ]}
            />
          )}
        </QueryState>
      </Card>
    </Stack>
  );
}

/* ------------------------------------------------------------------- page */

type ModTab = 'queue' | 'reports' | 'rules' | 'appeals' | 'workflows' | 'metrics' | 'config';

export function ModeratorSection() {
  const [tab, setTab] = useState<ModTab>('queue');
  const { showToast, ToastHost } = useToast();
  const moderatorId = useAppStore((s) => s.user?.id) ?? 'admin';
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Moderation" subtitle="Queue, reports, rules, appeals, workflows, metrics — /moderator/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab value="queue" label="Queue" />
        <Tab value="reports" label="Reports" />
        <Tab value="rules" label="Rules" />
        <Tab value="appeals" label="Appeals" />
        <Tab value="workflows" label="Workflows" />
        <Tab value="metrics" label="Metrics" />
        <Tab value="config" label="Config" />
      </Tabs>
      {tab === 'queue' && <QueueTab onToast={showToast} moderatorId={moderatorId} />}
      {tab === 'reports' && <ReportsTab onToast={showToast} moderatorId={moderatorId} />}
      {tab === 'rules' && <RulesTab onToast={showToast} />}
      {tab === 'appeals' && <AppealsTab onToast={showToast} />}
      {tab === 'workflows' && <WorkflowsTab onToast={showToast} />}
      {tab === 'metrics' && <MetricsTab />}
      {tab === 'config' && <ConfigSectionEditor sections={MODERATOR_CONFIG_SECTIONS} load={(s) => moderatorAdminApi.getConfigSection(s)} save={(s, data) => moderatorAdminApi.saveConfigSection(s, data)} />}
      {ToastHost}
    </Stack>
  );
}
