/**
 * Execute a tool right now with typed inputs derived from its declared
 * parameters (one input per property). Run errors come back 400 as
 * { error: 'Name: message' }; python tools 400 unless the server sets
 * CORTEX_PYTHON_TOOLS_ENABLED.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { isCortexDisabled } from '@/api/cortex';
import { cortexAdminApi } from '@/api/admin/cortex';
import { toMessage } from '@/lib/errors';
import { Loading } from '@/features/admin/ui';
import { ArgInputs } from './ToolDialog';
import { ModuleDisabledAlert } from './common';

export function RunToolDialog({ name, onClose }: { name: string | null; onClose: () => void }) {
  const specQ = useQuery({
    queryKey: ['cortex-admin', 'tool', name],
    queryFn: () => cortexAdminApi.tool(name as string),
    enabled: !!name,
  });
  const spec = specQ.data;
  const [args, setArgs] = useState<Record<string, string | boolean>>({});

  const params = useMemo(() => {
    if (!spec) return [];
    const required = spec.parameters?.required ?? [];
    return Object.entries(spec.parameters?.properties ?? {}).map(([n, p]) => ({
      name: n,
      type: p.type ?? 'string',
      description: p.description,
      required: required.includes(n),
    }));
  }, [spec]);

  useEffect(() => {
    // Reset inputs whenever a (new) tool is opened / its spec arrives.
    const next: Record<string, string | boolean> = {};
    for (const p of params) next[p.name] = p.type === 'boolean' ? false : '';
    setArgs(next);
    run.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, spec]);

  const run = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const p of params) {
        const v = args[p.name];
        if (p.type === 'boolean') body[p.name] = !!v;
        else if (typeof v === 'string' && v !== '') {
          body[p.name] = p.type === 'number' || p.type === 'integer' ? Number(v) : v;
        } else if (p.required) {
          body[p.name] = '';
        }
      }
      return cortexAdminApi.runTool(name as string, body);
    },
  });

  const missingRequired = params.some((p) => p.required && p.type !== 'boolean' && !args[p.name]);

  return (
    <Dialog open={!!name} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Run tool — {name} {spec && <Chip size="small" variant="outlined" label={spec.kind} sx={{ ml: 1 }} />}
      </DialogTitle>
      <DialogContent dividers>
        {specQ.isLoading ? (
          <Loading />
        ) : specQ.isError ? (
          isCortexDisabled(specQ.error) ? (
            <ModuleDisabledAlert />
          ) : (
            <Alert severity="error">{toMessage(specQ.error)}</Alert>
          )
        ) : (
          spec && (
            <Stack spacing={2}>
              {spec.description && (
                <Typography variant="body2" color="text.secondary">
                  {spec.description}
                </Typography>
              )}
              <ArgInputs params={params} args={args} onChange={(n, v) => setArgs((cur) => ({ ...cur, [n]: v }))} />
              {run.isError && <Alert severity="error">{toMessage(run.error)}</Alert>}
              {run.data && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    Result
                  </Typography>
                  <Box
                    component="pre"
                    sx={{
                      m: 0,
                      p: 1.5,
                      bgcolor: 'background.default',
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      fontSize: 12,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      overflow: 'auto',
                      maxHeight: 320,
                    }}
                  >
                    {run.data.result}
                  </Box>
                </Box>
              )}
            </Stack>
          )
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          startIcon={<PlayArrowIcon />}
          disabled={!spec || run.isPending || missingRequired}
          onClick={() => run.mutate()}
        >
          {run.isPending ? 'Running…' : 'Run'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
