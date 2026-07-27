/**
 * Human-review queue for held/escalated agent output. Approve releases the
 * held content; a 409 means someone else resolved it first — refetch + toast.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  type GuardrailHit,
  type GuardrailVerdict,
  type TurnGuardrails,
} from '@/api/cortex';
import { cortexAdminApi, type Review } from '@/api/admin/cortex';
import { isHttpError, toMessage } from '@/lib/errors';
import { formatDate } from '@/features/files/util';
import { DataTable, SectionHeader } from '@/features/admin/ui';
import { ActionChip, CortexQueryState, type ToastFn } from './common';

const QK = ['cortex-admin', 'reviews'];

const KIND_LABEL: Record<string, string> = {
  assistant_reply: 'assistant reply',
  cs_chat_input: 'CS chat input',
  cs_chat_reply: 'CS chat reply',
  cs_email: 'CS email',
};

function collectHits(g?: TurnGuardrails | null): Array<{ where: string; hit: GuardrailHit }> {
  const out: Array<{ where: string; hit: GuardrailHit }> = [];
  if (!g) return out;
  for (const where of ['input', 'output'] as const) {
    const verdict = g[where] as GuardrailVerdict | undefined;
    for (const hit of verdict?.hits ?? []) out.push({ where, hit });
  }
  return out;
}

function ResolveDialog({ review, onClose, toast }: { review: Review | null; onClose: () => void; toast: ToastFn }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');

  const resolve = useMutation({
    mutationFn: (action: 'approve' | 'reject') =>
      cortexAdminApi.resolveReview((review as Review).id, action, note.trim() || undefined),
    onSuccess: (r) => {
      toast(`Review ${r.status}`, 'success');
      qc.invalidateQueries({ queryKey: QK });
      setNote('');
      onClose();
    },
    onError: (e) => {
      if (isHttpError(e, 409)) {
        toast('Already resolved by someone else — list refreshed', 'info');
        qc.invalidateQueries({ queryKey: QK });
        onClose();
        return;
      }
      toast(toMessage(e), 'error');
    },
  });

  const hits = collectHits(review?.guardrails);

  return (
    <Dialog open={!!review} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Review {review && <Chip size="small" variant="outlined" label={KIND_LABEL[review.kind] ?? review.kind} sx={{ ml: 1 }} />}
      </DialogTitle>
      <DialogContent dividers>
        {review && (
          <Stack spacing={2}>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Typography variant="caption" color="text.secondary">
                id <Box component="span" sx={{ fontFamily: 'monospace' }}>{review.id}</Box>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                created {formatDate(review.createdAt)}
              </Typography>
              {(review.sessionId || review.outboxId) && (
                <Typography variant="caption" color="text.secondary">
                  {review.sessionId ? 'session' : 'outbox'}{' '}
                  <Box component="span" sx={{ fontFamily: 'monospace' }}>{review.sessionId ?? review.outboxId}</Box>
                </Typography>
              )}
            </Stack>

            {review.customerMessage && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Customer message</Typography>
                <Paper variant="outlined" sx={{ p: 1.5, borderLeft: '3px solid', borderLeftColor: 'divider' }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {review.customerMessage}
                  </Typography>
                </Paper>
              </Box>
            )}

            {review.draft && (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Held draft reply</Typography>
                <Paper
                  variant="outlined"
                  sx={{ p: 1.5, borderLeft: '3px solid', borderLeftColor: 'primary.main', bgcolor: 'action.hover' }}
                >
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                    {review.draft}
                  </Typography>
                </Paper>
              </Box>
            )}

            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Guardrail hits</Typography>
              {hits.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No recorded guardrail hits.
                </Typography>
              ) : (
                <Stack spacing={0.75}>
                  {hits.map(({ where, hit }, i) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                      <ActionChip action={hit.action} />
                      <Typography variant="body2" fontWeight={600}>{hit.guardrail}</Typography>
                      <Chip size="small" variant="outlined" label={where} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                        {hit.rule_type}: {hit.rule}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Box>

            <TextField
              label="Note (optional)"
              multiline
              minRows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              helperText="stored on the review as the resolution note"
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button color="error" variant="outlined" disabled={resolve.isPending} onClick={() => resolve.mutate('reject')}>
          Reject
        </Button>
        <Button color="success" variant="contained" disabled={resolve.isPending} onClick={() => resolve.mutate('approve')}>
          Approve
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ReviewsTab({ toast }: { toast: ToastFn }) {
  const query = useQuery({
    queryKey: QK,
    queryFn: cortexAdminApi.reviews,
    refetchInterval: 10_000,
  });
  const [active, setActive] = useState<Review | null>(null);

  return (
    <Stack spacing={2}>
      <SectionHeader
        level={2}
        title="Reviews"
        subtitle="Escalated / held agent output awaiting a human verdict — approve releases the content"
      />
      <CortexQueryState query={query} empty="No pending reviews.">
        {(d) => (
          <DataTable
            rows={d.reviews}
            rowKey={(r) => r.id}
            tableId="cortex-reviews"
            sortable
            onRowClick={(r) => setActive(r)}
            empty="No pending reviews."
            initialSort={{ key: 'createdAt', dir: 'desc' }}
            columns={[
              { key: 'id', header: 'Id', mono: true, render: (r) => r.id.slice(0, 8) },
              {
                key: 'kind',
                header: 'Kind',
                render: (r) => <Chip size="small" variant="outlined" label={KIND_LABEL[r.kind] ?? r.kind} />,
              },
              { key: 'createdAt', header: 'Created', render: (r) => formatDate(r.createdAt) },
              {
                key: 'ref',
                header: 'Session / outbox',
                mono: true,
                sortValue: (r) => r.sessionId ?? r.outboxId ?? '',
                filterValue: (r) => `${r.sessionId ?? ''} ${r.outboxId ?? ''}`,
                render: (r) => r.sessionId ?? r.outboxId ?? '—',
              },
            ]}
          />
        )}
      </CortexQueryState>
      <ResolveDialog review={active} onClose={() => setActive(null)} toast={toast} />
    </Stack>
  );
}
