/**
 * Structured entity builder — a typed field editor, a record-lifecycle state
 * machine builder, and storage-mode selection, with a raw-JSON escape hatch for
 * power users. Used both in the "new entity" dialog and the entity detail page,
 * in the admin console and the /apps studio. Save is delegated via `onSave` so
 * the surface owns the mutation (scoped vs admin client, toasts, navigation).
 */
import { useEffect, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Checkbox, Chip, Divider,
  FormControlLabel, IconButton, MenuItem, Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { Entity, Field, FieldType, FieldRole, StateMachine, EntityStorage, Lookup } from '@/api/admin/lowcode';
import { useCatalog } from './catalog';

const KEY_RE = /^[a-z][a-z0-9_]*$/;

type EField = Field & { _id: string };
let _fid = 0;
const withIds = (fields: Field[] = []): EField[] => fields.map((f) => ({ ...f, _id: `f${++_fid}` }));
const stripIds = (fields: EField[]): Field[] => fields.map(({ _id, ...f }) => f);

const NUMERIC: FieldType[] = ['number', 'integer'];

export interface EntityEditorProps {
  /** Existing entity (edit) or null (create). */
  entity: Entity | null;
  /** appId the entity belongs to (required on create). */
  appId: string;
  /** Sibling entities of the app (for reference-field targets). */
  entities?: Entity[];
  /** App lookups (for enum-from-lookup fields). */
  lookups?: Lookup[];
  busy?: boolean;
  onCancel?: () => void;
  onSave: (payload: Partial<Entity>) => void;
}

export function EntityEditor({ entity, appId, entities = [], lookups = [], busy, onCancel, onSave }: EntityEditorProps) {
  const { catalog } = useCatalog();
  const [name, setName] = useState(entity?.name ?? '');
  const [key, setKey] = useState(entity?.key ?? '');
  const [description, setDescription] = useState(entity?.description ?? '');
  const [fields, setFields] = useState<EField[]>(() => withIds(entity?.fields));
  const [sm, setSm] = useState<StateMachine | null>(entity?.stateMachine ?? null);
  const [storageMode, setStorageMode] = useState<EntityStorage['mode']>(entity?.storage?.mode ?? 'db');
  const [storageDir, setStorageDir] = useState(entity?.storage?.directory ?? '');
  const [raw, setRaw] = useState(false);
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Refresh when switching between different entities on the detail page.
    setName(entity?.name ?? ''); setKey(entity?.key ?? ''); setDescription(entity?.description ?? '');
    setFields(withIds(entity?.fields)); setSm(entity?.stateMachine ?? null);
    setStorageMode(entity?.storage?.mode ?? 'db'); setStorageDir(entity?.storage?.directory ?? '');
  }, [entity]);

  const patchField = (id: string, patch: Partial<Field>) =>
    setFields((fs) => fs.map((f) => (f._id === id ? { ...f, ...patch } : f)));
  const addField = () =>
    setFields((fs) => [...fs, { _id: `f${++_fid}`, key: '', label: '', type: 'string', role: 'attribute' }]);
  const removeField = (id: string) => setFields((fs) => fs.filter((f) => f._id !== id));

  function build(): Partial<Entity> | null {
    if (raw) {
      try {
        const parsed = JSON.parse(rawText);
        return { appId, ...parsed };
      } catch { setError('Definition is not valid JSON.'); return null; }
    }
    if (!name.trim()) { setError('Name is required.'); return null; }
    if (!entity && !KEY_RE.test(key)) { setError('Key must be lower_snake_case starting with a letter.'); return null; }
    for (const f of fields) {
      if (!KEY_RE.test(f.key)) { setError(`Field key "${f.key || '(empty)'}" must be lower_snake_case.`); return null; }
    }
    const storage: EntityStorage = { mode: storageMode };
    if (storageDir.trim()) storage.directory = storageDir.trim();
    const payload: Partial<Entity> = {
      name: name.trim(), description: description.trim() || undefined,
      fields: stripIds(fields), stateMachine: sm, storage,
    };
    if (!entity) { payload.appId = appId; payload.key = key; }
    return payload;
  }

  const submit = () => {
    setError(null);
    const payload = build();
    if (payload) onSave(payload);
  };

  const openRaw = () => {
    setRawText(JSON.stringify({
      key, name, description,
      fields: stripIds(fields), stateMachine: sm, storage: { mode: storageMode, ...(storageDir ? { directory: storageDir } : {}) },
    }, null, 2));
    setRaw(true);
  };

  return (
    <Stack spacing={2}>
      {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

      {raw ? (
        <TextField
          label="Entity definition (JSON)" multiline minRows={16} value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          inputProps={{ style: { fontFamily: 'monospace', fontSize: 12 } }}
        />
      ) : (
        <>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Name" fullWidth value={name} onChange={(e) => setName(e.target.value)} required />
            <TextField
              label="Key" fullWidth value={key} onChange={(e) => setKey(e.target.value)}
              disabled={!!entity} helperText={entity ? 'Key is immutable' : 'lower_snake_case'}
            />
          </Stack>
          <TextField label="Description" fullWidth value={description} onChange={(e) => setDescription(e.target.value)} />

          {/* ── Fields ─────────────────────────────────────────────── */}
          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">Fields ({fields.length})</Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={addField}>Add field</Button>
            </Stack>
            <Stack spacing={1.5}>
              {fields.length === 0 && <Alert severity="info">No fields yet — add at least one.</Alert>}
              {fields.map((f) => (
                <Box key={f._id} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
                    <TextField label="key" size="small" value={f.key} onChange={(e) => patchField(f._id, { key: e.target.value })} sx={{ width: 150 }} />
                    <TextField label="label" size="small" value={f.label} onChange={(e) => patchField(f._id, { label: e.target.value })} sx={{ width: 160 }} />
                    <TextField select label="type" size="small" value={f.type} onChange={(e) => patchField(f._id, { type: e.target.value as FieldType })} sx={{ width: 130 }}>
                      {catalog.fieldTypes.map((t) => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                    </TextField>
                    <TextField select label="role" size="small" value={f.role ?? 'attribute'} onChange={(e) => patchField(f._id, { role: e.target.value as FieldRole })} sx={{ width: 130 }}>
                      {catalog.fieldRoles.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                    </TextField>
                    <FormControlLabel control={<Checkbox size="small" checked={!!f.required} onChange={(e) => patchField(f._id, { required: e.target.checked })} />} label="required" />
                    <FormControlLabel control={<Checkbox size="small" checked={!!f.unique} onChange={(e) => patchField(f._id, { unique: e.target.checked })} />} label="unique" />
                    <Tooltip title="Remove field"><IconButton size="small" color="error" onClick={() => removeField(f._id)} sx={{ ml: 'auto' }}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                  </Stack>
                  {/* type-specific options */}
                  {(f.type === 'enum') && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                      <TextField
                        label="enum values (comma-separated)" size="small" sx={{ minWidth: 260, flex: 1 }}
                        value={(f.enumValues ?? []).join(', ')}
                        onChange={(e) => patchField(f._id, { enumValues: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })}
                      />
                      <TextField select label="or from lookup" size="small" sx={{ width: 200 }} value={f.enumLookup ?? ''} onChange={(e) => patchField(f._id, { enumLookup: e.target.value || undefined })}>
                        <MenuItem value=""><em>none</em></MenuItem>
                        {lookups.map((l) => <MenuItem key={l.id} value={l.key}>{l.name} ({l.key})</MenuItem>)}
                      </TextField>
                    </Stack>
                  )}
                  {f.type === 'reference' && (
                    <TextField select label="references entity" size="small" sx={{ mt: 1, width: 260 }} value={f.refEntity ?? ''} onChange={(e) => patchField(f._id, { refEntity: e.target.value || undefined })}>
                      <MenuItem value=""><em>select entity…</em></MenuItem>
                      {entities.filter((en) => en.id !== entity?.id).map((en) => <MenuItem key={en.id} value={en.key}>{en.name} ({en.key})</MenuItem>)}
                    </TextField>
                  )}
                  {NUMERIC.includes(f.type) && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                      <TextField label="min" size="small" type="number" sx={{ width: 120 }} value={f.min ?? ''} onChange={(e) => patchField(f._id, { min: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      <TextField label="max" size="small" type="number" sx={{ width: 120 }} value={f.max ?? ''} onChange={(e) => patchField(f._id, { max: e.target.value === '' ? undefined : Number(e.target.value) })} />
                      {f.role === 'measure' && (
                        <TextField select label="aggregation" size="small" sx={{ width: 150 }} value={f.aggregation ?? ''} onChange={(e) => patchField(f._id, { aggregation: e.target.value || undefined })}>
                          <MenuItem value=""><em>none</em></MenuItem>
                          {catalog.aggregations.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                        </TextField>
                      )}
                    </Stack>
                  )}
                </Box>
              ))}
            </Stack>
          </Box>

          {/* ── State machine ──────────────────────────────────────── */}
          <StateMachineEditor value={sm} onChange={setSm} />

          {/* ── Storage ────────────────────────────────────────────── */}
          <Accordion variant="outlined" disableGutters>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography variant="subtitle2">Storage</Typography></AccordionSummary>
            <AccordionDetails>
              <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                <TextField select label="mode" size="small" sx={{ width: 200 }} value={storageMode} onChange={(e) => setStorageMode(e.target.value as EntityStorage['mode'])}>
                  {catalog.storageModes.map((m) => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                </TextField>
                {storageMode !== 'db' && (
                  <TextField label="FileVault directory (optional)" size="small" sx={{ minWidth: 260, flex: 1 }} value={storageDir} onChange={(e) => setStorageDir(e.target.value)} />
                )}
              </Stack>
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                db = Postgres only · mirror = DB + JSON file per record · filevault = FileVault authoritative · export = on-demand collection export.
              </Typography>
            </AccordionDetails>
          </Accordion>
        </>
      )}

      <Divider />
      <Stack direction="row" spacing={1}>
        <Button size="small" onClick={() => (raw ? setRaw(false) : openRaw())} sx={{ mr: 'auto' }}>
          {raw ? 'Form view' : 'Edit as JSON'}
        </Button>
        {onCancel && <Button onClick={onCancel} disabled={busy}>Cancel</Button>}
        <Button variant="contained" onClick={submit} disabled={busy}>{entity ? 'Save changes' : 'Create entity'}</Button>
      </Stack>
    </Stack>
  );
}

/** Editor for an entity's optional record-lifecycle state machine. */
function StateMachineEditor({ value, onChange }: { value: StateMachine | null; onChange: (v: StateMachine | null) => void }) {
  const enabled = !!value;
  const sm = value ?? { initial: '', states: [], transitions: [] };
  const [stateInput, setStateInput] = useState('');

  const set = (patch: Partial<StateMachine>) => onChange({ ...sm, ...patch });
  const addState = () => {
    const s = stateInput.trim();
    if (!s || sm.states.includes(s)) return;
    set({ states: [...sm.states, s], initial: sm.initial || s });
    setStateInput('');
  };

  return (
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
        <Typography variant="subtitle2">State machine {enabled ? `(${sm.states.length} states)` : '(off)'}</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={1.5}>
          <FormControlLabel
            control={<Checkbox checked={enabled} onChange={(e) => onChange(e.target.checked ? { initial: '', states: [], transitions: [] } : null)} />}
            label="Enable record lifecycle"
          />
          {enabled && (
            <>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                {sm.states.map((s) => (
                  <Chip
                    key={s} label={s} color={s === sm.initial ? 'primary' : 'default'}
                    onClick={() => set({ initial: s })}
                    onDelete={() => set({ states: sm.states.filter((x) => x !== s), transitions: sm.transitions.filter((t) => t.from !== s && t.to !== s) })}
                  />
                ))}
                <TextField
                  size="small" placeholder="add state" value={stateInput}
                  onChange={(e) => setStateInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addState(); } }}
                  sx={{ width: 140 }}
                />
              </Stack>
              <Typography variant="caption" color="text.secondary">Click a state to make it the initial state.</Typography>
              <Divider textAlign="left"><Typography variant="caption">Transitions</Typography></Divider>
              {sm.transitions.map((t, i) => (
                <Stack key={i} direction="row" spacing={1} alignItems="center">
                  <TextField select size="small" label="from" sx={{ width: 130 }} value={t.from} onChange={(e) => set({ transitions: sm.transitions.map((x, j) => j === i ? { ...x, from: e.target.value } : x) })}>
                    {sm.states.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </TextField>
                  <TextField size="small" label="on event" sx={{ width: 150 }} value={t.event} onChange={(e) => set({ transitions: sm.transitions.map((x, j) => j === i ? { ...x, event: e.target.value } : x) })} />
                  <TextField select size="small" label="to" sx={{ width: 130 }} value={t.to} onChange={(e) => set({ transitions: sm.transitions.map((x, j) => j === i ? { ...x, to: e.target.value } : x) })}>
                    {sm.states.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                  </TextField>
                  <IconButton size="small" color="error" onClick={() => set({ transitions: sm.transitions.filter((_, j) => j !== i) })}><DeleteOutlineIcon fontSize="small" /></IconButton>
                </Stack>
              ))}
              <Button size="small" startIcon={<AddIcon />} disabled={sm.states.length < 1} onClick={() => set({ transitions: [...sm.transitions, { from: sm.states[0], event: '', to: sm.states[0] }] })}>
                Add transition
              </Button>
            </>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
