/**
 * Prompt log: every LLM round-trip (channel, model, latency, cache hit,
 * guardrail verdicts) with a filter bar and offset pagination. Row detail uses
 * the typed DataView (via JsonDialog) — no raw JSON dumps by default.
 */
import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { cortexAdminApi, type PromptLogRow } from '@/api/admin/cortex';
import { formatDate } from '@/features/files/util';
import { DataTable, JsonDialog, SectionHeader } from '@/features/admin/ui';
import { CortexQueryState } from './common';

const PAGE = 50;
const CHANNELS = ['all', 'assistant', 'cs_chat', 'cs_email', 'task', 'judge', 'build'];

interface Filters {
  channel: string;
  session: string;
  q: string;
}

/** True when the row's guardrail bundle recorded at least one hit. */
function hasGuardrailHits(g: unknown): boolean {
  if (!g || typeof g !== 'object') return false;
  return Object.values(g as Record<string, unknown>).some(
    (v) =>
      !!v &&
      typeof v === 'object' &&
      Array.isArray((v as { hits?: unknown }).hits) &&
      ((v as { hits: unknown[] }).hits.length > 0),
  );
}

export function PromptLogTab() {
  const [draft, setDraft] = useState<Filters>({ channel: 'all', session: '', q: '' });
  const [applied, setApplied] = useState<Filters>(draft);
  const [offset, setOffset] = useState(0);
  const [detail, setDetail] = useState<PromptLogRow | null>(null);

  const query = useQuery({
    queryKey: ['cortex-admin', 'prompts', applied, offset],
    queryFn: () =>
      cortexAdminApi.prompts({
        channel: applied.channel === 'all' ? undefined : applied.channel,
        session: applied.session.trim() || undefined,
        q: applied.q.trim() || undefined,
        limit: PAGE,
        offset,
      }),
    placeholderData: keepPreviousData,
  });

  const apply = () => {
    setApplied(draft);
    setOffset(0);
  };

  const total = query.data?.total ?? 0;

  return (
    <Stack spacing={2}>
      <SectionHeader level={2} title="Prompt log" subtitle="Every LLM round-trip: model, latency, cache hits, guardrail verdicts" />

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        <TextField
          select
          size="small"
          label="Channel"
          value={draft.channel}
          onChange={(e) => setDraft((f) => ({ ...f, channel: e.target.value }))}
          sx={{ minWidth: 150 }}
        >
          {CHANNELS.map((c) => (
            <MenuItem key={c} value={c}>
              {c}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          size="small"
          label="Session"
          value={draft.session}
          onChange={(e) => setDraft((f) => ({ ...f, session: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          sx={{ minWidth: 200 }}
        />
        <TextField
          size="small"
          label="Search"
          value={draft.q}
          onChange={(e) => setDraft((f) => ({ ...f, q: e.target.value }))}
          onKeyDown={(e) => e.key === 'Enter' && apply()}
          sx={{ minWidth: 220 }}
        />
        <Button variant="outlined" onClick={apply}>
          Apply
        </Button>
      </Stack>

      <CortexQueryState query={query} empty="No prompt-log entries match.">
        {(d) => (
          <Stack spacing={1}>
            <DataTable
              rows={d.rows}
              rowKey={(r) => r.id}
              tableId="cortex-prompts"
              onRowClick={(r) => setDetail(r)}
              empty="No prompt-log entries match."
              columns={[
                { key: 'createdAt', header: 'Created', render: (r) => formatDate(r.createdAt) },
                { key: 'channel', header: 'Channel' },
                {
                  key: 'sessionId',
                  header: 'Session',
                  mono: true,
                  render: (r) => (r.sessionId ? r.sessionId.slice(0, 12) : '—'),
                },
                { key: 'model', header: 'Model', render: (r) => r.model ?? '—' },
                { key: 'latencyMs', header: 'Latency (ms)', align: 'right', render: (r) => r.latencyMs ?? '—' },
                {
                  key: 'cached',
                  header: 'Cached',
                  render: (r) => (r.cached ? <Chip size="small" color="info" variant="outlined" label="cached" /> : '—'),
                },
                {
                  key: 'guardrails',
                  header: 'Guardrails',
                  render: (r) =>
                    hasGuardrailHits(r.guardrails) ? (
                      <Chip size="small" color="warning" variant="outlined" label="hits" />
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
            <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
              <Typography variant="caption" color="text.secondary">
                {total === 0 ? '0' : `${offset + 1}–${Math.min(offset + PAGE, total)} of ${total}`}
              </Typography>
              <Button size="small" disabled={offset === 0 || query.isFetching} onClick={() => setOffset((o) => Math.max(0, o - PAGE))}>
                Prev
              </Button>
              <Button size="small" disabled={offset + PAGE >= total || query.isFetching} onClick={() => setOffset((o) => o + PAGE)}>
                Next
              </Button>
            </Stack>
          </Stack>
        )}
      </CortexQueryState>

      <JsonDialog
        open={!!detail}
        title={`Prompt ${detail ? detail.id.slice(0, 8) : ''} — ${detail?.channel ?? ''}`}
        value={
          detail && {
            channel: detail.channel,
            model: detail.model,
            sessionId: detail.sessionId,
            latencyMs: detail.latencyMs,
            cached: detail.cached,
            createdAt: detail.createdAt,
            prompt: detail.prompt,
            response: detail.response,
            usage: detail.usage,
            guardrails: detail.guardrails,
          }
        }
        onClose={() => setDetail(null)}
      />
    </Stack>
  );
}
