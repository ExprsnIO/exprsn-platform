/**
 * Named word lists admin tab — list + create/edit dialog.
 * Backend: /moderator/api/wordlists. List names must match ^[a-z0-9_]+$.
 */
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { moderatorAdminApi, type WordList } from '@/api/admin/moderator';
import { DataTable, QueryState, SectionHeader, StatusChip } from '../../ui';

const NAME_RE = /^[a-z0-9_]+$/;

function WordListDialog({
  open,
  list,
  onClose,
  onDone,
}: {
  open: boolean;
  list?: WordList | null;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'deny' | 'allow'>('deny');
  const [words, setWords] = useState('');

  useEffect(() => {
    if (open) {
      setName(list?.name ?? '');
      setMode(list?.mode ?? 'deny');
      setWords((list?.words ?? []).join('\n'));
    }
  }, [open, list]);

  const save = useMutation({
    mutationFn: () =>
      moderatorAdminApi.saveWordlist(name, {
        words: words.split(/[\n,]+/).map((w) => w.trim()).filter(Boolean),
        mode,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mod', 'wordlists'] });
      onDone(list ? 'Word list saved' : 'Word list created');
      onClose();
    },
    onError: (e) => onDone((e as Error).message),
  });

  const nameValid = NAME_RE.test(name);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{list ? `Edit list “${list.name}”` : 'New word list'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <TextField
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!!list}
            error={!!name && !nameValid}
            helperText={name && !nameValid ? 'Lowercase letters, digits and underscores only' : 'e.g. profanity_en'}
          />
          <TextField select label="Mode" value={mode} onChange={(e) => setMode(e.target.value as 'deny' | 'allow')}>
            <MenuItem value="deny">deny</MenuItem>
            <MenuItem value="allow">allow</MenuItem>
          </TextField>
          <TextField
            label="Words (one per line)"
            multiline
            minRows={8}
            value={words}
            onChange={(e) => setWords(e.target.value)}
            inputProps={{ style: { fontFamily: 'monospace', fontSize: 13 } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!nameValid || save.isPending} onClick={() => save.mutate()}>{list ? 'Save' : 'Create'}</Button>
      </DialogActions>
    </Dialog>
  );
}

function arr<T>(d: Record<string, unknown>, ...keys: string[]): T[] {
  for (const k of keys) if (Array.isArray(d[k])) return d[k] as T[];
  return [];
}

export function WordListsTab({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ list: WordList | null } | null>(null);
  const query = useQuery({ queryKey: ['mod', 'wordlists'], queryFn: moderatorAdminApi.wordlists });
  const del = (name: string) =>
    moderatorAdminApi.deleteWordlist(name).then(() => { onToast('Word list deleted'); qc.invalidateQueries({ queryKey: ['mod', 'wordlists'] }); }).catch((e) => onToast((e as Error).message));

  return (
    <Stack spacing={2}>
      <SectionHeader
        level={2}
        title="Word lists"
        subtitle="Named keyword lists referenced by rules — /moderator/api/wordlists"
        actions={<Button variant="contained" onClick={() => setDialog({ list: null })}>New list</Button>}
      />
      <QueryState query={query} empty="No word lists.">
        {(d) => (
          <DataTable
            rows={arr<WordList>(d, 'lists', 'data')}
            rowKey={(l) => l.name}
            columns={[
              { key: 'name', header: 'Name', mono: true, render: (l) => l.name },
              { key: 'mode', header: 'Mode', render: (l) => <StatusChip status={l.mode} /> },
              { key: 'count', header: 'Words', align: 'right', render: (l) => l.count ?? l.words?.length ?? 0 },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (l) => (
                  <>
                    <Tooltip title="Edit"><IconButton size="small" onClick={() => setDialog({ list: l })}><EditIcon fontSize="small" /></IconButton></Tooltip>
                    <IconButton size="small" color="error" onClick={() => { if (confirm(`Delete word list “${l.name}”?`)) del(l.name); }}><DeleteIcon fontSize="small" /></IconButton>
                  </>
                ),
              },
            ]}
          />
        )}
      </QueryState>
      <WordListDialog open={!!dialog} list={dialog?.list} onClose={() => setDialog(null)} onDone={onToast} />
    </Stack>
  );
}
