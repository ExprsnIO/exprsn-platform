/**
 * Agent Tasks tab — create long-running agent tasks (202 + Bull worker) and
 * watch the task list; rows poll while anything is queued/running and click
 * through to the task detail page.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Button, Stack, TextField, Typography } from '@mui/material';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import { cortexApi } from '@/api/cortex';
import { Card, DataTable, QueryState } from '@/features/admin/ui';
import { formatDate } from '@/features/files/util';
import { CortexQueryError, ModelSelect, MultiSelect, TaskStatusChip, useSkills, useTools } from './shared';

export function TasksTab({
  onToast,
  onError,
}: {
  onToast: (msg: string, severity?: 'success' | 'error' | 'info' | 'warning') => void;
  onError: (e: unknown) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [goal, setGoal] = useState('');
  const [model, setModel] = useState('');
  const [tools, setTools] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);

  const toolsQuery = useTools();
  const skillsQuery = useSkills();
  const enabledTools = useMemo(
    () => (toolsQuery.data?.tools ?? []).filter((t) => t.enabled).map((t) => t.name),
    [toolsQuery.data],
  );
  const enabledSkills = useMemo(
    () => (skillsQuery.data?.skills ?? []).filter((s) => s.enabled).map((s) => s.name),
    [skillsQuery.data],
  );

  const tasksQuery = useQuery({
    queryKey: ['cortex', 'tasks'],
    queryFn: cortexApi.tasks,
    refetchInterval: (q) =>
      q.state.data?.tasks.some((t) => t.status === 'queued' || t.status === 'running') ? 5000 : false,
  });

  const create = useMutation({
    mutationFn: () =>
      cortexApi.createTask(goal.trim(), {
        ...(model && { model }),
        ...(tools.length && { tools }),
        ...(skills.length && { skills }),
      }),
    onSuccess: ({ id }) => {
      onToast('Agent task queued', 'success');
      setGoal('');
      qc.invalidateQueries({ queryKey: ['cortex', 'tasks'] });
      navigate(`/cortex/tasks/${encodeURIComponent(id)}`);
    },
    onError,
  });

  return (
    <Stack spacing={2}>
      <Card title="New agent task">
        <Stack spacing={1.5}>
          <TextField
            label="Goal"
            placeholder="Describe what the agent should accomplish…"
            multiline
            minRows={2}
            fullWidth
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
          />
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="flex-start">
            <ModelSelect value={model} onChange={setModel} sx={{ minWidth: 200 }} />
            <MultiSelect label="Tools" options={enabledTools} value={tools} onChange={setTools} sx={{ minWidth: 200 }} />
            <MultiSelect label="Skills" options={enabledSkills} value={skills} onChange={setSkills} sx={{ minWidth: 200 }} />
            <Box sx={{ flex: 1 }} />
            <Button
              variant="contained"
              startIcon={<RocketLaunchOutlinedIcon />}
              disabled={!goal.trim() || create.isPending}
              onClick={() => create.mutate()}
            >
              Run task
            </Button>
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Tasks run in the background — you&apos;ll be taken to the task page to watch progress.
          </Typography>
        </Stack>
      </Card>

      {tasksQuery.isError ? (
        <CortexQueryError error={tasksQuery.error} />
      ) : (
      <QueryState query={tasksQuery} empty="No agent tasks yet.">
        {(d) => (
          <DataTable
            rows={d.tasks}
            rowKey={(t) => t.id}
            onRowClick={(t) => navigate(`/cortex/tasks/${encodeURIComponent(t.id)}`)}
            columns={[
              { key: 'id', header: 'ID', mono: true, render: (t) => t.id.slice(0, 8) },
              { key: 'status', header: 'Status', render: (t) => <TaskStatusChip status={t.status} /> },
              {
                key: 'goal',
                header: 'Goal',
                render: (t) => (
                  <Box sx={{ maxWidth: 420, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.goal}
                  </Box>
                ),
              },
              { key: 'createdAt', header: 'Created', render: (t) => formatDate(t.createdAt) },
              { key: 'finishedAt', header: 'Finished', render: (t) => (t.finishedAt ? formatDate(t.finishedAt) : '—') },
            ]}
          />
        )}
      </QueryState>
      )}
    </Stack>
  );
}
