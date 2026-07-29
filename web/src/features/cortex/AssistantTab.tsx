/**
 * Assistant tab — two-pane chat against the owner-facing assistant channel
 * (full tool access + selected skills). Left: session list; right: the active
 * conversation with model/skills pickers above the composer.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemText,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import { cortexApi, type ChatTurnResult } from '@/api/cortex';
import { Loading } from '@/features/admin/ui';
import { relativeTime } from '@/features/timeline/util';
import {
  ChatBubble,
  ChatComposer,
  CortexQueryError,
  GuardrailHitsLine,
  MessageStatusChip,
  ModelSelect,
  MultiSelect,
  TypingIndicator,
  useSkills,
} from './shared';

export function AssistantTab({ onError }: { onError: (e: unknown) => void }) {
  const qc = useQueryClient();
  // null = composing a brand-new chat (no session yet).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [model, setModel] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  // The message currently in flight (rendered optimistically) and the last
  // turn result (carries the guardrail verdict, which session detail doesn't).
  const [pending, setPending] = useState<string | null>(null);
  const [lastTurn, setLastTurn] = useState<ChatTurnResult | null>(null);

  // TASK-063: keyset-paged session list — first page is the exact same
  // default-limit call as before, "Load more" walks the cursor forward.
  const sessionsQuery = useInfiniteQuery({
    queryKey: ['cortex', 'chat', 'sessions'],
    queryFn: ({ pageParam }) => cortexApi.chatSessions(pageParam ? { cursor: pageParam } : undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  // TASK-063: message history is keyset-paged too (default limit unchanged
  // behavior-wise for any conversation under the 200-message page size).
  const detailQuery = useInfiniteQuery({
    queryKey: ['cortex', 'chat', 'session', selectedId],
    queryFn: ({ pageParam }) => cortexApi.chatSession(selectedId!, pageParam ? { cursor: pageParam } : undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!selectedId,
  });
  const skillsQuery = useSkills();
  const enabledSkills = useMemo(
    () => (skillsQuery.data?.skills ?? []).filter((s) => s.enabled).map((s) => s.name),
    [skillsQuery.data],
  );

  const turn = useMutation({
    mutationFn: (message: string) =>
      cortexApi.chatTurn(message, {
        ...(selectedId && { session_id: selectedId }),
        ...(model && { model }),
        ...(skills.length && { skills }),
      }),
    onMutate: (message) => setPending(message),
    onSuccess: async (res) => {
      setLastTurn(res);
      if (!selectedId) setSelectedId(res.session_id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['cortex', 'chat', 'sessions'] }),
        qc.invalidateQueries({ queryKey: ['cortex', 'chat', 'session', res.session_id] }),
      ]);
    },
    onError,
    onSettled: () => setPending(null),
  });

  const messages = useMemo(() => {
    const list = (detailQuery.data?.pages ?? []).flatMap((p) => p.messages);
    return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [detailQuery.data]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, pending]);

  const sessions = useMemo(
    () => (sessionsQuery.data?.pages ?? []).flatMap((p) => p.sessions),
    [sessionsQuery.data],
  );

  return (
    <Paper variant="outlined" sx={{ display: 'flex', overflow: 'hidden', height: 'calc(100vh - 280px)', minHeight: 440 }}>
      {/* session list */}
      <Box sx={{ width: 300, flexShrink: 0, borderRight: 1, borderColor: 'divider', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 1 }}>
          <Button
            fullWidth
            size="small"
            variant="contained"
            startIcon={<AddCommentOutlinedIcon />}
            onClick={() => {
              setSelectedId(null);
              setLastTurn(null);
            }}
          >
            New chat
          </Button>
        </Box>
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {sessionsQuery.isLoading ? (
            <Loading size={22} />
          ) : sessionsQuery.isError ? (
            <Box sx={{ p: 1.5 }}>
              <CortexQueryError error={sessionsQuery.error} />
            </Box>
          ) : sessions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No chats yet — start one.
            </Typography>
          ) : (
            <List disablePadding dense>
              {sessions.map((s) => (
                <ListItemButton
                  key={s.id}
                  selected={s.id === selectedId}
                  onClick={() => {
                    setSelectedId(s.id);
                    setLastTurn(null);
                  }}
                  alignItems="flex-start"
                >
                  <ListItemText
                    primary={s.preview || 'Untitled chat'}
                    secondary={`${s.turns} turn${s.turns === 1 ? '' : 's'}${s.model ? ` · ${s.model}` : ''}`}
                    primaryTypographyProps={{ noWrap: true, fontSize: 14 }}
                    secondaryTypographyProps={{ noWrap: true }}
                  />
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1, whiteSpace: 'nowrap' }}>
                    {relativeTime(s.created)}
                  </Typography>
                </ListItemButton>
              ))}
            </List>
          )}
          {sessionsQuery.hasNextPage && (
            <Box sx={{ p: 1, textAlign: 'center' }}>
              <Button
                size="small"
                onClick={() => sessionsQuery.fetchNextPage()}
                disabled={sessionsQuery.isFetchingNextPage}
              >
                {sessionsQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </Button>
            </Box>
          )}
        </Box>
      </Box>

      {/* conversation */}
      <Stack sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ flex: 1, overflowY: 'auto', p: 1.5 }}>
          {selectedId && detailQuery.isLoading ? (
            <Loading />
          ) : selectedId && detailQuery.isError ? (
            <CortexQueryError error={detailQuery.error} />
          ) : (
            <Stack spacing={1.5}>
              {!selectedId && !pending && (
                <Box sx={{ display: 'flex', height: '100%', minHeight: 200, alignItems: 'center', justifyContent: 'center' }}>
                  <Typography color="text.secondary">
                    Ask the assistant anything — pick a model and skills below.
                  </Typography>
                </Box>
              )}
              {detailQuery.hasNextPage && (
                <Box sx={{ textAlign: 'center' }}>
                  <Button
                    size="small"
                    onClick={() => detailQuery.fetchNextPage()}
                    disabled={detailQuery.isFetchingNextPage}
                  >
                    {detailQuery.isFetchingNextPage ? 'Loading…' : 'Load more messages'}
                  </Button>
                </Box>
              )}
              {messages.map((m, i) => {
                const mine = m.role === 'user';
                const isLastReply = !mine && i === messages.length - 1;
                return (
                  <ChatBubble
                    key={m.id}
                    mine={mine}
                    footer={
                      !mine && (m.status !== 'sent' || (isLastReply && lastTurn)) ? (
                        <Stack spacing={0.5} alignItems="flex-start">
                          <MessageStatusChip status={m.status} />
                          {isLastReply && lastTurn?.session_id === selectedId && (
                            <GuardrailHitsLine guardrails={lastTurn.guardrails} />
                          )}
                        </Stack>
                      ) : undefined
                    }
                  >
                    {m.content}
                  </ChatBubble>
                );
              })}
              {pending && <ChatBubble mine>{pending}</ChatBubble>}
              {turn.isPending && <TypingIndicator />}
              <div ref={bottomRef} />
            </Stack>
          )}
        </Box>

        <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
          <Stack direction="row" spacing={1} sx={{ px: 1, pt: 1 }}>
            <ModelSelect value={model} onChange={setModel} sx={{ minWidth: 200 }} />
            <MultiSelect
              label="Skills"
              options={enabledSkills}
              value={skills}
              onChange={setSkills}
              sx={{ minWidth: 200, maxWidth: 320 }}
            />
          </Stack>
          <ChatComposer
            onSend={(t) => turn.mutate(t)}
            disabled={turn.isPending}
            placeholder="Message the assistant… (Enter to send)"
          />
        </Box>
      </Stack>
    </Paper>
  );
}
