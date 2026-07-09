/**
 * Shared building blocks for the user-facing Cortex workspace (FEAT-022):
 * status chips for chat/task/outbox states, guardrail-hit displays, chat
 * bubbles, a typing indicator, model/skills/tools pickers, and the module
 * "disabled" state. Conventions match the rest of web/: TanStack Query for
 * server state, MUI palette colors only, toMessage() for errors.
 */
import { ReactNode, useState, KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Checkbox,
  Chip,
  Collapse,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import { toMessage } from '@/lib/errors';
import {
  cortexApi,
  isCortexDisabled,
  type GuardrailHit,
  type MessageStatus,
  type OutboxStatus,
  type TaskStatus,
  type TurnGuardrails,
} from '@/api/cortex';

/* ------------------------------------------------------------ disabled gate */

export function CortexDisabledAlert() {
  return (
    <Alert severity="warning">
      Cortex is not enabled on this deployment (CORTEX_ENABLED). Ask an administrator to enable the
      AI module.
    </Alert>
  );
}

/** Error renderer that treats the 503 CORTEX_DISABLED envelope as the module-dark state. */
export function CortexQueryError({ error }: { error: unknown }) {
  if (isCortexDisabled(error)) return <CortexDisabledAlert />;
  return <Alert severity="error">{toMessage(error)}</Alert>;
}

/* ------------------------------------------------------------------- chips */

/** Chip for a non-'sent' assistant/agent reply status; renders nothing when clean. */
export function MessageStatusChip({ status }: { status: MessageStatus }) {
  if (!status || status === 'sent') return null;
  if (status === 'blocked_input' || status === 'blocked_output') {
    return <Chip size="small" color="error" variant="outlined" label="blocked" />;
  }
  if (status === 'escalated_input' || status === 'escalated_output') {
    return <Chip size="small" color="warning" variant="outlined" label="held for review" />;
  }
  return <Chip size="small" color="success" variant="outlined" label="sent after review" />;
}

const TASK_COLOR: Record<TaskStatus, 'warning' | 'info' | 'success' | 'error'> = {
  queued: 'warning',
  running: 'info',
  done: 'success',
  failed: 'error',
};

export function TaskStatusChip({ status }: { status: TaskStatus }) {
  return <Chip size="small" variant="outlined" color={TASK_COLOR[status] ?? 'default'} label={status} />;
}

const OUTBOX_COLOR: Record<OutboxStatus, 'success' | 'warning' | 'error'> = {
  sent: 'success',
  pending_review: 'warning',
  blocked: 'error',
};

export function OutboxStatusChip({ status }: { status: OutboxStatus }) {
  return (
    <Chip
      size="small"
      variant="outlined"
      color={OUTBOX_COLOR[status] ?? 'default'}
      label={status === 'pending_review' ? 'pending review' : status}
    />
  );
}

/* -------------------------------------------------------------- guardrails */

export interface ScopedHit extends GuardrailHit {
  scope?: string;
}

/** Flatten a per-turn verdict bundle into a displayable hit list. */
export function collectHits(g?: TurnGuardrails | null): ScopedHit[] {
  if (!g) return [];
  return [
    ...(g.input?.hits ?? []).map((h) => ({ ...h, scope: 'input' })),
    ...(g.output?.hits ?? []).map((h) => ({ ...h, scope: 'output' })),
  ];
}

const HIT_COLOR: Record<string, 'error' | 'warning' | 'info'> = {
  block: 'error',
  escalate: 'warning',
  warn: 'info',
};

/** Plain guardrail-hit list (dialogs, task transcript, email results). */
export function GuardrailHitList({ hits }: { hits: ScopedHit[] }) {
  if (!hits.length) return null;
  return (
    <Stack spacing={0.5} sx={{ mt: 0.5 }}>
      {hits.map((h, i) => (
        <Stack key={i} direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip size="small" variant="outlined" color={HIT_COLOR[h.action] ?? 'default'} label={h.action} />
          <Typography variant="caption" color="text.secondary">
            {h.scope ? `${h.scope} · ` : ''}
            {h.guardrail} — {h.rule_type}: {h.rule}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

/** Subtle expandable "N guardrail hits" line under a chat reply. */
export function GuardrailHitsLine({ guardrails }: { guardrails?: TurnGuardrails | null }) {
  const [open, setOpen] = useState(false);
  const hits = collectHits(guardrails);
  if (!hits.length) return null;
  return (
    <Box sx={{ pl: 0.5 }}>
      <Typography
        variant="caption"
        color="text.secondary"
        onClick={() => setOpen((o) => !o)}
        sx={{ cursor: 'pointer', userSelect: 'none' }}
      >
        {open ? '▾' : '▸'} {hits.length} guardrail hit{hits.length === 1 ? '' : 's'}
      </Typography>
      <Collapse in={open}>
        <GuardrailHitList hits={hits} />
      </Collapse>
    </Box>
  );
}

/* ------------------------------------------------------------ chat display */

/** One chat bubble; `mine` = the current user's side (right, primary color). */
export function ChatBubble({
  mine,
  children,
  footer,
}: {
  mine: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
      <Box
        sx={{
          maxWidth: '78%',
          px: 1.5,
          py: 1,
          borderRadius: 2,
          bgcolor: mine ? 'primary.main' : 'action.hover',
          color: mine ? 'primary.contrastText' : 'text.primary',
          fontSize: 14,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {children}
        {footer && <Box sx={{ mt: 0.5 }}>{footer}</Box>}
      </Box>
    </Box>
  );
}

/** Three pulsing dots while the LLM composes a reply (can take tens of seconds). */
export function TypingIndicator() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
      <Stack
        direction="row"
        spacing={0.6}
        alignItems="center"
        sx={{ px: 1.5, py: 1.25, borderRadius: 2, bgcolor: 'action.hover' }}
      >
        {[0, 1, 2].map((i) => (
          <Box
            key={i}
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: 'text.secondary',
              animation: 'cortexTyping 1.2s ease-in-out infinite',
              animationDelay: `${i * 0.2}s`,
              '@keyframes cortexTyping': {
                '0%, 100%': { opacity: 0.25 },
                '50%': { opacity: 1 },
              },
            }}
          />
        ))}
      </Stack>
    </Box>
  );
}

/** Multiline composer: Enter sends, Shift+Enter for a newline. */
export function ChatComposer({
  onSend,
  disabled,
  placeholder = 'Type a message…',
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [text, setText] = useState('');
  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    setText('');
    onSend(t);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };
  return (
    <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ p: 1 }}>
      <TextField
        fullWidth
        size="small"
        multiline
        maxRows={4}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <IconButton color="primary" onClick={submit} disabled={disabled || !text.trim()} aria-label="Send">
        <SendIcon />
      </IconButton>
    </Stack>
  );
}

/* ----------------------------------------------------------------- pickers */

export function useModels() {
  return useQuery({ queryKey: ['cortex', 'models'], queryFn: cortexApi.models, retry: 1 });
}

export function useSkills() {
  return useQuery({ queryKey: ['cortex', 'skills'], queryFn: cortexApi.skills });
}

export function useTools() {
  return useQuery({ queryKey: ['cortex', 'tools'], queryFn: cortexApi.tools });
}

/**
 * Model picker. `''` means "use the default (brain) model" — callers should
 * omit `model` from the request when the value is empty. Degrades gracefully
 * when the model router is unreachable (502): disabled, with a hint.
 */
export function ModelSelect({
  value,
  onChange,
  sx,
}: {
  value: string;
  onChange: (v: string) => void;
  sx?: object;
}) {
  const q = useModels();
  if (q.isError) {
    return (
      <TextField
        select
        size="small"
        label="Model"
        value=""
        disabled
        helperText="Model router unreachable — the default model will be used"
        sx={sx}
      >
        <MenuItem value="">Default</MenuItem>
      </TextField>
    );
  }
  const models = q.data?.models ?? [];
  const brain = q.data?.brain;
  const known = value === '' || models.some((m) => m.id === value);
  return (
    <TextField
      select
      size="small"
      label="Model"
      value={known ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      disabled={q.isLoading}
      sx={sx}
    >
      <MenuItem value="">{brain ? `Default (${brain})` : 'Default'}</MenuItem>
      {models
        .filter((m) => m.id !== brain)
        .map((m) => (
          <MenuItem key={m.id} value={m.id}>
            {m.id}
          </MenuItem>
        ))}
    </TextField>
  );
}

/** Checkbox multi-select over a string option list (skills, tools). */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  sx,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  sx?: object;
}) {
  return (
    <TextField
      select
      size="small"
      label={label}
      value={value}
      onChange={(e) => {
        const v = e.target.value as unknown;
        onChange(typeof v === 'string' ? v.split(',').filter(Boolean) : (v as string[]));
      }}
      SelectProps={{
        multiple: true,
        renderValue: (v) => (v as string[]).join(', '),
        displayEmpty: false,
      }}
      disabled={!options.length}
      helperText={!options.length ? 'None available' : undefined}
      sx={sx}
    >
      {options.map((o) => (
        <MenuItem key={o} value={o}>
          <Checkbox size="small" checked={value.includes(o)} sx={{ p: 0.5, mr: 1 }} />
          {o}
        </MenuItem>
      ))}
    </TextField>
  );
}
