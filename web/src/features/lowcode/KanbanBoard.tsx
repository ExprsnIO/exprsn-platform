/**
 * Kanban view over an entity's records — one column per value of a chosen enum
 * field (or per state-machine state). Cards move between columns via an
 * explicit menu (no drag dependency); a move writes the group field (or fires
 * a state transition when grouping by lifecycle state).
 */
import { useMemo, useState } from 'react';
import {
  Alert, Box, Card, CardActionArea, CardContent, Chip, CircularProgress, IconButton, Menu,
  MenuItem, Paper, Stack, Tooltip, Typography,
} from '@mui/material';
import DriveFileMoveOutlinedIcon from '@mui/icons-material/DriveFileMoveOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lowcodeApi, type Entity, type Field, type LcRecord, type LookupValue } from '@/api/lowcode';
import { toMessage } from '@/lib/errors';

export const KANBAN_STATE_COLUMN = '__state';

/** Fields usable as kanban columns: enums, plus lifecycle state if present. */
export function kanbanGroupFields(entity: Entity): { key: string; label: string }[] {
  const enums = (entity.fields ?? [])
    .filter((f) => f.type === 'enum')
    .map((f) => ({ key: f.key, label: f.label || f.key }));
  if (entity.stateMachine?.states?.length) enums.unshift({ key: KANBAN_STATE_COLUMN, label: 'Lifecycle state' });
  return enums;
}

function columnValues(entity: Entity, groupKey: string, lookupOptions: Record<string, LookupValue[]>): string[] {
  if (groupKey === KANBAN_STATE_COLUMN) return entity.stateMachine?.states ?? [];
  const f = entity.fields.find((x) => x.key === groupKey);
  if (!f) return [];
  if (f.enumValues?.length) return f.enumValues;
  if (f.enumLookup && lookupOptions[f.enumLookup]) return lookupOptions[f.enumLookup].map((v) => v.value);
  return [];
}

function cardTitle(r: LcRecord, entity: Entity): string {
  const firstText = entity.fields.find((f) => ['string', 'text'].includes(f.type));
  const v = firstText ? (r.data ?? {})[firstText.key] : undefined;
  return v ? String(v) : String(r.id).slice(0, 8);
}

function cardMeta(r: LcRecord, entity: Entity, groupKey: string): { field: Field; value: unknown }[] {
  return entity.fields
    .filter((f) => f.key !== groupKey && !['text', 'json'].includes(f.type))
    .slice(1, 4)
    .map((f) => ({ field: f, value: (r.data ?? {})[f.key] }))
    .filter((m) => m.value !== undefined && m.value !== null && m.value !== '');
}

export function KanbanBoard({
  entity, appKey, groupKey, lookupOptions = {}, canEdit, onOpen,
}: {
  entity: Entity;
  appKey: string;
  groupKey: string;
  lookupOptions?: Record<string, LookupValue[]>;
  canEdit: boolean;
  onOpen: (record: LcRecord) => void;
}) {
  const qc = useQueryClient();
  const [moveFrom, setMoveFrom] = useState<{ record: LcRecord; anchor: HTMLElement } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byState = groupKey === KANBAN_STATE_COLUMN;

  const recordsQ = useQuery({
    queryKey: ['lowcode', 'records', entity.appId, entity.key, 'kanban'],
    queryFn: () => lowcodeApi.records(entity.key, appKey, { limit: 500 }),
  });

  const move = useMutation({
    mutationFn: async ({ record, to }: { record: LcRecord; to: string }) => {
      if (byState) {
        // Grouping by lifecycle: find a transition event from the record's state.
        const t = entity.stateMachine?.transitions.find((x) => x.from === (record.state ?? entity.stateMachine?.initial) && x.to === to);
        if (!t) throw new Error(`No transition from "${record.state ?? '(initial)'}" to "${to}" — edit the state machine.`);
        return lowcodeApi.transitionRecord(entity.key, appKey, record.id, { event: t.event });
      }
      return lowcodeApi.updateRecord(entity.key, appKey, record.id, { [groupKey]: to });
    },
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ['lowcode', 'records', entity.appId, entity.key] }); },
    onError: (e) => setError(toMessage(e)),
  });

  const columns = useMemo(() => columnValues(entity, groupKey, lookupOptions), [entity, groupKey, lookupOptions]);
  const records = recordsQ.data?.records ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, LcRecord[]>(columns.map((c) => [c, []]));
    const other: LcRecord[] = [];
    for (const r of records) {
      const v = byState ? (r.state ?? entity.stateMachine?.initial ?? '') : String((r.data ?? {})[groupKey] ?? '');
      if (map.has(v)) map.get(v)!.push(r); else other.push(r);
    }
    return { map, other };
  }, [records, columns, groupKey, byState, entity.stateMachine]);

  if (recordsQ.isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (recordsQ.isError) return <Alert severity="error">Failed to load records.</Alert>;
  if (!columns.length) return <Alert severity="info">Pick an enum field (or add a state machine) to lay out the board.</Alert>;

  const renderCard = (r: LcRecord) => (
    <Card key={r.id} variant="outlined" sx={{ mb: 1 }}>
      <CardActionArea onClick={() => onOpen(r)}>
        <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
          <Stack direction="row" alignItems="flex-start" spacing={0.5}>
            <Typography variant="body2" sx={{ flex: 1, fontWeight: 500, wordBreak: 'break-word' }}>{cardTitle(r, entity)}</Typography>
            {canEdit && (
              <Tooltip title="Move to…">
                <IconButton aria-label="Move to…"
                  size="small"
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); setMoveFrom({ record: r, anchor: e.currentTarget }); }}
                >
                  <DriveFileMoveOutlinedIcon fontSize="inherit" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 0.5 }}>
            {cardMeta(r, entity, groupKey).map((m) => (
              <Chip key={m.field.key} size="small" variant="outlined" label={`${m.field.label || m.field.key}: ${String(m.value)}`} />
            ))}
          </Stack>
        </CardContent>
      </CardActionArea>
    </Card>
  );

  return (
    <Stack spacing={1}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}
      {(recordsQ.data?.total ?? 0) > 500 && <Alert severity="info">Showing the first 500 records on the board.</Alert>}
      <Box sx={{ display: 'flex', gap: 1.5, overflowX: 'auto', pb: 1, alignItems: 'flex-start' }}>
        {columns.map((col) => (
          <Paper key={col} variant="outlined" sx={{ p: 1, minWidth: 240, maxWidth: 280, flexShrink: 0, bgcolor: 'background.default' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, px: 0.5 }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>{col}</Typography>
              <Chip size="small" label={grouped.map.get(col)?.length ?? 0} />
            </Stack>
            {(grouped.map.get(col) ?? []).map(renderCard)}
          </Paper>
        ))}
        {grouped.other.length > 0 && (
          <Paper variant="outlined" sx={{ p: 1, minWidth: 240, maxWidth: 280, flexShrink: 0, bgcolor: 'background.default' }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1, px: 0.5 }}>
              <Typography variant="subtitle2" sx={{ flex: 1 }}>(no value)</Typography>
              <Chip size="small" label={grouped.other.length} />
            </Stack>
            {grouped.other.map(renderCard)}
          </Paper>
        )}
      </Box>

      <Menu open={!!moveFrom} anchorEl={moveFrom?.anchor} onClose={() => setMoveFrom(null)}>
        {columns.map((col) => (
          <MenuItem
            key={col}
            disabled={move.isPending}
            onClick={() => { if (moveFrom) move.mutate({ record: moveFrom.record, to: col }); setMoveFrom(null); }}
          >
            {col}
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  );
}
