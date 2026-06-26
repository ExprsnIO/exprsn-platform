import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { sparkApi } from '@/api/spark';
import { toMessage } from '@/lib/errors';

/**
 * Open (or create) a direct conversation with a user and navigate to it. The
 * spark backend dedupes direct conversations, so repeated calls reuse the same
 * thread rather than spawning duplicates.
 */
export function useStartConversation(onError?: (msg: string) => void) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  const start = async (userId: string) => {
    setPending(true);
    try {
      const res = await sparkApi.createConversation({ type: 'direct', participantIds: [userId] });
      navigate(`/messages?c=${res.conversation.id}`);
    } catch (err) {
      onError?.(toMessage(err));
    } finally {
      setPending(false);
    }
  };

  return { start, pending };
}
