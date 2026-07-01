/**
 * ═══════════════════════════════════════════════════════════
 * Notification persistence (Redis)
 * ═══════════════════════════════════════════════════════════
 *
 * Notifications were previously emit-and-forget — lost on reload. This backs
 * the moderator notification hub with a small per-user Redis store so the bell,
 * unread count, and history survive reconnects.
 *
 * Per user:
 *   notif:z:{userId}  ZSET   score = createdAt(ms), member = id   (ordering + cap)
 *   notif:h:{userId}  HASH   id → JSON(notification incl. `read`) (payloads)
 *
 * Capped to MAX newest; both keys carry a sliding TTL so idle users self-clean.
 */

const Redis = require('ioredis');
const { logger } = require('@exprsn/shared');

const MAX = 200;
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

let client;
function redis() {
  if (!client) {
    client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      maxRetriesPerRequest: 2,
      enableOfflineQueue: true
    });
    client.on('error', (e) => logger.warn('notifications redis error', { error: e.message }));
  }
  return client;
}

const zKey = (u) => `notif:z:${u}`;
const hKey = (u) => `notif:h:${u}`;

/** Persist one notification for its recipient; enforces the per-user cap + TTL. */
async function persist(n) {
  const r = redis();
  const ts = new Date(n.createdAt).getTime() || Date.now();
  await r
    .pipeline()
    .zadd(zKey(n.userId), ts, n.id)
    .hset(hKey(n.userId), n.id, JSON.stringify(n))
    .expire(zKey(n.userId), TTL_SECONDS)
    .expire(hKey(n.userId), TTL_SECONDS)
    .exec();

  // Trim oldest beyond the cap.
  const count = await r.zcard(zKey(n.userId));
  if (count > MAX) {
    const old = await r.zrange(zKey(n.userId), 0, count - MAX - 1);
    if (old.length) {
      await r.pipeline().zrem(zKey(n.userId), ...old).hdel(hKey(n.userId), ...old).exec();
    }
  }
}

/** Newest-first notifications for a user + unread count. */
async function list(userId, { limit = 100 } = {}) {
  const r = redis();
  const ids = await r.zrevrange(zKey(userId), 0, Math.max(0, limit - 1));
  if (!ids.length) return { notifications: [], unreadCount: 0 };
  const vals = await r.hmget(hKey(userId), ...ids);
  const notifications = vals
    .map((v) => {
      try {
        return v ? JSON.parse(v) : null;
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
  const unreadCount = notifications.reduce((a, n) => a + (n.read ? 0 : 1), 0);
  return { notifications, unreadCount };
}

async function unreadCount(userId) {
  const { unreadCount } = await list(userId, { limit: MAX });
  return unreadCount;
}

/** Set the read flag on one notification. Returns false if it no longer exists. */
async function setRead(userId, id, read = true) {
  const r = redis();
  const v = await r.hget(hKey(userId), id);
  if (!v) return false;
  let n;
  try {
    n = JSON.parse(v);
  } catch (_) {
    return false;
  }
  n.read = read;
  await r.hset(hKey(userId), id, JSON.stringify(n));
  return true;
}

/** Mark every notification read; returns how many changed. */
async function markAllRead(userId) {
  const r = redis();
  const all = await r.hgetall(hKey(userId));
  const entries = Object.entries(all);
  if (!entries.length) return 0;
  const p = r.pipeline();
  let changed = 0;
  for (const [id, v] of entries) {
    let n;
    try {
      n = JSON.parse(v);
    } catch (_) {
      continue;
    }
    if (!n.read) {
      n.read = true;
      changed++;
      p.hset(hKey(userId), id, JSON.stringify(n));
    }
  }
  if (changed) await p.exec();
  return changed;
}

async function remove(userId, id) {
  await redis().pipeline().zrem(zKey(userId), id).hdel(hKey(userId), id).exec();
}

async function clear(userId) {
  await redis().del(zKey(userId), hKey(userId));
}

module.exports = { persist, list, unreadCount, setRead, markAllRead, remove, clear };
