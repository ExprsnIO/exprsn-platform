/**
 * Skill registry: markdown prompt packs with recommended tools. No test gate —
 * enable/disable is immediate; LLM-built drafts still arrive disabled.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { cortexApi, type SkillSpec } from '@/api/cortex';
import { cortexAdminApi } from '@/api/admin/cortex';
import { toMessage } from '@/lib/errors';
import { DataTable, SectionHeader } from '@/features/admin/ui';
import {
  BuildDialog,
  ConfirmDeleteDialog,
  CortexQueryState,
  EnabledChip,
  type ToastFn,
} from './common';

const QK = ['cortex-admin', 'skills'];

function SkillDialog({
  open,
  spec,
  toolNames,
  onClose,
  toast,
}: {
  open: boolean;
  /** null = create a new skill */
  spec: SkillSpec | null;
  toolNames: string[];
  onClose: () => void;
  toast: ToastFn;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [recommendedTools, setRecommendedTools] = useState<string[]>([]);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(spec?.name ?? '');
    setDescription(spec?.description ?? '');
    setInstructions(spec?.instructions ?? '');
    setRecommendedTools(spec?.recommended_tools ?? []);
    setInlineError(null);
  }, [open, spec]);

  const save = useMutation({
    mutationFn: () =>
      cortexAdminApi.saveSkill({
        name: name.trim(),
        description: description.trim(),
        enabled: spec?.enabled ?? false,
        instructions,
        recommended_tools: recommendedTools,
      }),
    onSuccess: (r) => {
      toast(`Skill saved: ${r.saved}`, 'success');
      qc.invalidateQueries({ queryKey: QK });
      onClose();
    },
    onError: (e) => setInlineError(toMessage(e)),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{spec ? `Edit skill — ${spec.name}` : 'New skill'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {inlineError && <Alert severity="error">{inlineError}</Alert>}
          <TextField
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!!spec}
            helperText={spec ? 'names are immutable' : 'lowercase identifier'}
          />
          <TextField
            label="Description"
            required
            multiline
            minRows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            helperText="shown to the model when picking skills"
          />
          <TextField
            label="Instructions (markdown)"
            required
            multiline
            minRows={10}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            helperText="the prompt pack injected when this skill is active"
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
          />
          <Autocomplete
            multiple
            options={toolNames}
            value={recommendedTools}
            onChange={(_e, v) => setRecommendedTools(v)}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => <Chip size="small" label={option} {...getTagProps({ index })} key={option} />)
            }
            renderInput={(params) => (
              <TextField {...params} label="Recommended tools" placeholder="add tool…" helperText="tools the agent should get when this skill is active" />
            )}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!name.trim() || !instructions.trim() || save.isPending}
          onClick={() => {
            setInlineError(null);
            save.mutate();
          }}
        >
          {spec ? 'Save changes' : 'Create skill'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function SkillsTab({ toast }: { toast: ToastFn }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: QK, queryFn: cortexApi.skills });
  const tools = useQuery({ queryKey: ['cortex-admin', 'tools'], queryFn: cortexApi.tools });
  const [editor, setEditor] = useState<{ spec: SkillSpec | null } | null>(null);
  const [buildOpen, setBuildOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const invalidate = () => qc.invalidateQueries({ queryKey: QK });

  const openEditor = (name: string) =>
    cortexAdminApi
      .skill(name)
      .then((spec) => setEditor({ spec }))
      .catch((e) => toast(toMessage(e), 'error'));

  const enable = useMutation({
    mutationFn: (name: string) => cortexAdminApi.enableSkill(name),
    onSuccess: (r) => {
      toast(`Skill enabled: ${r.enabled}`, 'success');
      invalidate();
    },
    onError: (e) => toast(toMessage(e), 'error'),
  });

  const disable = useMutation({
    mutationFn: (name: string) => cortexAdminApi.disableSkill(name),
    onSuccess: (r) => {
      toast(`Skill disabled: ${r.disabled}`, 'success');
      invalidate();
    },
    onError: (e) => toast(toMessage(e), 'error'),
  });

  const del = useMutation({
    mutationFn: (name: string) => cortexAdminApi.deleteSkill(name),
    onSuccess: (r) => {
      toast(`Skill deleted: ${r.deleted}`, 'success');
      setToDelete(null);
      invalidate();
    },
    onError: (e) => toast(toMessage(e), 'error'),
  });

  return (
    <Stack spacing={2}>
      <SectionHeader
        title="Skills"
        subtitle="Markdown prompt packs with recommended tools — no test gate; AI drafts arrive disabled"
        actions={
          <>
            <Button variant="outlined" onClick={() => setBuildOpen(true)}>
              Draft with AI
            </Button>
            <Button variant="contained" onClick={() => setEditor({ spec: null })}>
              New skill
            </Button>
          </>
        }
      />
      <CortexQueryState query={query} empty="No skills yet.">
        {(d) => (
          <DataTable
            rows={d.skills}
            rowKey={(s) => s.name}
            tableId="cortex-skills"
            sortable
            filterable
            onRowClick={(s) => openEditor(s.name)}
            empty="No skills yet."
            columns={[
              { key: 'name', header: 'Name', mono: true },
              { key: 'enabled', header: 'Status', render: (s) => <EnabledChip enabled={s.enabled} /> },
              { key: 'description', header: 'Description' },
              {
                key: 'recommended_tools',
                header: 'Recommended tools',
                filterValue: (s) => s.recommended_tools.join(' '),
                render: (s) =>
                  s.recommended_tools.length ? (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      {s.recommended_tools.map((t) => (
                        <Chip key={t} size="small" variant="outlined" label={t} />
                      ))}
                    </Stack>
                  ) : (
                    '—'
                  ),
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                locked: true,
                render: (s) => (
                  <>
                    <Button
                      size="small"
                      disabled={enable.isPending || disable.isPending}
                      onClick={() => (s.enabled ? disable.mutate(s.name) : enable.mutate(s.name))}
                    >
                      {s.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Tooltip title="Delete">
                      <IconButton size="small" color="error" onClick={() => setToDelete(s.name)}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </>
                ),
              },
            ]}
          />
        )}
      </CortexQueryState>

      <SkillDialog
        open={!!editor}
        spec={editor?.spec ?? null}
        toolNames={(tools.data?.tools ?? []).map((t) => t.name)}
        onClose={() => setEditor(null)}
        toast={toast}
      />
      <BuildDialog
        kind="skill"
        open={buildOpen}
        onClose={() => setBuildOpen(false)}
        onOpenEditor={(spec) => {
          setBuildOpen(false);
          setEditor({ spec: spec as SkillSpec });
        }}
        toast={toast}
      />
      <ConfirmDeleteDialog
        name={toDelete}
        noun="skill"
        busy={del.isPending}
        onCancel={() => setToDelete(null)}
        onConfirm={() => toDelete && del.mutate(toDelete)}
      />
    </Stack>
  );
}
