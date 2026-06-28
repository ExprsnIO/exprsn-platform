import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import {
  nexusApi,
  type CreateEventInput,
  type EventType,
  type GroupEvent,
  type RsvpStatus,
} from '@/api/nexus';
import { isHttpError, toMessage } from '@/lib/errors';
import type { GroupTabProps } from './types';

const EVENT_TYPES: EventType[] = ['in-person', 'virtual', 'hybrid'];
const RSVP_OPTIONS: { value: RsvpStatus; label: string }[] = [
  { value: 'going', label: 'Going' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'not-going', label: "Can't go" },
];

function formatWhen(value?: string | number): string {
  if (value == null) return '';
  const d = new Date(typeof value === 'number' ? value : Date.parse(value));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function CreateEventDialog({
  groupId,
  open,
  onClose,
  onToast,
}: {
  groupId: string;
  open: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [eventType, setEventType] = useState<EventType>('in-person');
  const [location, setLocation] = useState('');
  const [virtualUrl, setVirtualUrl] = useState('');
  const [startLocal, setStartLocal] = useState('');

  const reset = () => {
    setTitle('');
    setDescription('');
    setEventType('in-person');
    setLocation('');
    setVirtualUrl('');
    setStartLocal('');
  };

  const mutation = useMutation({
    mutationFn: () => {
      const startMs = startLocal ? new Date(startLocal).getTime() : NaN;
      const payload: CreateEventInput = {
        groupId,
        title: title.trim(),
        description: description.trim() || undefined,
        eventType,
        startTime: startMs,
        location: eventType !== 'virtual' ? location.trim() || undefined : undefined,
        virtualUrl: eventType !== 'in-person' ? virtualUrl.trim() || undefined : undefined,
      };
      return nexusApi.createEvent(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nexus', 'events', groupId] });
      onToast('Event created');
      reset();
      onClose();
    },
  });

  const startMs = startLocal ? new Date(startLocal).getTime() : NaN;
  const canSubmit =
    title.trim().length >= 2 && Number.isFinite(startMs) && startMs > Date.now() && !mutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New event</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}
          <TextField
            label="Title"
            required
            fullWidth
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            helperText="At least 2 characters"
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Type"
              fullWidth
              value={eventType}
              onChange={(e) => setEventType(e.target.value as EventType)}
            >
              {EVENT_TYPES.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Starts"
              type="datetime-local"
              fullWidth
              required
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Stack>
          {eventType !== 'virtual' && (
            <TextField
              label="Location"
              fullWidth
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          )}
          {eventType !== 'in-person' && (
            <TextField
              label="Virtual URL"
              fullWidth
              value={virtualUrl}
              onChange={(e) => setVirtualUrl(e.target.value)}
              helperText="Full URL (https://…)"
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function AttendeeList({ eventId }: { eventId: string }) {
  const q = useQuery({
    queryKey: ['nexus', 'attendees', eventId],
    queryFn: () => nexusApi.listAttendees(eventId, { limit: 100 }),
  });
  if (q.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 1 }}>
        <CircularProgress size={18} />
      </Box>
    );
  }
  if (q.isError) return <Typography variant="caption" color="error">{toMessage(q.error)}</Typography>;
  const attendees = q.data?.attendees ?? [];
  if (attendees.length === 0) {
    return <Typography variant="caption" color="text.secondary">No attendees yet.</Typography>;
  }
  return (
    <Stack spacing={0.5}>
      {attendees.map((a) => (
        <Stack key={a.id} direction="row" spacing={1} alignItems="center">
          <Typography variant="caption" sx={{ flex: 1, minWidth: 0 }} noWrap>
            {a.userId}
          </Typography>
          <Chip size="small" variant="outlined" label={a.rsvpStatus} />
        </Stack>
      ))}
    </Stack>
  );
}

function EventRow({
  event,
  canManage,
  onToast,
}: {
  event: GroupEvent;
  canManage: boolean;
  onToast: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);
  const [showAttendees, setShowAttendees] = useState(false);
  const [rsvp, setRsvp] = useState<RsvpStatus | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['nexus', 'events', event.groupId] });

  const rsvpMut = useMutation({
    mutationFn: (status: RsvpStatus) => nexusApi.rsvpEvent(event.id, { rsvpStatus: status }),
    onSuccess: (_d, status) => {
      setRsvp(status);
      onToast('RSVP saved');
      qc.invalidateQueries({ queryKey: ['nexus', 'attendees', event.id] });
    },
    onError: (err) => onToast(toMessage(err)),
  });
  const cancelMut = useMutation({
    mutationFn: () => nexusApi.cancelEvent(event.id),
    onSuccess: () => {
      onToast('Event cancelled');
      invalidate();
    },
    onError: (err) => onToast(toMessage(err)),
  });
  const deleteMut = useMutation({
    mutationFn: () => nexusApi.deleteEvent(event.id),
    onSuccess: () => {
      onToast('Event deleted');
      invalidate();
    },
    onError: (err) => onToast(toMessage(err)),
  });
  const remindMut = useMutation({
    mutationFn: async () => {
      const presets = await nexusApi.reminderPresets();
      return nexusApi.createReminder(event.id, presets.default);
    },
    onSuccess: (res) => onToast(`Scheduled ${res.scheduled} reminder(s)`),
    onError: (err) => onToast(toMessage(err)),
  });

  const cancelled = event.status === 'cancelled';

  return (
    <Paper variant="outlined" sx={{ p: 2, opacity: cancelled ? 0.6 : 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, flex: 1, minWidth: 0 }}>
          {event.title}
        </Typography>
        {event.eventType && <Chip size="small" variant="outlined" label={event.eventType} />}
        {cancelled && <Chip size="small" color="error" label="cancelled" />}
        {canManage && (
          <>
            <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)}>
              <MenuItem
                onClick={() => {
                  setAnchor(null);
                  remindMut.mutate();
                }}
              >
                Schedule default reminders
              </MenuItem>
              {!cancelled && (
                <MenuItem
                  onClick={() => {
                    setAnchor(null);
                    cancelMut.mutate();
                  }}
                >
                  Cancel event
                </MenuItem>
              )}
              <MenuItem
                onClick={() => {
                  setAnchor(null);
                  deleteMut.mutate();
                }}
                sx={{ color: 'error.main' }}
              >
                Delete event
              </MenuItem>
            </Menu>
          </>
        )}
      </Stack>

      {formatWhen(event.startTime) && (
        <Typography variant="caption" color="text.secondary">
          {formatWhen(event.startTime)}
          {event.location ? ` · ${event.location}` : ''}
        </Typography>
      )}
      {event.description && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {event.description}
        </Typography>
      )}

      {!cancelled && (
        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={rsvp}
            onChange={(_e, v: RsvpStatus | null) => v && rsvpMut.mutate(v)}
          >
            {RSVP_OPTIONS.map((o) => (
              <ToggleButton key={o.value} value={o.value} disabled={rsvpMut.isPending}>
                {o.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <Box>
            <Button size="small" color="inherit" onClick={() => setShowAttendees((s) => !s)}>
              {showAttendees ? 'Hide attendees' : `Attendees (${event.attendeeCount ?? 0})`}
            </Button>
          </Box>
          <Collapse in={showAttendees} unmountOnExit>
            <Divider sx={{ mb: 1 }} />
            <AttendeeList eventId={event.id} />
          </Collapse>
        </Stack>
      )}
    </Paper>
  );
}

/** Events list with create + RSVP + (admin) lifecycle controls. */
export default function EventsTab({ groupId, ctx }: GroupTabProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const canCreate = ctx.can('post');
  const canManage = ctx.can('deleteOthersContent');

  const events = useQuery({
    queryKey: ['nexus', 'events', groupId],
    queryFn: () => nexusApi.listGroupEvents(groupId, { upcoming: true, limit: 50 }),
  });

  let body: ReactNode;
  if (events.isLoading) {
    body = (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress size={26} />
      </Box>
    );
  } else if (events.isError) {
    body = isHttpError(events.error, 403) ? (
      <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
        Events are visible to group members only.
      </Typography>
    ) : (
      <Alert severity="error">{toMessage(events.error)}</Alert>
    );
  } else {
    const list = events.data?.events ?? [];
    body =
      list.length === 0 ? (
        <Typography color="text.secondary" sx={{ textAlign: 'center', p: 4 }}>
          No upcoming events.
        </Typography>
      ) : (
        <Stack spacing={1.5}>
          {list.map((e) => (
            <EventRow key={e.id} event={e} canManage={canManage} onToast={setToast} />
          ))}
        </Stack>
      );
  }

  return (
    <Stack spacing={1.5}>
      {canCreate && (
        <Box>
          <Button variant="outlined" size="small" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
            New event
          </Button>
        </Box>
      )}
      {body}

      <CreateEventDialog
        groupId={groupId}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onToast={setToast}
      />
      <Snackbar
        open={!!toast}
        autoHideDuration={4000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Stack>
  );
}
