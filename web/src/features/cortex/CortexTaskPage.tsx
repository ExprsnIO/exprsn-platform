/**
 * Agent task detail (route /cortex/tasks/:id) — polls the task until it
 * reaches a terminal state and renders the run transcript as a step list:
 * assistant turns as bubbles, tool calls/results as mono rows and collapsed
 * blocks, guardrail interventions as alerts, system notes as info.
 */
import { Link as RouterLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Stack,
  Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { cortexApi, type TranscriptEntry } from '@/api/cortex';
import { isHttpError } from '@/lib/errors';
import { Card, Loading } from '@/features/admin/ui';
import { formatDate } from '@/features/files/util';
import {
  ChatBubble,
  CortexQueryError,
  GuardrailHitList,
  TaskStatusChip,
  TypingIndicator,
} from './shared';

const MONO = { fontFamily: 'monospace', fontSize: 12.5 } as const;

function TranscriptStep({ entry }: { entry: TranscriptEntry }) {
  if (entry.role === 'assistant') {
    return (
      <Stack spacing={1}>
        {(entry.tool_calls ?? []).map((c, i) => (
          <Box key={i} sx={{ ...MONO, color: 'text.secondary', wordBreak: 'break-all' }}>
            → {c.name}({c.arguments})
          </Box>
        ))}
        {entry.content && <ChatBubble mine={false}>{entry.content}</ChatBubble>}
      </Stack>
    );
  }
  if (entry.role === 'tool') {
    return (
      <Accordion disableGutters variant="outlined" sx={{ '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" />}>
          <Typography sx={{ ...MONO, color: 'text.secondary' }}>
            {entry.name ?? 'tool'} result
          </Typography>
        </AccordionSummary>
        <AccordionDetails>
          <Box component="pre" sx={{ ...MONO, m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {entry.content ?? ''}
          </Box>
        </AccordionDetails>
      </Accordion>
    );
  }
  if (entry.role === 'guardrail') {
    return (
      <Alert severity={entry.action === 'block' ? 'error' : 'warning'}>
        Guardrail {entry.action ?? 'intervention'}
        {entry.tool ? ` on tool ${entry.tool}` : ''}
        {entry.scope ? ` (${entry.scope})` : ''}
        {entry.hits && entry.hits.length > 0 && <GuardrailHitList hits={entry.hits} />}
      </Alert>
    );
  }
  return <Alert severity="info">{entry.note ?? entry.content ?? 'system'}</Alert>;
}

export function CortexTaskPage() {
  const { id } = useParams<{ id: string }>();

  const query = useQuery({
    queryKey: ['cortex', 'task', id],
    queryFn: () => cortexApi.task(id!),
    enabled: !!id,
    retry: (count, e) => !isHttpError(e, 404) && count < 2,
    refetchInterval: (q) => {
      if (isHttpError(q.state.error, 404)) return false;
      return q.state.data && ['done', 'failed'].includes(q.state.data.status) ? false : 3000;
    },
  });

  const task = query.data;
  const finalHits = task?.guardrails?.hits ?? [];

  return (
    <Stack spacing={2}>
      <Box>
        <Button component={RouterLink} to="/cortex" size="small" startIcon={<ArrowBackIcon />}>
          Back to Cortex
        </Button>
      </Box>

      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        isHttpError(query.error, 404) ? (
          <Alert severity="info">
            Task not found — it may belong to another user or have been removed.
          </Alert>
        ) : (
          <CortexQueryError error={query.error} />
        )
      ) : task ? (
        <>
          <Stack spacing={0.75}>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="h5" component="h1" sx={{ wordBreak: 'break-word' }}>
                {task.goal}
              </Typography>
              <TaskStatusChip status={task.status} />
            </Stack>
            <Typography variant="body2" color="text.secondary">
              {task.model ? `Model ${task.model} · ` : ''}
              Created {formatDate(task.createdAt)}
              {task.finishedAt ? ` · Finished ${formatDate(task.finishedAt)}` : ''}
            </Typography>
          </Stack>

          {task.status === 'failed' && (
            <Alert severity="error">{task.error || 'The task failed without an error message.'}</Alert>
          )}

          {task.status === 'done' && (
            <Card title="Result">
              <Box sx={{ fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {task.result || 'The task finished without a result.'}
              </Box>
            </Card>
          )}

          {finalHits.length > 0 && (
            <Alert severity={task.guardrails?.action === 'block' ? 'error' : 'warning'}>
              Final guardrail verdict: {task.guardrails?.action ?? 'flagged'}
              <GuardrailHitList hits={finalHits} />
            </Alert>
          )}

          <Card title="Transcript">
            {task.transcript && task.transcript.length > 0 ? (
              <Stack spacing={1.5}>
                {task.transcript.map((entry, i) => (
                  <TranscriptStep key={i} entry={entry} />
                ))}
                {(task.status === 'queued' || task.status === 'running') && <TypingIndicator />}
              </Stack>
            ) : task.status === 'queued' || task.status === 'running' ? (
              <Stack spacing={1} alignItems="flex-start">
                <Typography variant="body2" color="text.secondary">
                  {task.status === 'queued' ? 'Waiting for a worker…' : 'The agent is working…'}
                </Typography>
                <TypingIndicator />
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No transcript was recorded for this task.
              </Typography>
            )}
          </Card>
        </>
      ) : null}
    </Stack>
  );
}
