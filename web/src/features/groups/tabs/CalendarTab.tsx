/**
 * Group Calendar tab — a month view of the group's events, the group's
 * contact list (members as address-book entries), and calendar/contact
 * sync via iCal, CalDAV and CardDAV (served by nexus /api/calendar).
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import DownloadIcon from '@mui/icons-material/Download';
import TodayIcon from '@mui/icons-material/Today';
import { nexusApi, type GroupEvent } from '@/api/nexus';
import { usersApi } from '@/api/users';
import { toMessage } from '@/lib/errors';
import { avatarColor, personInitials } from '@/features/people/util';
import type { GroupTabProps } from './types';

/* ------------------------------------------------------------- utilities */

function eventStartMs(e: GroupEvent): number | null {
  const v = e.startTime;
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Date.parse(v) || Number(v);
  return Number.isFinite(n) ? n : null;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** All cells for a month grid (leading/trailing days included), Sunday-first. */
function monthCells(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    cells.push(d);
  }
  return cells;
}

function download(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ---------------------------------------------------------- month grid -- */

function MonthCalendar({ events }: { events: GroupEvent[] }) {
  const [anchor, setAnchor] = useState(() => new Date());
  const cells = useMemo(() => monthCells(anchor), [anchor]);

  const byDay = useMemo(() => {
    const map = new Map<string, GroupEvent[]>();
    for (const e of events) {
      const ms = eventStartMs(e);
      if (ms == null) continue;
      const key = dayKey(new Date(ms));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [events]);

  const todayKey = dayKey(new Date());
  const monthLabel = anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={600}>{monthLabel}</Typography>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title="Previous month">
            <IconButton aria-label="Previous month" size="small" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1))}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Today">
            <IconButton aria-label="Today" size="small" onClick={() => setAnchor(new Date())}>
              <TodayIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Next month">
            <IconButton aria-label="Next month" size="small" onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1))}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.5 }}>
        {WEEKDAYS.map((w) => (
          <Typography key={w} variant="caption" color="text.secondary" sx={{ textAlign: 'center', pb: 0.5 }}>
            {w}
          </Typography>
        ))}
        {cells.map((d) => {
          const inMonth = d.getMonth() === anchor.getMonth();
          const key = dayKey(d);
          const dayEvents = byDay.get(key) ?? [];
          return (
            <Box
              key={key}
              sx={{
                minHeight: 76,
                p: 0.5,
                borderRadius: 1,
                border: '1px solid',
                borderColor: key === todayKey ? 'primary.main' : 'divider',
                bgcolor: inMonth ? 'background.paper' : 'action.hover',
                opacity: inMonth ? 1 : 0.6,
                overflow: 'hidden',
              }}
            >
              <Typography variant="caption" fontWeight={key === todayKey ? 700 : 400}>
                {d.getDate()}
              </Typography>
              <Stack spacing={0.25} sx={{ mt: 0.25 }}>
                {dayEvents.slice(0, 3).map((e) => {
                  const ms = eventStartMs(e);
                  const time = ms ? new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
                  return (
                    <Tooltip key={e.id} title={`${e.title}${time ? ` — ${time}` : ''}${e.location ? ` @ ${e.location}` : ''}`}>
                      <Chip
                        size="small"
                        label={e.title}
                        color={e.status === 'cancelled' ? 'default' : 'primary'}
                        variant="outlined"
                        sx={{ maxWidth: '100%', height: 18, '& .MuiChip-label': { px: 0.5, fontSize: 10 } }}
                      />
                    </Tooltip>
                  );
                })}
                {dayEvents.length > 3 && (
                  <Typography variant="caption" color="text.secondary">+{dayEvents.length - 3} more</Typography>
                )}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

/* ------------------------------------------------------------- contacts -- */

function ContactsCard({ groupId, onToast }: { groupId: string; onToast: (m: string) => void }) {
  const members = useQuery({
    queryKey: ['nexus', 'group', groupId, 'members', 'contacts'],
    queryFn: () => nexusApi.listMembers(groupId, { limit: 100 }),
  });
  const memberIds = (members.data?.members ?? []).map((m) => m.userId);
  const profilesQ = useQuery({
    queryKey: ['people', 'profiles', memberIds],
    queryFn: () => usersApi.profilesByIds(memberIds),
    enabled: memberIds.length > 0,
  });
  const profileMap = new Map((profilesQ.data?.users ?? []).map((u) => [u.id, u]));

  const exportVcf = async () => {
    try {
      const vcf = await nexusApi.groupContactsVcf(groupId);
      download(`group-${groupId}-contacts.vcf`, vcf, 'text/vcard');
      onToast('Contact list downloaded (.vcf)');
    } catch (e) {
      onToast(toMessage(e));
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={600}>Contact list</Typography>
        <Button size="small" startIcon={<DownloadIcon />} onClick={exportVcf}>Export vCards (.vcf)</Button>
      </Stack>
      {members.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress size={24} /></Box>
      ) : members.isError ? (
        <Alert severity="error">{toMessage(members.error)}</Alert>
      ) : (members.data?.members ?? []).length === 0 ? (
        <Alert severity="info">No members yet.</Alert>
      ) : (
        <Stack spacing={1}>
          {(members.data?.members ?? []).map((m) => {
            const profile = profileMap.get(m.userId);
            const name = profile?.displayName || 'Unnamed user';
            return (
              <Stack key={m.userId} direction="row" spacing={1.5} alignItems="center">
                <Avatar
                  src={profile?.avatarUrl ?? undefined}
                  sx={{ width: 32, height: 32, bgcolor: avatarColor(m.userId), fontSize: 13 }}
                >
                  {personInitials(profile?.displayName, m.userId)}
                </Avatar>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Typography variant="body2" noWrap>{name}</Typography>
                  {profile?.bio && (
                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                      {profile.bio}
                    </Typography>
                  )}
                </Box>
                <Chip size="small" variant="outlined" label={m.role} />
              </Stack>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}

/* ------------------------------------------------------------- sync card -- */

function SyncCard({ groupId, onToast }: { groupId: string; onToast: (m: string) => void }) {
  const paths = nexusApi.calendarSyncPaths(groupId);
  const rows: Array<{ label: string; hint: string; url: string }> = [
    { label: 'iCal feed', hint: 'Subscribe from any calendar app (read-only .ics feed).', url: `${window.location.origin}${paths.ical}` },
    { label: 'CalDAV calendar', hint: 'CalDAV (RFC 4791) collection for this group.', url: `${window.location.origin}${paths.caldav}` },
    { label: 'CardDAV address book', hint: 'CardDAV (RFC 6352) address book of group members.', url: `${window.location.origin}${paths.carddav}` },
  ];

  const copy = (url: string) => {
    navigator.clipboard.writeText(url).then(
      () => onToast('URL copied'),
      () => onToast('Could not copy — select and copy manually'),
    );
  };

  const exportIcs = async () => {
    try {
      const ics = await nexusApi.groupICal(groupId);
      download(`group-${groupId}.ics`, ics, 'text/calendar');
      onToast('Calendar downloaded (.ics)');
    } catch (e) {
      onToast(toMessage(e));
    }
  };

  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={600}>Calendar & contact sync</Typography>
        <Button size="small" startIcon={<DownloadIcon />} onClick={exportIcs}>Download .ics</Button>
      </Stack>
      <Stack spacing={2}>
        {rows.map((r) => (
          <Box key={r.label}>
            <Typography variant="body2" fontWeight={600}>{r.label}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{r.hint}</Typography>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <TextField
                fullWidth
                size="small"
                value={r.url}
                InputProps={{ readOnly: true, sx: { fontFamily: 'monospace', fontSize: 12 } }}
              />
              <Tooltip title="Copy URL">
                <IconButton aria-label="Copy URL" size="small" onClick={() => copy(r.url)}><ContentCopyIcon fontSize="small" /></IconButton>
              </Tooltip>
            </Stack>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

/* ------------------------------------------------------------------ tab -- */

export default function CalendarTab({ groupId }: GroupTabProps) {
  const [toast, setToast] = useState<string | null>(null);
  const events = useQuery({
    queryKey: ['nexus', 'group', groupId, 'events', 'calendar'],
    queryFn: () => nexusApi.listGroupEvents(groupId, { limit: 100 }),
  });

  return (
    <Stack spacing={2}>
      {toast && <Alert severity="info" onClose={() => setToast(null)}>{toast}</Alert>}

      {events.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
      ) : events.isError ? (
        <Alert severity="error">{toMessage(events.error)}</Alert>
      ) : (
        <MonthCalendar events={events.data?.events ?? []} />
      )}

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <ContactsCard groupId={groupId} onToast={setToast} />
        <SyncCard groupId={groupId} onToast={setToast} />
      </Box>
    </Stack>
  );
}
