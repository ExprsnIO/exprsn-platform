import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Chip, Stack } from '@mui/material';
import { getHealth } from '@/api/platform';
import { caAdminApi } from '@/api/admin/ca';
import { vaultAdminApi } from '@/api/admin/vault';
import { liveAdminApi } from '@/api/admin/live';
import { moderatorAdminApi } from '@/api/admin/moderator';
import { Card, QueryState, SectionHeader, StatCard } from './ui';

function num(o: Record<string, unknown> | undefined, ...keys: string[]): number | string | undefined {
  if (!o) return undefined;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v) return v;
  }
  return undefined;
}

/** Read `obj.group.key` (the nested stat shape several modules return). */
function nested(o: Record<string, unknown> | undefined, group: string, key = 'total'): number | string | undefined {
  const g = o?.[group] as Record<string, unknown> | undefined;
  return num(g, key);
}

/** Small stat group that quietly renders nothing useful if its source errors. */
function QuickStats({ to, label, query, cards }: {
  to: string;
  label: string;
  query: UseQueryResult<Record<string, unknown>>;
  cards: (d: Record<string, unknown>) => Array<{ label: string; value: number | string | undefined }>;
}) {
  return (
    <Card
      title={label}
      actions={<Button size="small" component={RouterLink} to={to}>Open</Button>}
    >
      {query.isError ? (
        <Chip size="small" color="default" variant="outlined" label="unavailable (insufficient permission or module down)" />
      ) : query.isLoading ? (
        <Chip size="small" label="loading…" />
      ) : (
        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          {cards(query.data ?? {}).map((c) => (
            <StatCard key={c.label} label={c.label} value={c.value} />
          ))}
        </Stack>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth });
  const ca = useQuery({ queryKey: ['ca', 'admin', 'stats'], queryFn: caAdminApi.stats, retry: false });
  const vault = useQuery({ queryKey: ['vault', 'dash'], queryFn: vaultAdminApi.dashboardStats, retry: false });
  const live = useQuery({ queryKey: ['live', 'stats'], queryFn: liveAdminApi.stats, retry: false });
  const mod = useQuery({ queryKey: ['mod', 'metrics', 'today'], queryFn: () => moderatorAdminApi.metrics('today'), retry: false });

  return (
    <Stack spacing={2} sx={{ pb: 6 }}>
      <SectionHeader title="Platform Overview" subtitle="Gateway health and per-module status across the consolidated services." />

      <Card title="Gateway modules">
        <QueryState query={health}>
          {(h) => (
            <Stack spacing={1.5}>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <StatCard label="Status" value={h.status} />
                <StatCard label="Environment" value={h.env} />
                <StatCard label="Modules" value={h.modules?.length ?? 0} />
              </Stack>
              <Box>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {(h.modules ?? []).map((m) => (
                    <Chip
                      key={m.name}
                      size="small"
                      color={m.mounted ? 'success' : 'default'}
                      variant={m.mounted ? 'filled' : 'outlined'}
                      label={`${m.name} ${m.prefix}`}
                    />
                  ))}
                </Stack>
              </Box>
            </Stack>
          )}
        </QueryState>
      </Card>

      <QuickStats
        to="/admin/ca"
        label="Certificate Authority"
        query={ca}
        cards={(d) => [
          { label: 'Certificates', value: nested(d, 'certificates') },
          { label: 'Active', value: nested(d, 'certificates', 'active') },
          { label: 'Tokens', value: nested(d, 'tokens') },
        ]}
      />
      <QuickStats
        to="/admin/vault"
        label="Vault"
        query={vault}
        cards={(d) => {
          const data = (d.data as Record<string, unknown>) ?? d;
          return [
            { label: 'Tokens', value: nested(data, 'tokens') },
            { label: 'Secrets', value: nested(data, 'secrets') },
            { label: 'Keys', value: nested(data, 'keys') },
          ];
        }}
      />
      <QuickStats
        to="/admin/live"
        label="Live Streaming"
        query={live}
        cards={(d) => {
          const s = (d.stats as Record<string, unknown>) ?? d;
          return [
            { label: 'Streams', value: num(s, 'streams', 'totalStreams') },
            { label: 'Rooms', value: num(s, 'rooms', 'activeRooms') },
            { label: 'Viewers', value: num(s, 'totalViewers') },
          ];
        }}
      />
      <QuickStats
        to="/admin/moderator"
        label="Moderation (today)"
        query={mod}
        cards={(d) => [
          { label: 'Reviewed', value: num(d, 'reviewed', 'total') },
          { label: 'Pending', value: num(d, 'pending') },
          { label: 'Actions', value: num(d, 'actions', 'actionsTaken') },
        ]}
      />
    </Stack>
  );
}
