import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Avatar,
  Box,
  CircularProgress,
  List,
  ListItemAvatar,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import { sparkApi } from '@/api/spark';
import { toMessage } from '@/lib/errors';
import { conversationTitle, formatTime, initials } from './util';

function useConversations() {
  return useQuery({ queryKey: ['spark', 'conversations'], queryFn: sparkApi.listConversations });
}

export function ConversationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { data, isLoading, error } = useConversations();

  if (isLoading)
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  if (error) return <Alert severity="error">{toMessage(error)}</Alert>;

  const conversations = data!.conversations;

  if (conversations.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
        No conversations yet.
      </Typography>
    );
  }

  return (
    <List disablePadding>
      {conversations.map((c) => {
        const title = conversationTitle(c);
        const last = c.messages?.[0];
        return (
          <ListItemButton
            key={c.id}
            selected={c.id === selectedId}
            onClick={() => onSelect(c.id)}
            alignItems="flex-start"
          >
            <ListItemAvatar>
              <Avatar>{initials(title)}</Avatar>
            </ListItemAvatar>
            <ListItemText
              primary={title}
              secondary={
                last ? (
                  <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    <LockIcon sx={{ fontSize: 14 }} /> Encrypted message
                  </Box>
                ) : (
                  'No messages yet'
                )
              }
              secondaryTypographyProps={{ noWrap: true, component: 'span' }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
              {formatTime(c.lastMessageAt)}
            </Typography>
          </ListItemButton>
        );
      })}
    </List>
  );
}
