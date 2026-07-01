import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Collapse, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import PushPinIcon from '@mui/icons-material/PushPin';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CloseIcon from '@mui/icons-material/Close';
import { sparkApi, type Message } from '@/api/spark';
import { useE2eeStore } from '@/lib/e2eeStore';

/** Pull the message array out of either response shape the route may return. */
function pinnedFrom(data: unknown): Message[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as Record<string, unknown>;
  if (Array.isArray(d.messages)) return d.messages as Message[];
  if (Array.isArray(d.pinnedMessages)) return d.pinnedMessages as Message[];
  return [];
}

/** One pinned row — decrypts E2EE content locally, falls back to plaintext. */
function PinnedRow({ message, canUnpin, onUnpin }: { message: Message; canUnpin: boolean; onUnpin: (id: string) => void }) {
  const decrypt = useE2eeStore((s) => s.decrypt);
  const [text, setText] = useState<string | null>(message.encrypted ? null : message.content);

  useEffect(() => {
    let cancelled = false;
    if (message.encrypted && message.encryptedContent) {
      decrypt(message.id, message.encryptedContent).then((pt) => !cancelled && setText(pt));
    } else {
      setText(message.content);
    }
    return () => {
      cancelled = true;
    };
  }, [message.id, message.encrypted, message.encryptedContent, message.content, decrypt]);

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="caption" sx={{ flex: 1 }} noWrap color="text.secondary">
        {text ?? (message.attachments?.length ? '📎 attachment' : '🔒 encrypted message')}
      </Typography>
      {canUnpin && (
        <Tooltip title="Unpin">
          <IconButton size="small" onClick={() => onUnpin(message.id)}>
            <CloseIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Tooltip>
      )}
    </Stack>
  );
}

/** Collapsible bar listing a conversation's pinned messages. Hidden when none. */
export function PinnedBar({
  conversationId,
  canUnpin,
  onUnpin,
}: {
  conversationId: string;
  canUnpin: boolean;
  onUnpin: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['spark', 'pinned', conversationId],
    queryFn: () => sparkApi.listPinned(conversationId),
  });
  const pinned = pinnedFrom(q.data);
  if (pinned.length === 0) return null;

  return (
    <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: 1.5, py: 0.5, cursor: 'pointer' }}
        onClick={() => setOpen((o) => !o)}
      >
        <PushPinIcon sx={{ fontSize: 16 }} color="action" />
        <Typography variant="caption" sx={{ flex: 1, fontWeight: 600 }}>
          {pinned.length} pinned
        </Typography>
        <ExpandMoreIcon
          sx={{ fontSize: 18, transform: open ? 'rotate(180deg)' : 'none', transition: '0.2s' }}
        />
      </Stack>
      <Collapse in={open}>
        <Stack spacing={0.5} sx={{ px: 1.5, pb: 1 }}>
          {pinned.map((m) => (
            <PinnedRow key={m.id} message={m} canUnpin={canUnpin} onUnpin={onUnpin} />
          ))}
        </Stack>
      </Collapse>
    </Box>
  );
}
