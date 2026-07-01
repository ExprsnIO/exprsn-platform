import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import RateReviewOutlinedIcon from '@mui/icons-material/RateReviewOutlined';
import { useAppStore } from '@/app/store';
import { NS } from '@/lib/realtime';
import { useNamespaceStatus, type ConnState } from '@/lib/useRealtime';
import { EncryptionGate } from './EncryptionGate';
import { ConversationList } from './ConversationList';
import { ConversationView } from './ConversationView';
import { NewConversationDialog } from './NewConversationDialog';

const CHIP_COLOR: Record<ConnState, 'success' | 'warning' | 'default' | 'error'> = {
  connected: 'success',
  connecting: 'warning',
  disconnected: 'default',
  error: 'error',
};

/**
 * Phase 4b — Spark messaging. Connects the `/spark` realtime namespace, gates
 * the UI behind E2EE unlock, and lays out the conversation list beside the
 * active conversation. Existing-conversations-only (no compose-new yet).
 */
export function MessagesPage() {
  const userId = useAppStore((s) => s.user?.id);
  const conn = useNamespaceStatus(NS.spark);
  // Allow deep-linking to a conversation (e.g. the "Message" button on a profile
  // navigates to /messages?c=<id>). Falls back to no selection.
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('c'));
  const [composeOpen, setComposeOpen] = useState(false);

  if (!userId) return <Alert severity="error">Not signed in.</Alert>;

  return (
    <Stack spacing={2} sx={{ height: 'calc(100vh - 140px)' }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Typography variant="h5">Messages</Typography>
        <Chip size="small" color={CHIP_COLOR[conn]} label={conn === 'connected' ? 'live' : conn} />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" size="small" startIcon={<RateReviewOutlinedIcon />} onClick={() => setComposeOpen(true)}>
          New message
        </Button>
      </Stack>

      <EncryptionGate>
        <Paper variant="outlined" sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          <Box
            sx={{
              width: 300,
              borderRight: 1,
              borderColor: 'divider',
              overflowY: 'auto',
              flexShrink: 0,
            }}
          >
            <ConversationList selectedId={selectedId} onSelect={setSelectedId} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            {selectedId ? (
              <ConversationView
                key={selectedId}
                conversationId={selectedId}
                currentUserId={userId}
                onLeft={() => setSelectedId(null)}
              />
            ) : (
              <Box sx={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">Select a conversation or start a new one</Typography>
              </Box>
            )}
          </Box>
        </Paper>
      </EncryptionGate>

      <NewConversationDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        onCreated={(id) => {
          setComposeOpen(false);
          setSelectedId(id);
        }}
        excludeIds={[userId]}
      />
    </Stack>
  );
}
