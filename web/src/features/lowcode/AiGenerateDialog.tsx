/**
 * AI-assisted authoring — describe an entity or flow in natural language, get
 * a validated draft back, review the summary + warnings, then open it in the
 * normal editor (nothing is saved until the user saves there).
 */
import { useState } from 'react';
import {
  Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { useMutation } from '@tanstack/react-query';
import { lowcodeApi, type Field } from '@/api/lowcode';
import { toMessage } from '@/lib/errors';

const PLACEHOLDERS: Record<'entity' | 'flow', string> = {
  entity: 'e.g. Track customer support tickets with priority, status lifecycle (open → in progress → resolved), assignee and due date',
  flow: 'e.g. When a record is created, notify the owner and post a summary to the timeline',
};

export function AiGenerateDialog({ open, kind, appId, onClose, onDraft }: {
  open: boolean;
  kind: 'entity' | 'flow';
  appId: string;
  onClose: () => void;
  onDraft: (draft: Record<string, unknown>, warnings: string[]) => void;
}) {
  const [prompt, setPrompt] = useState('');

  const gen = useMutation({
    mutationFn: () => lowcodeApi.aiGenerate({ kind, prompt: prompt.trim(), appId }),
  });

  const draft = gen.data?.draft;
  const warnings = gen.data?.warnings ?? [];

  const summary = () => {
    if (!draft) return null;
    if (kind === 'entity') {
      const fields = (draft.fields as Field[] | undefined) ?? [];
      return (
        <Stack spacing={1}>
          <Typography variant="subtitle2">{String(draft.name)} <Typography component="span" variant="caption" color="text.secondary">({String(draft.key)})</Typography></Typography>
          <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
            {fields.map((f) => <Chip key={f.key} size="small" variant="outlined" label={`${f.label || f.key}: ${f.type}${f.formula !== undefined ? ' ƒ' : ''}`} />)}
          </Stack>
          {!!draft.stateMachine && <Typography variant="caption" color="text.secondary">Includes a record lifecycle state machine.</Typography>}
        </Stack>
      );
    }
    const actions = (draft.actions as { type: string }[] | undefined) ?? [];
    const trigger = draft.trigger as { type?: string; cron?: string } | undefined;
    return (
      <Stack spacing={1}>
        <Typography variant="subtitle2">{String(draft.name)} <Typography component="span" variant="caption" color="text.secondary">({String(draft.key)})</Typography></Typography>
        <Typography variant="caption">
          Trigger: {trigger?.type === 'event' || !trigger?.type ? String(draft.event ?? '(pick event)') : `${trigger.type}${trigger.cron ? ` (${trigger.cron})` : ''}`}
        </Typography>
        <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
          {actions.map((a, i) => <Chip key={i} size="small" variant="outlined" label={a.type} />)}
        </Stack>
      </Stack>
    );
  };

  const close = () => { gen.reset(); setPrompt(''); onClose(); };

  return (
    <Dialog open={open} onClose={gen.isPending ? undefined : close} fullWidth maxWidth="sm">
      <DialogTitle>Generate {kind} with AI</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            autoFocus multiline minRows={3} label={`Describe the ${kind}`} value={prompt}
            onChange={(e) => setPrompt(e.target.value)} placeholder={PLACEHOLDERS[kind]}
          />
          {gen.isError && <Alert severity="error">{toMessage(gen.error)}</Alert>}
          {warnings.length > 0 && (
            <Alert severity="warning">
              {warnings.slice(0, 5).map((w, i) => <div key={i}>{w}</div>)}
            </Alert>
          )}
          {draft && <Alert severity="success" icon={false}>{summary()}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={close} disabled={gen.isPending}>Cancel</Button>
        <Button
          variant={draft ? 'outlined' : 'contained'} startIcon={<AutoAwesomeIcon />}
          disabled={!prompt.trim() || gen.isPending} onClick={() => gen.mutate()}
        >
          {gen.isPending ? 'Generating…' : draft ? 'Regenerate' : 'Generate'}
        </Button>
        {draft && (
          <Button variant="contained" onClick={() => { onDraft(draft, warnings); close(); }}>
            Open in editor
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
