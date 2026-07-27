import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutline';
import CampaignIcon from '@mui/icons-material/Campaign';
import SendIcon from '@mui/icons-material/Send';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { useAppStore } from '@/app/store';
import { sparkApi, type GroupChannelKind, type Message } from '@/api/spark';
import { toMessage } from '@/lib/errors';
import { formatTime, initials, shortId, sortByCreated } from '@/features/messages/util';
import type { GroupTabProps } from './types';
import { useGroupChannel } from './useGroupChannel';

const CHANNELS: { kind: GroupChannelKind; label: string; icon: React.ReactElement }[] = [
  { kind: 'chat', label: 'Chat', icon: <ChatBubbleOutlineIcon fontSize="small" /> },
  { kind: 'announcement', label: 'Announcements', icon: <CampaignIcon fontSize="small" /> },
];

/**
 * Group messaging (Phase 4). Two plaintext channels — Chat (all members write)
 * and Announcements (admins/owners write, everyone reads). Backed by spark
 * group channels: REST for history + send, the `/spark` socket for realtime
 * receive. Group channels are NOT E2E-encrypted.
 */
export default function MessagesTab({ groupId, ctx }: GroupTabProps) {
  const currentUserId = useAppStore((s) => s.user?.id) ?? '';
  const [active, setActive] = useState<GroupChannelKind>('chat');

  if (!ctx.can('viewMemberContent')) {
    return (
      <Paper variant="outlined" sx={{ p: 4 }}>
        <Stack spacing={1} alignItems="center" sx={{ textAlign: 'center' }}>
          <LockOutlinedIcon color="disabled" sx={{ fontSize: 40 }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Members only
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Join this group to read and send messages.
          </Typography>
        </Stack>
      </Paper>
    );
  }

  return <MessagesPanel groupId={groupId} currentUserId={currentUserId} active={active} setActive={setActive} />;
}

function MessagesPanel({
  groupId,
  currentUserId,
  active,
  setActive,
}: {
  groupId: string;
  currentUserId: string;
  active: GroupChannelKind;
  setActive: (k: GroupChannelKind) => void;
}) {
  const channelsQuery = useQuery({
    queryKey: ['spark', 'group-channels', groupId],
    queryFn: () => sparkApi.listGroupChannels(groupId),
    enabled: !!groupId,
  });

  const channels = channelsQuery.data?.channels;
  const channel = channels?.[active];
  const canPostAnnouncement =
    channels?.announcement.userRole === 'owner' || channels?.announcement.userRole === 'admin';
  const composerDisabled = active === 'announcement' && !canPostAnnouncement;

  const { messagesQuery, nameById, send } = useGroupChannel(
    groupId,
    active,
    channel?.id,
    currentUserId,
  );

  if (channelsQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }
  if (channelsQuery.error || !channels) {
    return <Alert severity="error">{toMessage(channelsQuery.error) || 'Failed to load channels.'}</Alert>;
  }

  return (
    <Paper variant="outlined" sx={{ display: 'flex', flexDirection: 'column', height: 560 }}>
      <Tabs
        value={active}
        onChange={(_e, v: GroupChannelKind) => setActive(v)}
        sx={{ borderBottom: 1, borderColor: 'divider', px: 1, minHeight: 48 }}
      >
        {CHANNELS.map((c) => (
          <Tab
            key={c.kind}
            value={c.kind}
            icon={c.icon}
            iconPosition="start"
            label={c.label}
            sx={{ minHeight: 48 }}
          />
        ))}
      </Tabs>

      <MessageList
        messages={messagesQuery.data?.messages}
        isLoading={messagesQuery.isLoading}
        error={messagesQuery.error}
        currentUserId={currentUserId}
        nameById={nameById}
      />

      <Divider />
      {composerDisabled ? (
        <Box sx={{ p: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Only group admins can post announcements. You can read this channel.
          </Typography>
        </Box>
      ) : (
        <Composer
          onSend={send}
          placeholder={active === 'announcement' ? 'Write an announcement…' : 'Write a message…'}
        />
      )}
    </Paper>
  );
}

function MessageList({
  messages,
  isLoading,
  error,
  currentUserId,
  nameById,
}: {
  messages: Message[] | undefined;
  isLoading: boolean;
  error: unknown;
  currentUserId: string;
  nameById: Record<string, string>;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const sorted = useMemo(() => (messages ? sortByCreated(messages) : []), [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sorted.length]);

  if (isLoading) {
    return (
      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <CircularProgress size={24} />
      </Box>
    );
  }
  if (error) {
    return (
      <Box sx={{ flex: 1, p: 2 }}>
        <Alert severity="error">{toMessage(error)}</Alert>
      </Box>
    );
  }
  if (sorted.length === 0) {
    return (
      <Box
        sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', p: 3 }}
      >
        <Typography variant="body2" color="text.secondary">
          No messages yet. Start the conversation.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
      <Stack spacing={1.5}>
        {sorted.map((m) => (
          <MessageRow key={m.id} message={m} currentUserId={currentUserId} nameById={nameById} />
        ))}
        <div ref={bottomRef} />
      </Stack>
    </Box>
  );
}

function MessageRow({
  message,
  currentUserId,
  nameById,
}: {
  message: Message;
  currentUserId: string;
  nameById: Record<string, string>;
}) {
  const mine = message.senderId === currentUserId;
  const label = mine ? 'You' : nameById[message.senderId] || shortId(message.senderId);

  const body = message.deleted ? (
    <Typography variant="body2" sx={{ fontStyle: 'italic' }} color="text.secondary">
      Message deleted
    </Typography>
  ) : (
    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
      {message.content}
    </Typography>
  );

  return (
    <Stack
      direction="row"
      spacing={1}
      sx={{ justifyContent: mine ? 'flex-end' : 'flex-start' }}
      alignItems="flex-start"
    >
      {!mine && (
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            bgcolor: 'secondary.main',
            color: 'secondary.contrastText',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mt: 0.5,
            flexShrink: 0,
          }}
        >
          {initials(label)}
        </Box>
      )}
      <Paper
        variant="outlined"
        sx={{
          p: 1.25,
          maxWidth: '70%',
          bgcolor: mine ? 'primary.main' : 'background.paper',
          color: mine ? 'primary.contrastText' : 'text.primary',
          borderColor: mine ? 'primary.main' : 'divider',
        }}
      >
        {!mine && (
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.25 }}>
            {label}
          </Typography>
        )}
        {body}
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
          <Typography variant="caption" sx={{ opacity: 0.7 }}>
            {formatTime(message.createdAt)}
            {message.edited && !message.deleted ? ' · edited' : ''}
          </Typography>
        </Stack>
      </Paper>
    </Stack>
  );
}

function Composer({
  onSend,
  placeholder,
}: {
  onSend: (text: string) => Promise<void>;
  placeholder: string;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(trimmed);
      setText('');
    } catch (err) {
      setError(toMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ p: 1.5 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}
      <Stack direction="row" spacing={1} alignItems="flex-end">
        <TextField
          fullWidth
          size="small"
          multiline
          maxRows={6}
          placeholder={placeholder}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <IconButton color="primary" aria-label="Send message" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? <CircularProgress size={20} /> : <SendIcon />}
        </IconButton>
      </Stack>
      <Chip
        size="small"
        variant="outlined"
        label="Plaintext · visible to all members"
        sx={{ mt: 1, opacity: 0.7 }}
      />
    </Box>
  );
}
