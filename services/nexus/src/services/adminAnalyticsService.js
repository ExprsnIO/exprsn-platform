/**
 * Admin Analytics Service
 *
 * Read-only aggregate queries powering the admin-console analytics screens
 * (platform totals + growth, per-group stats). All timestamps in nexus are
 * BIGINT epoch-milliseconds (created_at via Date.now()), so growth buckets are
 * computed by converting created_at to a date in SQL:
 *   to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD').
 */

const { Op, fn, col, literal } = require('sequelize');
const {
  Group,
  GroupMembership,
  Event,
  Proposal,
  GroupContentFlag
} = require('../models');

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DAYS = 365;

/**
 * Resolve a period/days query into a normalized window.
 * @param {Object} query - { period?: '7d'|'30d'|'90d', days?: number }
 * @returns {{ days: number, period: string, since: number }}
 */
function resolvePeriod(query = {}) {
  let days;

  if (query.days != null && query.days !== '') {
    days = parseInt(query.days, 10);
  } else if (typeof query.period === 'string') {
    const m = query.period.match(/^(\d+)d$/);
    days = m ? parseInt(m[1], 10) : NaN;
  }

  if (!Number.isFinite(days) || days <= 0) {
    days = 30;
  }
  days = Math.min(days, MAX_DAYS);

  return {
    days,
    period: `${days}d`,
    since: Date.now() - days * DAY_MS
  };
}

// SQL expression bucketing the BIGINT-ms created_at into a YYYY-MM-DD date.
const DAY_BUCKET = "to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD')";

/**
 * Daily new-row counts for a model since a timestamp.
 * @param {import('sequelize').ModelStatic} model
 * @param {number} since - epoch ms lower bound (inclusive)
 * @param {Object} [where] - extra where conditions
 * @returns {Promise<Map<string, number>>} date -> count
 */
async function dailyCounts(model, since, where = {}) {
  const rows = await model.findAll({
    attributes: [
      [literal(DAY_BUCKET), 'date'],
      [fn('COUNT', col('id')), 'count']
    ],
    where: { created_at: { [Op.gte]: since }, ...where },
    group: [literal(DAY_BUCKET)],
    order: [literal('1 ASC')],
    raw: true
  });

  const map = new Map();
  for (const r of rows) {
    map.set(r.date, parseInt(r.count, 10));
  }
  return map;
}

/**
 * Build a dense daily series (no gaps) from one or more count maps.
 * @param {number} since - epoch ms window start
 * @param {number} days
 * @param {Object<string, Map<string, number>>} seriesMaps - key -> (date -> count)
 * @returns {Array<Object>} [{ date, <key>: n, ... }]
 */
function buildSeries(since, days, seriesMaps) {
  const keys = Object.keys(seriesMaps);
  const out = [];
  // Start from the day containing `since`, in UTC, to match the SQL bucket.
  const start = new Date(since);
  start.setUTCHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * DAY_MS);
    const date = d.toISOString().slice(0, 10);
    const point = { date };
    for (const k of keys) {
      point[k] = seriesMaps[k].get(date) || 0;
    }
    out.push(point);
  }
  return out;
}

function sumMap(map) {
  let total = 0;
  for (const v of map.values()) total += v;
  return total;
}

/**
 * Platform-wide totals plus a daily growth series for the window.
 * @param {Object} query - period/days query params
 */
async function getPlatformStats(query = {}) {
  const { days, period, since } = resolvePeriod(query);

  const [
    totalGroups,
    activeGroups,
    totalMembers,
    totalEvents,
    activeProposals
  ] = await Promise.all([
    Group.count(),
    Group.count({ where: { isActive: true } }),
    GroupMembership.count(),
    Event.count(),
    Proposal.count({ where: { status: 'active' } })
  ]);

  const [groupGrowth, memberGrowth, eventGrowth] = await Promise.all([
    dailyCounts(Group, since),
    dailyCounts(GroupMembership, since),
    dailyCounts(Event, since)
  ]);

  const series = buildSeries(since, days, {
    groups: groupGrowth,
    members: memberGrowth,
    events: eventGrowth
  });

  return {
    totals: {
      groups: totalGroups,
      activeGroups,
      members: totalMembers,
      events: totalEvents,
      activeProposals
    },
    growth: {
      period,
      days,
      since,
      newGroups: sumMap(groupGrowth),
      newMembers: sumMap(memberGrowth),
      newEvents: sumMap(eventGrowth),
      series
    }
  };
}

/**
 * Per-group totals, member growth series, and recent-activity counts.
 * @param {string} groupId
 * @param {Object} query - period/days query params
 */
async function getGroupStats(groupId, query = {}) {
  const { days, period, since } = resolvePeriod(query);
  const groupWhere = { group_id: groupId };

  const [
    memberCount,
    activeMemberCount,
    eventCount,
    proposalCount,
    activeProposals,
    flagCount,
    pendingFlags
  ] = await Promise.all([
    GroupMembership.count({ where: { groupId } }),
    GroupMembership.count({ where: { groupId, status: 'active' } }),
    Event.count({ where: { groupId } }),
    Proposal.count({ where: { groupId } }),
    Proposal.count({ where: { groupId, status: 'active' } }),
    GroupContentFlag.count({ where: { groupId } }),
    GroupContentFlag.count({ where: { groupId, status: 'pending' } })
  ]);

  const [memberGrowth, eventGrowth, flagGrowth] = await Promise.all([
    dailyCounts(GroupMembership, since, groupWhere),
    dailyCounts(Event, since, groupWhere),
    dailyCounts(GroupContentFlag, since, groupWhere)
  ]);

  const series = buildSeries(since, days, {
    members: memberGrowth,
    events: eventGrowth,
    flags: flagGrowth
  });

  return {
    groupId,
    totals: {
      members: memberCount,
      activeMembers: activeMemberCount,
      events: eventCount,
      proposals: proposalCount,
      activeProposals,
      flags: flagCount,
      pendingFlags
    },
    growth: {
      period,
      days,
      since,
      newMembers: sumMap(memberGrowth),
      newEvents: sumMap(eventGrowth),
      series
    },
    activity: {
      recentMembers: sumMap(memberGrowth),
      recentEvents: sumMap(eventGrowth),
      recentFlags: sumMap(flagGrowth)
    }
  };
}

module.exports = {
  resolvePeriod,
  getPlatformStats,
  getGroupStats
};
