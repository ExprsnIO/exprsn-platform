import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MyLocationIcon from '@mui/icons-material/MyLocation';
import {
  nexusApi,
  type CreateGroupInput,
  type GovernanceModel,
  type GroupVisibility,
  type JoinMode,
} from '@/api/nexus';
import { toMessage } from '@/lib/errors';

/**
 * Group templates — presets for visibility/join/governance/category. Picking
 * one prefills the form; every field stays editable.
 */
const GROUP_TEMPLATES: Array<{
  key: string;
  label: string;
  hint: string;
  preset: Partial<CreateGroupInput>;
}> = [
  { key: 'custom', label: 'Custom (no template)', hint: 'Start from a blank slate.', preset: {} },
  {
    key: 'community',
    label: 'Open community',
    hint: 'Public and open — anyone can find and join instantly.',
    preset: { visibility: 'public', joinMode: 'open', governanceModel: 'centralized', category: 'community' },
  },
  {
    key: 'club',
    label: 'Club / Interest group',
    hint: 'Public but joining requires approval.',
    preset: { visibility: 'public', joinMode: 'request', governanceModel: 'centralized', category: 'club' },
  },
  {
    key: 'team',
    label: 'Private team',
    hint: 'Private and invite-only — for a working team.',
    preset: { visibility: 'private', joinMode: 'invite', governanceModel: 'centralized', category: 'team' },
  },
  {
    key: 'moderated',
    label: 'Moderated forum',
    hint: 'Unlisted with approval-based joining and consensus governance.',
    preset: { visibility: 'unlisted', joinMode: 'request', governanceModel: 'consensus', category: 'forum' },
  },
  {
    key: 'dao',
    label: 'DAO / Collective',
    hint: 'Public, request to join, decisions made by member voting.',
    preset: { visibility: 'public', joinMode: 'request', governanceModel: 'dao', category: 'collective' },
  },
];

/** Parse a lat/lng pair of strings. Returns coords, an `invalid` flag, or empty. */
function parseCoords(latStr: string, lngStr: string) {
  const latFilled = latStr.trim() !== '';
  const lngFilled = lngStr.trim() !== '';
  if (!latFilled && !lngFilled) return { coords: null, invalid: false };
  const lat = Number(latStr);
  const lng = Number(lngStr);
  const valid =
    latFilled &&
    lngFilled &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;
  return { coords: valid ? { lat, lng } : null, invalid: !valid };
}

const VISIBILITIES: GroupVisibility[] = ['public', 'private', 'unlisted'];
const JOIN_MODES: JoinMode[] = ['open', 'request', 'invite'];

