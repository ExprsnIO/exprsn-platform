import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Chip, Stack, Tab, Tabs } from '@mui/material';
import { sparkAdminApi, SPARK_CONFIG_SECTIONS } from '@/api/admin/spark';
import { asQueueMap } from '@/api/admin/jobs';
import { Card, ConfigSectionEditor, DataView, QueryState, SectionHeader, useToast } from '../ui';

function QueuesTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['spark', 'queues'], queryFn: sparkAdminApi.queueStats });
  const act = (fn: () => Promise<unknown>, msg: string) =>
    fn().then(() => { onToast(msg); qc.invalidateQueries({ queryKey: ['spark', 'queues'] }); }).catch((e) => onToast((e as Error).message));
  return (
    <QueryState query={query} empty="No spark queues reported.">
      {(raw) => {
        const map = asQueueMap(raw);
        const names = Object.keys(map);
        if (!names.length) return <DataView value={raw} />;
        return (
          <Stack spacing={1.5}>
            {names.map((name) => (
              <Card
                key={name}
                title={name}
                actions={
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => act(() => sparkAdminApi.pause(name), `Paused ${name}`)}>Pause</Button>
                    <Button size="small" onClick={() => act(() => sparkAdminApi.resume(name), `Resumed ${name}`)}>Resume</Button>
                    <Button size="small" onClick={() => act(() => sparkAdminApi.clean(name), `Cleaned ${name}`)}>Clean</Button>
                  </Stack>
                }
              >
                <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
                  {['waiting', 'active', 'completed', 'failed', 'delayed', 'paused'].map((k) => (
                    <Chip key={k} size="small" variant="outlined" label={`${k}: ${map[name][k] ?? 0}`} />
                  ))}
                </Stack>
              </Card>
            ))}
          </Stack>
        );
      }}
    </QueryState>
  );
}

type SparkTab = 'queues' | 'config';

export function SparkSection() {
  const [tab, setTab] = useState<SparkTab>('queues');
  const { showToast, ToastHost } = useToast();
  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Messaging (Spark)" subtitle="Media/attachment job queues and runtime config — /spark/api" />
      <Tabs value={tab} onChange={(_e, v) => setTab(v)}>
        <Tab value="queues" label="Queues" />
        <Tab value="config" label="Config" />
      </Tabs>
      {tab === 'queues' && <QueuesTab onToast={showToast} />}
      {tab === 'config' && <ConfigSectionEditor sections={SPARK_CONFIG_SECTIONS} load={(s) => sparkAdminApi.getConfigSection(s)} save={(s, data) => sparkAdminApi.saveConfigSection(s, data)} />}
      {ToastHost}
    </Stack>
  );
}
