/**
 * Form builder — declarative UI over an entity: named sections of fields,
 * optional wizard steps, per-field conditional visibility (visibleWhen), and
 * public (anonymous) publishing with a copyable share link. Structured editor
 * throughout; conditions use the shared ConditionBuilder.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Chip, Dialog,
  DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, MenuItem,
  Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import type { Entity, Form, FormLayoutField, FormSection } from '@/api/lowcode';
import { ConditionBuilder } from './flow/ConditionBuilder';

const KEY_RE = /^[a-z][a-z0-9_-]*$/;

interface ESection { title: string; fields: FormLayoutField[] }

function toESections(form: Form | null): ESection[] {
  const sections = form?.layout?.sections;
  if (!sections?.length) return [{ title: '', fields: [] }];
  return sections.map((s: FormSection) => ({
    title: s.title ?? '',
    fields: (s.fields ?? []).map((f) => (typeof f === 'string' ? { key: f } : f)),
  }));
}

export function FormEditorDialog({ open, form, entity, entities, appId, busy, onClose, onSave }: {
  open: boolean;
  form: Form | null;
  /** Preselected entity (when opened from an entity context), else pick below. */
  entity?: Entity;
  entities: Entity[];
  appId: string;
  busy?: boolean;
  onClose: () => void;
  onSave: (payload: Partial<Form>) => void;
}) {
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [entityKey, setEntityKey] = useState('');
  const [sections, setSections] = useState<ESection[]>([{ title: '', fields: [] }]);
  const [steps, setSteps] = useState(false);
  const [submitLabel, setSubmitLabel] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(form?.name ?? '');
    setKey(form?.key ?? '');
    setEntityKey(form?.entityKey ?? entity?.key ?? entities[0]?.key ?? '');
    setSections(toESections(form));
    setSteps(!!form?.layout?.steps);
    setSubmitLabel(form?.layout?.submitLabel ?? '');
    setIsPublic(!!form?.isPublic);
    setSuccessMessage((form?.settings?.successMessage as string) ?? '');
    setError(null);
  }, [open, form, entity, entities]);

  const target = useMemo(() => entities.find((e) => e.key === entityKey), [entities, entityKey]);
  const usedKeys = useMemo(() => new Set(sections.flatMap((s) => s.fields.map((f) => f.key))), [sections]);
  const available = (target?.fields ?? []).filter((f) => !usedKeys.has(f.key));

  const patchSection = (i: number, patch: Partial<ESection>) =>
    setSections((ss) => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const patchField = (si: number, fi: number, patch: Partial<FormLayoutField>) =>
    setSections((ss) => ss.map((s, j) => (j === si ? { ...s, fields: s.fields.map((f, k) => (k === fi ? { ...f, ...patch } : f)) } : s)));
  const moveField = (si: number, fi: number, dir: -1 | 1) =>
    setSections((ss) => ss.map((s, j) => {
      if (j !== si) return s;
      const k = fi + dir;
      if (k < 0 || k >= s.fields.length) return s;
      const fields = [...s.fields];
      [fields[fi], fields[k]] = [fields[k], fields[fi]];
      return { ...s, fields };
    }));

  const submit = () => {
    setError(null);
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!form && !KEY_RE.test(key)) { setError('Key must be lower-snake/kebab starting with a letter.'); return; }
    if (!entityKey) { setError('Pick an entity.'); return; }
    if (!sections.some((s) => s.fields.length)) { setError('Add at least one field to the form.'); return; }
    const payload: Partial<Form> = {
      name: name.trim(),
      entityKey,
      isPublic,
      settings: successMessage.trim() ? { successMessage: successMessage.trim() } : {},
      layout: {
        sections: sections
          .filter((s) => s.fields.length)
          .map((s) => ({ title: s.title.trim() || undefined, fields: s.fields.map((f) => (f.visibleWhen || f.placeholder || f.help ? f : f.key)) })),
        steps: steps || undefined,
        submitLabel: submitLabel.trim() || undefined,
      },
    };
    if (!form) { payload.appId = appId; payload.key = key; }
    onSave(payload);
  };

  const publicUrl = form?.slug ? `${window.location.origin}/f/${form.slug}` : null;

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{form ? `Edit form — ${form.name}` : 'New form'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField label="Name" size="small" fullWidth value={name} onChange={(e) => setName(e.target.value)} required />
            <TextField label="Key" size="small" fullWidth value={key} disabled={!!form} onChange={(e) => setKey(e.target.value)} helperText={form ? 'immutable' : 'lower-snake'} />
            <TextField select label="Entity" size="small" fullWidth value={entityKey} onChange={(e) => { setEntityKey(e.target.value); setSections([{ title: '', fields: [] }]); }}>
              {entities.map((e) => <MenuItem key={e.key} value={e.key}>{e.name}</MenuItem>)}
            </TextField>
          </Stack>

          {/* ── Sections ─────────────────────────────────────────── */}
          {sections.map((s, si) => (
            <Box key={si} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                <TextField label={steps ? `Step ${si + 1} title` : 'Section title (optional)'} size="small" value={s.title} onChange={(e) => patchSection(si, { title: e.target.value })} sx={{ flex: 1 }} />
                {sections.length > 1 && (
                  <Tooltip title="Remove section">
                    <IconButton aria-label="Remove section" size="small" color="error" onClick={() => setSections((ss) => ss.filter((_, j) => j !== si))}><DeleteOutlineIcon fontSize="small" /></IconButton>
                  </Tooltip>
                )}
              </Stack>

              <Stack spacing={1}>
                {s.fields.map((f, fi) => {
                  const def = target?.fields.find((x) => x.key === f.key);
                  return (
                    <Accordion key={f.key} variant="outlined" disableGutters>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, pr: 1 }}>
                          <Typography variant="body2" sx={{ flex: 1 }}>{def?.label || f.key}</Typography>
                          {f.visibleWhen != null && <Chip size="small" variant="outlined" label="conditional" />}
                          <Tooltip title="Move up"><IconButton aria-label="Move up" size="small" onClick={(e) => { e.stopPropagation(); moveField(si, fi, -1); }}><ArrowUpwardIcon fontSize="inherit" /></IconButton></Tooltip>
                          <Tooltip title="Move down"><IconButton aria-label="Move down" size="small" onClick={(e) => { e.stopPropagation(); moveField(si, fi, 1); }}><ArrowDownwardIcon fontSize="inherit" /></IconButton></Tooltip>
                          <Tooltip title="Remove from form"><IconButton aria-label="Remove from form" size="small" color="error" onClick={(e) => { e.stopPropagation(); patchSection(si, { fields: s.fields.filter((_, k) => k !== fi) }); }}><DeleteOutlineIcon fontSize="inherit" /></IconButton></Tooltip>
                        </Stack>
                      </AccordionSummary>
                      <AccordionDetails>
                        <Stack spacing={1.5}>
                          <Stack direction="row" spacing={1}>
                            <TextField label="placeholder" size="small" fullWidth value={f.placeholder ?? ''} onChange={(e) => patchField(si, fi, { placeholder: e.target.value || undefined })} />
                            <TextField label="help text" size="small" fullWidth value={f.help ?? ''} onChange={(e) => patchField(si, fi, { help: e.target.value || undefined })} />
                          </Stack>
                          <Stack direction="row" alignItems="center" justifyContent="space-between">
                            <Typography variant="caption" color="text.secondary">Show this field only when:</Typography>
                            {f.visibleWhen != null && <Button size="small" color="error" onClick={() => patchField(si, fi, { visibleWhen: undefined })}>Always show</Button>}
                          </Stack>
                          <ConditionBuilder value={f.visibleWhen ?? null} onChange={(w) => patchField(si, fi, { visibleWhen: (w as Record<string, unknown>) ?? undefined })} />
                        </Stack>
                      </AccordionDetails>
                    </Accordion>
                  );
                })}

                {available.length > 0 && (
                  <TextField
                    select label="Add field" size="small" value="" sx={{ width: 240 }}
                    onChange={(e) => { if (e.target.value) patchSection(si, { fields: [...s.fields, { key: e.target.value }] }); }}
                  >
                    {available.map((f) => <MenuItem key={f.key} value={f.key}>{f.label || f.key}{f.formula !== undefined ? ' (computed)' : ''}</MenuItem>)}
                  </TextField>
                )}
              </Stack>
            </Box>
          ))}
          <Button size="small" startIcon={<AddIcon />} onClick={() => setSections((ss) => [...ss, { title: '', fields: [] }])} sx={{ alignSelf: 'flex-start' }}>
            Add section
          </Button>

          <Divider />

          {/* ── Behaviour ────────────────────────────────────────── */}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
            <FormControlLabel control={<Switch checked={steps} onChange={(e) => setSteps(e.target.checked)} />} label="Wizard (one section per step)" />
            <TextField label="Submit button label" size="small" value={submitLabel} onChange={(e) => setSubmitLabel(e.target.value)} placeholder="Submit" />
          </Stack>

          {/* ── Public publishing ────────────────────────────────── */}
          <Box sx={{ p: 1.5, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
            <FormControlLabel
              control={<Switch checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />}
              label="Public form (anyone with the link can submit — no sign-in)"
            />
            {isPublic && (
              <Stack spacing={1} sx={{ mt: 1 }}>
                <TextField label="Success message" size="small" value={successMessage} onChange={(e) => setSuccessMessage(e.target.value)} placeholder="Thanks — your response was recorded." />
                {publicUrl ? (
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{publicUrl}</Typography>
                    <Tooltip title="Copy link">
                      <IconButton aria-label="Copy link" size="small" onClick={() => navigator.clipboard.writeText(publicUrl)}><ContentCopyIcon fontSize="inherit" /></IconButton>
                    </Tooltip>
                  </Stack>
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    The share link is generated when you save. Anonymous submissions require the app to be <b>published</b>.
                  </Typography>
                )}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={busy}>{form ? 'Save form' : 'Create form'}</Button>
      </DialogActions>
    </Dialog>
  );
}
