/**
 * Customer Service tab — demo/operator surface for the guarded CS flows.
 * Left card: the CS chat channel (customer ↔ agent, guardrailed both ways —
 * escalations hand off to a human). Right card: the CS email flow, which
 * drafts a reply into the outbox and shows the guardrail verdict.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Divider,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AddCommentOutlinedIcon from '@mui/icons-material/AddCommentOutlined';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import { cortexApi, type ChatTurnResult, type OutboxDetail } from '@/api/cortex';
import { Card, Loading } from '@/features/admin/ui';
import { relativeTime } from '@/features/timeline/util';
import {
  ChatBubble,
  ChatComposer,
  CortexQueryError,
  GuardrailHitList,
  GuardrailHitsLine,
  MessageStatusChip,
  OutboxStatusChip,
  TypingIndicator,
  collectHits,
} from './shared';

/* ----------------------------------------------------------------- CS chat */

function CsChatCard({ onError }: { onError: (e: unknown) => void }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [lastTurn, setLastTurn] = useState<ChatTurnResult | null>(null);

  // TASK-063: keyset-paged (first page = same default limit as before).
  const chatsQuery = useInfiniteQuery({
    queryKey: ['cortex', 'cs', 'chats'],
    queryFn: ({ pageParam }) => cortexApi.csChats(pageParam ? { cursor: pageParam } : undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const detailQuery = useInfiniteQuery({
    queryKey: ['cortex', 'cs', 'chat', selectedId],
    queryFn: ({ pageParam }) => cortexApi.csChat(selectedId!, pageParam ? { cursor: pageParam } : undefined),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: !!selectedId,
  });

  const turn = useMutation({
    mutationFn: (message: string) => cortexApi.csChatTurn(message, selectedId ?? undefined),
    onMutate: (message) => setPending(message),
    onSuccess: async (res) => {
      setLastTurn(res);
      if (!selectedId) setSelectedId(res.session_id);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['cortex', 'cs', 'chats'] }),
        qc.invalidateQueries({ queryKey: ['cortex', 'cs', 'chat', res.session_id] }),
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

  const chats = useMemo(
    () => (chatsQuery.data?.pages ?? []).flatMap((p) => p.chats),
    [chatsQuery.data],
  );

  return (
    <Card title="CS chat (guarded)">
      <Stack sx={{ height: 440 }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <TextField
            select
            size="small"
            label="Chat"
            value={selectedId ?? ''}
            onChange={(e) => {
              setSelectedId(e.target.value || null);
              setLastTurn(null);
            }}
            sx={{ minWidth: 220 }}
            disabled={!chats.length}
          >
            {chats.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.id.slice(0, 8)} · {c.turns} turn{c.turns === 1 ? '' : 's'} · {relativeTime(c.created)}
              </MenuItem>
            ))}
          </TextField>
          <Button
            size="small"
            startIcon={<AddCommentOutlinedIcon />}
            onClick={() => {
              setSelectedId(null);
              setLastTurn(null);
            }}
          >
            New chat
          </Button>
        </Stack>
        {chatsQuery.hasNextPage && (
          <Box sx={{ mb: 1 }}>
            <Button
              size="small"
              onClick={() => chatsQuery.fetchNextPage()}
              disabled={chatsQuery.isFetchingNextPage}
            >
              {chatsQuery.isFetchingNextPage ? 'Loading…' : 'Load more chats'}
            </Button>
          </Box>
        )}
        <Divider />

        <Box sx={{ flex: 1, overflowY: 'auto', py: 1.5 }}>
          {chatsQuery.isError ? (
            <CortexQueryError error={chatsQuery.error} />
          ) : selectedId && detailQuery.isLoading ? (
            <Loading size={22} />
          ) : selectedId && detailQuery.isError ? (
            <CortexQueryError error={detailQuery.error} />
          ) : (
            <Stack spacing={1.5}>
              {!selectedId && !pending && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', pt: 4 }}>
                  Write as the customer — replies are drafted by the CS agent behind guardrails.
                </Typography>
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
                const mine = m.role === 'customer';
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

        <Divider />
        <ChatComposer
          onSend={(t) => turn.mutate(t)}
          disabled={turn.isPending}
          placeholder="Write as the customer… (Enter to send)"
        />
      </Stack>
    </Card>
  );
}

/* ---------------------------------------------------------------- CS email */

function CsEmailCard({ onError }: { onError: (e: unknown) => void }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<OutboxDetail | null>(null);

  const send = useMutation({
    mutationFn: () => cortexApi.csEmail(from.trim(), subject.trim(), body.trim()),
    onSuccess: (res) => {
      setResult(res);
      qc.invalidateQueries({ queryKey: ['cortex', 'outbox'] });
    },
    onError,
  });

  const hits = collectHits(result?.guardrails);

  return (
    <Card title="CS email (guarded)">
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">
          Submit an inbound customer email — the agent drafts a reply into the outbox, gated by the
          email guardrails.
        </Typography>
        <TextField
          size="small"
          type="email"
          label="From"
          placeholder="customer@example.com"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <TextField
          size="small"
          label="Subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <TextField
          label="Body"
          multiline
          minRows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Box>
          <Button
            variant="contained"
            startIcon={<SendOutlinedIcon />}
            disabled={!from.trim() || !subject.trim() || !body.trim() || send.isPending}
            onClick={() => send.mutate()}
          >
            {send.isPending ? 'Drafting reply…' : 'Send email'}
          </Button>
        </Box>

        {result && (
          <Stack spacing={1} sx={{ borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="subtitle2">Drafted reply</Typography>
              <OutboxStatusChip status={result.status} />
            </Stack>
            <Typography variant="caption" color="text.secondary">
              To {result.toAddress} · {result.subject}
            </Typography>
            {result.body ? (
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: 'action.hover',
                  fontSize: 14,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {result.body}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No reply body {result.status === 'blocked' ? '— the draft was blocked' : 'yet'}.
              </Typography>
            )}
            {hits.length > 0 && (
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Guardrail hits
                </Typography>
                <GuardrailHitList hits={hits} />
              </Box>
            )}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

export function CustomerServiceTab({ onError }: { onError: (e: unknown) => void }) {
  return (
    <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} alignItems="stretch">
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <CsChatCard onError={onError} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <CsEmailCard onError={onError} />
      </Box>
    </Stack>
  );
}
