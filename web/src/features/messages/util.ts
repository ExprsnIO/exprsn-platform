import type { Conversation, Message } from '@/api/spark';

/** Display title for a conversation in the list / header. */
export function conversationTitle(c: Conversation): string {
  if (c.name) return c.name;
  if (c.type === 'group') return 'Group conversation';
  return 'Direct message';
}

/** Short, stable label for a sender we have no display name for. */
export function shortId(userId: string): string {
  return userId.slice(0, 8);
}

/** Avatar initials from a display name or, failing that, a user id. */
export function initials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

/** Sort messages oldest → newest for chat display. */
export function sortByCreated(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
