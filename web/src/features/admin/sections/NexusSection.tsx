import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Stack, Tab, Tabs, TextField } from '@mui/material';
import {
  nexusAdminApi,
  rows,
  NEXUS_CONFIG_SECTIONS,
  type Group,
  type Flag,
  type ModCase,
  type Proposal,
  type NexusEvent,
  type Subgroup,
} from '@/api/admin/nexus';
import { formatDate } from '@/features/files/util';
import { Card, ConfigSectionEditor, DataTable, JsonDialog, QueryState, SectionHeader, StatusChip, useToast } from '../ui';

/* ------------------------------------------------------------- groups ---- */

function GroupsTab() {
  const [search, setSearch] = useState('');
  const [view, setView] = useState<Group | null>(null);
  const query = useQuery({ queryKey: ['nexus', 'groups', search], queryFn: () => nexusAdminApi.listGroups({ search, limit: 100 }) });
  return (
    <Stack spacing={2}>
      <TextField size="small" label="Search groups" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ maxWidth: 360 }} />
      <QueryState query={query} empty="No groups.">
        {(d) => (
          <DataTable
            rows={d.groups ?? []}
            rowKey={(g) => g.id}
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'visibility', header: 'Visibility', render: (g) => g.visibility ?? '—' },
              { key: 'memberCount', header: 'Members', align: 'right', render: (g) => g.memberCount ?? 0 },
              { key: 'category', header: 'Category', render: (g) => g.category ?? '—' },
              { key: 'createdAt', header: 'Created', render: (g) => formatDate(g.createdAt) },
              { key: 'view', header: '', align: 'right', render: (g) => <Button size="small" onClick={() => setView(g)}>Details</Button> },
            ]}
          />
        )}
      </QueryState>
      <JsonDialog open={!!view} title={view?.name ?? 'Group'} value={view} onClose={() => setView(null)} />
    </Stack>
  );
}

/* ----------------------------------------------------------- trending ---- */

function TrendingTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['nexus', 'trending'], queryFn: () => nexusAdminApi.trendingGroups(25) });
  const recompute = useMutation({
    mutationFn: nexusAdminApi.recomputeTrending,
    onSuccess: () => { onToast('Trending recomputed'); qc.invalidateQueries({ queryKey: ['nexus', 'trending'] }); },
    onError: (e) => onToast((e as Error).message),
  });
  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="flex-end">
        <Button variant="contained" disabled={recompute.isPending} onClick={() => recompute.mutate()}>Recompute trending</Button>
      </Stack>
      <QueryState query={query} empty="No trending groups.">
        {(d) => (
          <DataTable
            rows={rows<Group>(d, 'groups', 'data')}
            rowKey={(g) => g.id}
            columns={[
              { key: 'name', header: 'Name' },
              { key: 'memberCount', header: 'Members', align: 'right', render: (g) => g.memberCount ?? 0 },
              { key: 'category', header: 'Category', render: (g) => g.category ?? '—' },
            ]}
          />
        )}
      </QueryState>
    </Stack>
  );
}

/* --------------------------------------------------------- moderation ---- */

function ModerationTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [groupId, setGroupId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [view, setView] = useState<{ title: string; value: unknown } | null>(null);
  const enabled = !!groupId;
  const flags = useQuery({ queryKey: ['nexus', 'flags', groupId], queryFn: () => nexusAdminApi.flags(groupId, { limit: 50 }), enabled });
  const queue = useQuery({ queryKey: ['nexus', 'queue', groupId], queryFn: () => nexusAdminApi.queue(groupId, { limit: 50 }), enabled });

  const action = (type: string) => {
    if (!caseId) return onToast('Enter a case id first');
    nexusAdminApi.caseAction(caseId, type, `${type} from admin console`).then(() => {
      onToast(`Case ${type}`);
      qc.invalidateQueries({ queryKey: ['nexus', 'queue', groupId] });
    }).catch((e) => onToast((e as Error).message));
  };

  return (
    <Stack spacing={2}>
      <Alert severity="info">Moderation is group-scoped — enter a group id to load its flags and case queue.</Alert>
      <TextField size="small" label="Group ID" value={groupId} onChange={(e) => setGroupId(e.target.value)} sx={{ maxWidth: 380 }} />
      {enabled && (
        <>
          <Card title="Flags">
            <QueryState query={flags} empty="No flags.">
              {(d) => (
                <DataTable
                  rows={rows<Flag>(d, 'flags', 'data')}
                  rowKey={(f) => f.id}
                  columns={[
                    { key: 'contentType', header: 'Content', render: (f) => `${f.contentType ?? ''}` },
                    { key: 'flagReason', header: 'Reason', render: (f) => f.flagReason ?? '—' },
                    { key: 'priority', header: 'Priority', render: (f) => f.priority ?? '—' },
                    { key: 'status', header: 'Status', render: (f) => <StatusChip status={f.status} /> },
                    { key: 'createdAt', header: 'When', render: (f) => formatDate(f.createdAt) },
                  ]}
                />
              )}
            </QueryState>
          </Card>
          <Card title="Case queue">
            <QueryState query={queue} empty="No open cases.">
              {(d) => (
                <DataTable
                  rows={rows<ModCase>(d, 'cases', 'queue', 'data')}
                  rowKey={(c) => c.id}
                  columns={[
                    { key: 'id', header: 'Case', mono: true, render: (c) => `${c.id.slice(0, 8)}…` },
                    { key: 'contentType', header: 'Content', render: (c) => c.contentType ?? '—' },
                    { key: 'priority', header: 'Priority', render: (c) => c.priority ?? '—' },
                    { key: 'status', header: 'Status', render: (c) => <StatusChip status={c.status} /> },
                    { key: 'use', header: '', align: 'right', render: (c) => <Button size="small" onClick={() => setCaseId(c.id)}>Select</Button> },
                  ]}
                />
              )}
            </QueryState>
          </Card>
          <Card title="Case action">
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
              <TextField size="small" label="Case ID" value={caseId} onChange={(e) => setCaseId(e.target.value)} sx={{ minWidth: 300 }} />
              <Button size="small" variant="outlined" onClick={() => action('warn')}>Warn</Button>
              <Button size="small" variant="outlined" color="warning" onClick={() => action('remove')}>Remove</Button>
              <Button size="small" variant="outlined" color="error" onClick={() => action('ban')}>Ban</Button>
              <Button size="small" disabled={!caseId} onClick={() => nexusAdminApi.caseDetail(caseId).then((v) => setView({ title: 'Case detail', value: v })).catch((e) => onToast((e as Error).message))}>View detail</Button>
            </Stack>
          </Card>
        </>
      )}
      <JsonDialog open={!!view} title={view?.title ?? ''} value={view?.value} onClose={() => setView(null)} />
    </Stack>
  );
}

