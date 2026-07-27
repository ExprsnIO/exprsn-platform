/**
 * Cortex user workspace (FEAT-022) — assistant chat, agent tasks, guarded CS
 * flows, and the CS outbox behind one tabbed page. Gated on /cortex/health:
 * when the module ships dark (CORTEX_ENABLED off) we render a clear disabled
 * state instead of the tabs.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Stack, Tab, Tabs, Typography } from '@mui/material';
import { cortexApi } from '@/api/cortex';
import { Loading, useToast } from '@/features/admin/ui';
import { AssistantTab } from './AssistantTab';
import { TasksTab } from './TasksTab';
import { CustomerServiceTab } from './CustomerServiceTab';
import { OutboxTab } from './OutboxTab';
import { CortexDisabledAlert, CortexQueryError } from './shared';

type CortexTab = 'assistant' | 'tasks' | 'cs' | 'outbox';

export function CortexPage() {
  const [tab, setTab] = useState<CortexTab>('assistant');
  const { showToast, showError, ToastHost } = useToast();

  const health = useQuery({ queryKey: ['cortex', 'health'], queryFn: cortexApi.health });

  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h1">AI (Cortex)</Typography>

      {health.isLoading ? (
        <Loading />
      ) : health.isError ? (
        <CortexQueryError error={health.error} />
      ) : health.data && health.data.enabled === false ? (
        <CortexDisabledAlert />
      ) : (
        <>
          <Tabs value={tab} onChange={(_e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
            <Tab value="assistant" label="Assistant" />
            <Tab value="tasks" label="Agent Tasks" />
            <Tab value="cs" label="Customer Service" />
            <Tab value="outbox" label="Outbox" />
          </Tabs>
          {tab === 'assistant' && <AssistantTab onError={showError} />}
          {tab === 'tasks' && <TasksTab onToast={showToast} onError={showError} />}
          {tab === 'cs' && <CustomerServiceTab onError={showError} />}
          {tab === 'outbox' && <OutboxTab />}
        </>
      )}

      {ToastHost}
    </Stack>
  );
}