/** Create-group modal. Invalidates groups + memberships on success. */
export function CreateGroupDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (msg: string) => void;
}) {
  const qc = useQueryClient();
  const [template, setTemplate] = useState('custom');
  const [advanced, setAdvanced] = useState(false);
  const [form, setForm] = useState<CreateGroupInput>({
    name: '',
    description: '',
    visibility: 'public',
    joinMode: 'open',
    governanceModel: 'centralized',
    tags: [],
  });
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [geoError, setGeoError] = useState<string | null>(null);

  const { coords, invalid: coordsInvalid } = parseCoords(lat, lng);

  const set = <K extends keyof CreateGroupInput>(k: K, v: CreateGroupInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const applyTemplate = (key: string) => {
    setTemplate(key);
    const t = GROUP_TEMPLATES.find((x) => x.key === key);
    if (t && t.key !== 'custom') {
      setForm((f) => ({ ...f, ...t.preset }));
    }
  };

  const resetForm = () => {
    setTemplate('custom');
    setAdvanced(false);
    setForm({ name: '', description: '', visibility: 'public', joinMode: 'open', governanceModel: 'centralized', tags: [] });
    setLat('');
    setLng('');
    setGeoError(null);
  };

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setGeoError('Geolocation is not available in this browser.');
      return;
    }
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
      },
      (err) => setGeoError(err.message || 'Could not get your location.'),
    );
  };

  const mutation = useMutation({
    mutationFn: () =>
      nexusApi.createGroup({
        name: form.name.trim(),
        description: form.description?.trim() || undefined,
        visibility: form.visibility,
        joinMode: form.joinMode,
        governanceModel: form.governanceModel,
        category: form.category?.trim() || undefined,
        tags: form.tags?.length ? form.tags : undefined,
        maxMembers: form.maxMembers || undefined,
        website: form.website?.trim() || undefined,
        location: form.location?.trim() || undefined,
        ...(coords ? { latitude: coords.lat, longitude: coords.lng } : {}),
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['nexus'] });
      onCreated(`Created “${res.group?.name ?? form.name}”`);
      resetForm();
      onClose();
    },
  });

  const canSubmit = form.name.trim().length >= 2 && !coordsInvalid && !mutation.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New group</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mutation.isError && <Alert severity="error">{toMessage(mutation.error)}</Alert>}
          <TextField
            select
            label="Template"
            fullWidth
            value={template}
            onChange={(e) => applyTemplate(e.target.value)}
            helperText={GROUP_TEMPLATES.find((t) => t.key === template)?.hint}
          >
            {GROUP_TEMPLATES.map((t) => (
              <MenuItem key={t.key} value={t.key}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Name"
            required
            fullWidth
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            helperText="At least 2 characters"
          />
          <TextField
            label="Description"
            fullWidth
            multiline
            minRows={2}
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
          />
          <Stack direction="row" spacing={2}>
            <TextField
              select
              label="Visibility"
              fullWidth
              value={form.visibility}
              onChange={(e) => set('visibility', e.target.value as GroupVisibility)}
            >
              {VISIBILITIES.map((v) => (
                <MenuItem key={v} value={v}>
                  {v}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label="Join mode"
              fullWidth
              value={form.joinMode}
              onChange={(e) => set('joinMode', e.target.value as JoinMode)}
              helperText={
                form.joinMode === 'open'
                  ? 'Anyone can join instantly'
                  : form.joinMode === 'request'
                    ? 'Requires approval'
                    : 'Invite only'
              }
            >
              {JOIN_MODES.map((m) => (
                <MenuItem key={m} value={m}>
                  {m}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <TextField
            label="Location"
            fullWidth
            value={form.location ?? ''}
            onChange={(e) => set('location', e.target.value)}
            helperText="Optional — a place name shown on the group"
          />

          <Button
            size="small"
            color="inherit"
            onClick={() => setAdvanced((a) => !a)}
            startIcon={advanced ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            sx={{ alignSelf: 'flex-start' }}
          >
            Advanced options
          </Button>
          <Collapse in={advanced}>
            <Stack spacing={2}>
              <TextField
                select
                label="Governance model"
                fullWidth
                value={form.governanceModel ?? 'centralized'}
                onChange={(e) => set('governanceModel', e.target.value as GovernanceModel)}
                helperText={
                  form.governanceModel === 'dao'
                    ? 'Decisions via member proposals and votes'
                    : form.governanceModel === 'consensus'
                      ? 'Decisions require broad member agreement'
                      : form.governanceModel === 'decentralized'
                        ? 'Moderation shared across trusted members'
                        : 'Owner and admins decide'
                }
              >
                {(['centralized', 'decentralized', 'dao', 'consensus'] as GovernanceModel[]).map((g) => (
                  <MenuItem key={g} value={g}>
                    {g}
                  </MenuItem>
                ))}
              </TextField>
              <Stack direction="row" spacing={2}>
                <TextField
                  label="Category"
                  fullWidth
                  value={form.category ?? ''}
                  onChange={(e) => set('category', e.target.value)}
                  helperText="Used for discovery"
                />
                <TextField
                  label="Member limit"
                  type="number"
                  fullWidth
                  value={form.maxMembers ?? ''}
                  onChange={(e) => set('maxMembers', e.target.value === '' ? null : Math.max(1, Number(e.target.value) || 1))}
                  helperText="Empty = unlimited"
                />
              </Stack>
              <Autocomplete
                multiple
                freeSolo
                options={[]}
                value={form.tags ?? []}
                onChange={(_e, v) => set('tags', v as string[])}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip size="small" label={option} {...getTagProps({ index })} key={option} />
                  ))
                }
                renderInput={(params) => (
                  <TextField {...params} label="Tags" placeholder="Type and press Enter…" helperText="Free-form tags for search and discovery" />
                )}
              />
              <TextField
                label="Website"
                fullWidth
                value={form.website ?? ''}
                onChange={(e) => set('website', e.target.value)}
                helperText="Optional — must be a full URL (https://…)"
              />
            </Stack>
          </Collapse>

          <Stack spacing={1}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                Coordinates (optional) — enables “Near me” discovery
              </Typography>
              <Button size="small" startIcon={<MyLocationIcon />} onClick={useMyLocation}>
                Use my location
              </Button>
            </Stack>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Latitude"
                fullWidth
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                error={coordsInvalid}
                InputProps={{ endAdornment: <InputAdornment position="end">°</InputAdornment> }}
              />
              <TextField
                label="Longitude"
                fullWidth
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                error={coordsInvalid}
                InputProps={{ endAdornment: <InputAdornment position="end">°</InputAdornment> }}
              />
            </Stack>
            {coordsInvalid && (
              <Typography variant="caption" color="error">
                Set both latitude (−90..90) and longitude (−180..180), or leave both blank.
              </Typography>
            )}
            {geoError && (
              <Typography variant="caption" color="error">
                {geoError}
              </Typography>
            )}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button variant="contained" disabled={!canSubmit} onClick={() => mutation.mutate()}>
          {mutation.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