/* ------------------------------------------ events / governance / subgroups */

function InspectTab() {
  const [groupId, setGroupId] = useState('');
  const enabled = !!groupId;
  const events = useQuery({ queryKey: ['nexus', 'events', groupId], queryFn: () => nexusAdminApi.events({ groupId, limit: 50 }), enabled });
  const proposals = useQuery({ queryKey: ['nexus', 'proposals', groupId], queryFn: () => nexusAdminApi.proposals(groupId, { limit: 50 }), enabled });
  const subgroups = useQuery({ queryKey: ['nexus', 'subgroups', groupId], queryFn: () => nexusAdminApi.subgroups(groupId), enabled });
  return (
    <Stack spacing={2}>
      <Alert severity="info">Enter a group id to inspect its events, governance proposals and subgroups.</Alert>
      <TextField size="small" label="Group ID" value={groupId} onChange={(e) => setGroupId(e.target.value)} sx={{ maxWidth: 380 }} />
      {enabled && (
        <>
          <Card title="Events">
            <QueryState query={events} empty="No events.">
              {(d) => (
                <DataTable
                  rows={rows<NexusEvent>(d, 'events', 'data')}
                  rowKey={(e) => e.id}
                  columns={[
                    { key: 'title', header: 'Title', render: (e) => e.title ?? '—' },
                    { key: 'eventType', header: 'Type', render: (e) => e.eventType ?? '—' },
                    { key: 'status', header: 'Status', render: (e) => <StatusChip status={e.status} /> },
                    { key: 'startTime', header: 'Starts', render: (e) => formatDate(e.startTime) },
                  ]}
                />
              )}
            </QueryState>
          </Card>
          <Card title="Governance proposals">
            <QueryState query={proposals} empty="No proposals.">
              {(d) => (
                <DataTable
                  rows={rows<Proposal>(d, 'proposals', 'data')}
                  rowKey={(p) => p.id}
                  columns={[
                    { key: 'title', header: 'Title', render: (p) => p.title ?? '—' },
                    { key: 'proposalType', header: 'Type', render: (p) => p.proposalType ?? '—' },
                    { key: 'status', header: 'Status', render: (p) => <StatusChip status={p.status} /> },
                    { key: 'votingEndsAt', header: 'Voting ends', render: (p) => formatDate(p.votingEndsAt) },
                  ]}
                />
              )}
            </QueryState>
          </Card>
          <Card title="Subgroups">
            <QueryState query={subgroups} empty="No subgroups.">
              {(d) => (
                <DataTable
                  rows={rows<Subgroup>(d, 'subgroups', 'data')}
                  rowKey={(s) => s.id}
                  columns={[
                    { key: 'name', header: 'Name', render: (s) => s.name ?? '—' },
                    { key: 'type', header: 'Type', render: (s) => s.type ?? '—' },
                    { key: 'visibility', header: 'Visibility', render: (s) => s.visibility ?? '—' },
                  ]}
                />
              )}
            </QueryState>
          </Card>
        </>
      )}
    </Stack>
  );
}

/* ------------------------------------------------------------------- page */

type NexusTab = 'groups' | 'trending' | 'moderation' | 'inspect' | 'config';

export function NexusSection() {
  const [tab, setTab] = useState<NexusTab>('groups');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Groups (Nexus)" subtitle="Groups, trending, group moderation, events & governance — /nexus/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        <Tab value="groups" label="Groups" />
        <Tab value="trending" label="Trending" />
        <Tab value="moderation" label="Moderation" />
        <Tab value="inspect" label="Events / Governance" />
        <Tab value="config" label="Config" />
      </Tabs>
      {tab === 'groups' && <GroupsTab />}
      {tab === 'trending' && <TrendingTab onToast={showToast} />}
      {tab === 'moderation' && <ModerationTab onToast={showToast} />}
      {tab === 'inspect' && <InspectTab />}
      {tab === 'config' && <ConfigSectionEditor sections={NEXUS_CONFIG_SECTIONS} load={(s) => nexusAdminApi.getConfigSection(s)} save={(s, data) => nexusAdminApi.saveConfigSection(s, data)} />}
      {ToastHost}
    </Stack>
  );
}
