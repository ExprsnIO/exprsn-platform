/**
 * Outbox tab — CS email replies drafted by the agent. Rows open a structured
 * detail dialog (to/subject/status/body + guardrail hits), never raw JSON.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { cortexApi } from '@/api/cortex';
import { DataTable, Loading, QueryState } from '@/features/admin/ui';
import { formatDate } from '@/features/files/util';
import { CortexQueryError, GuardrailHitList, OutboxStatusChip, collectHits } from './shared';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={2} alignItems="baseline">
      <Typography variant="body2" color="text.secondary" sx={{ width: 90, flexShrink: 0 }}>
        {label}
      </Typography>
      <Box sx={{ fontSize: 14, minWidth: 0 }}>{value}</Box>
    </Stack>
  );
}

function OutboxDetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useQuery({
    queryKey: ['cortex', 'outbox', id],
    queryFn: () => cortexApi.outboxEntry(id),
  });
  const entry = query.data;
  const hits = collectHits(entry?.guardrails);

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Outbox entry</DialogTitle>
      <DialogContent dividers>
        {query.isLoading ? (
          <Loading />
        ) : query.isError ? (
          <CortexQueryError error={query.error} />
        ) : entry ? (
          <Stack spacing={1.5}>
            <Row label="To" value={entry.toAddress} />
            <Row label="Subject" value={entry.subject} />
            <Row label="Status" value={<OutboxStatusChip status={entry.status} />} />
            <Row label="Created" value={formatDate(entry.createdAt)} />
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Reply body
              </Typography>
              {entry.body ? (
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: 'action.hover',
                    fontSize: 14,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '40vh',
                    overflowY: 'auto',
                  }}
                >
                  {entry.body}
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No body {entry.status === 'blocked' ? '— the draft was blocked' : 'recorded'}.
                </Typography>
              )}
            </Box>
            {hits.length > 0 && (
              <Box>
                <Typography variant="subtitle2">Guardrail hits</Typography>
                <GuardrailHitList hits={hits} />
              </Box>
            )}
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export function OutboxTab() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ['cortex', 'outbox'], queryFn: cortexApi.outbox });

  if (query.isError) return <CortexQueryError error={query.error} />;

  return (
    <>
      <QueryState query={query} empty="The outbox is empty — CS email replies land here.">
        {(d) => (
          <DataTable
            rows={d.outbox}
            rowKey={(o) => o.id}
            onRowClick={(o) => setSelectedId(o.id)}
            columns={[
              { key: 'status', header: 'Status', render: (o) => <OutboxStatusChip status={o.status} /> },
              {
                key: 'subject',
                header: 'Subject',
                render: (o) => (
                  <Box sx={{ maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.subject}
                  </Box>
                ),
              },
              { key: 'toAddress', header: 'To', mono: true },
              { key: 'createdAt', header: 'Created', render: (o) => formatDate(o.createdAt) },
            ]}
          />
        )}
      </QueryState>
      {selectedId && <OutboxDetailDialog id={selectedId} onClose={() => setSelectedId(null)} />}
    </>
  );
}
