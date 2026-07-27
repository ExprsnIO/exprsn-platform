import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, IconButton, MenuItem, Stack, Tab, Tabs, TextField, Tooltip } from '@mui/material';
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
  type Rule,
  type Appeal,
} from '@/api/admin/moderator';
import { formatDate } from '@/features/files/util';
import { Card, ConfigSectionEditor, DataTable, DataView, JsonDialog, QueryState, SectionHeader, StatusChip, useToast } from '../ui';
import { RuleBuilderDialog } from './moderator/RuleBuilderDialog';
import { WordListsTab } from './moderator/WordListsTab';
import { WorkflowsTab } from './moderator/WorkflowsTab';
import { QueuesTab } from './moderator/QueuesTab';

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

function appliesToText(v: unknown): string {
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return v ? String(v) : '—';
}

function RulesTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ rule: Rule | null } | null>(null);
  const query = useQuery({ queryKey: ['mod', 'rules'], queryFn: () => moderatorAdminApi.rules({ limit: 200 }) });
  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); qc.invalidateQueries({ queryKey: ['mod', 'rules'] }); }).catch((e) => onToast((e as Error).message));
  const rows = arr<ModRule>(query.data ?? {}, 'rules', 'data');
  const nameById = new Map(rows.map((r) => [r.id, (r.name as string) ?? r.id]));
  return (
    <Stack spacing={2}>
      <SectionHeader
        level={2}
        title="Rules"
        subtitle="Condition-tree rules evaluated by the moderation engine"
        actions={<Button variant="contained" onClick={() => setDialog({ rule: null })}>New rule</Button>}
      />
      <QueryState query={query} empty="No rules.">
        {(d) => (
          <DataTable
            rows={arr<ModRule>(d, 'rules', 'data')}
            rowKey={(r) => r.id}
            columns={[
              {
                key: 'name',
                header: 'Name',
                render: (r) => (
                  <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap" useFlexGap>
                    <span>{(r.name as string) ?? '—'}</span>
                    {(r.metadata as { safeguard?: boolean } | undefined)?.safeguard && <Chip size="small" color="info" variant="outlined" label="safeguard" />}
                    {(r.metadata as { gate?: boolean } | undefined)?.gate && <Chip size="small" color="warning" variant="outlined" label="gate" />}
                  </Stack>
                ),
              },
              { key: 'action', header: 'Action', render: (r) => r.action ?? '—' },
              { key: 'appliesTo', header: 'Applies to', render: (r) => appliesToText(r.appliesTo) },
              { key: 'parent', header: 'Parent', render: (r) => (r.parentRuleId ? nameById.get(r.parentRuleId as string) ?? String(r.parentRuleId).slice(0, 8) : '—') },
              { key: 'priority', header: 'Priority', align: 'right', render: (r) => r.priority ?? 0 },
              { key: 'enabled', header: 'Enabled', render: (r) => (r.enabled ? 'yes' : 'no') },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (r) => (
                  <>
                    <Button size="small" onClick={() => setDialog({ rule: r as unknown as Rule })}>Edit</Button>
                    <Button size="small" onClick={() => act(() => (r.enabled ? moderatorAdminApi.disableRule(r.id) : moderatorAdminApi.enableRule(r.id)), 'Toggled')}>{r.enabled ? 'Disable' : 'Enable'}</Button>
                    <IconButton size="small" color="error" onClick={() => { if (confirm('Delete rule?')) act(() => moderatorAdminApi.deleteRule(r.id), 'Deleted'); }}><DeleteIcon fontSize="small" /></IconButton>
                  </>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <RuleBuilderDialog
        open={!!dialog}
        rule={dialog?.rule}
        allRules={rows.map((r) => ({ id: r.id, name: r.name as string | undefined }))}
        onClose={() => setDialog(null)}
        onDone={onToast}
      />
    </Stack>
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
        <QueryState query={stats}>{(d) => <DataView value={d} />}</QueryState>
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
      <Card title="Metrics"><QueryState query={metrics}>{(d) => <DataView value={d} />}</QueryState></Card>
      <Card title="AI providers"><QueryState query={providers}>{(d) => <DataView value={d} />}</QueryState></Card>
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

type ModTab = 'queue' | 'reports' | 'rules' | 'wordlists' | 'appeals' | 'workflows' | 'queues' | 'metrics' | 'config';

export function ModeratorSection() {
  const [tab, setTab] = useState<ModTab>('queue');
  const { showToast, ToastHost } = useToast();
  const moderatorId = useAppStore((s) => s.user?.id) ?? 'admin';
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Moderation" subtitle="Queue, reports, rules, word lists, appeals, workflows, queues, metrics — /moderator/api (AI agents moved to Infrastructure → AI)" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab value="queue" label="Queue" />
        <Tab value="reports" label="Reports" />
        <Tab value="rules" label="Rules" />
        <Tab value="wordlists" label="Word Lists" />
        <Tab value="appeals" label="Appeals" />
        <Tab value="workflows" label="Workflows" />
        <Tab value="queues" label="Queues" />
        <Tab value="metrics" label="Metrics" />
        <Tab value="config" label="Config" />
      </Tabs>
      {tab === 'queue' && <QueueTab onToast={showToast} moderatorId={moderatorId} />}
      {tab === 'reports' && <ReportsTab onToast={showToast} moderatorId={moderatorId} />}
      {tab === 'rules' && <RulesTab onToast={showToast} />}
      {tab === 'wordlists' && <WordListsTab onToast={showToast} />}
      {tab === 'appeals' && <AppealsTab onToast={showToast} />}
      {tab === 'workflows' && <WorkflowsTab onToast={showToast} />}
      {tab === 'queues' && <QueuesTab onToast={showToast} />}
      {tab === 'metrics' && <MetricsTab />}
      {tab === 'config' && <ConfigSectionEditor sections={MODERATOR_CONFIG_SECTIONS} load={(s) => moderatorAdminApi.getConfigSection(s)} save={(s, data) => moderatorAdminApi.saveConfigSection(s, data)} />}
      {ToastHost}
    </Stack>
  );
}
