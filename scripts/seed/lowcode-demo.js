'use strict';

/**
 * Low-code runtime demo seeder — proves entities / lookups / flows END-TO-END
 * against the new runtime, entirely in-process (no network needed):
 *
 *   app  lcdemo-helpdesk
 *   ├─ entity  agent     (name, email)                         + 2 records
 *   ├─ entity  customer  (name)                                + 2 records
 *   ├─ lookup  priority  STATIC  (low/normal/high)
 *   ├─ lookup  agents    DYNAMIC provider=lowcode.entity(agent)   ← proves dynamic lookups
 *   ├─ entity  ticket    (title, priority=enum:priority,
 *   │                     assignee=enum:agents, customer=reference:customer)
 *   ├─ entity  audit     (message)
 *   ├─ form    ticket-form
 *   └─ flow    ticket-created-audit  on lowcode.record.created
 *              match entity==ticket → create_record(audit)      ← proves native flow action
 *
 * Usage:
 *   node scripts/seed/lowcode-demo.js                 # seed (idempotent)
 *   SEED_LC_RESET=1 node scripts/seed/lowcode-demo.js # delete lcdemo-* rows only
 *   SEED_LC_EMIT=1  node scripts/seed/lowcode-demo.js # also create a ticket → fires the flow
 *
 * Run `npm run db:migrate` first so the lowcode schema exists.
 */

const path = require('path');

require('./prod-guard');

const ROOT = path.resolve(__dirname, '..', '..');
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_seed_dummy';
process.env.LOWCODE_ENABLED = process.env.LOWCODE_ENABLED || 'true';
process.env.PLUGINS_ENABLED = process.env.PLUGINS_ENABLED || 'true';
require('dotenv').config({ path: path.join(ROOT, '.env') });

const db = require('../../services/lowcode/src/models');
const { LcApp, LcLookup, LcEntity, LcRecord, LcForm, LcFlow } = db;
const entityService = require('../../services/lowcode/src/services/entityService');
const flowEngine = require('../../services/lowcode/src/services/flowEngine');

const P = 'lcdemo';

async function reset() {
  const apps = await LcApp.findAll({ where: { key: `${P}-helpdesk` } });
  for (const app of apps) {
    await LcRecord.destroy({ where: { appId: app.id } });
    await LcEntity.destroy({ where: { appId: app.id } });
    await LcLookup.destroy({ where: { appId: app.id } });
    await LcForm.destroy({ where: { appId: app.id } });
    await LcFlow.destroy({ where: { appId: app.id } });
    await app.destroy();
  }
  console.log('Removed lcdemo-* rows.');
}

async function upsertEntity(appId, key, name, fields, extra = {}) {
  const [entity] = await LcEntity.findOrCreate({ where: { appId, key }, defaults: { appId, key, name, fields, ...extra } });
  entity.fields = fields; if (extra.stateMachine !== undefined) entity.stateMachine = extra.stateMachine;
  await entity.save();
  return entity;
}
async function upsertLookup(appId, key, name, values, source = null) {
  const [lk] = await LcLookup.findOrCreate({ where: { appId, key }, defaults: { appId, key, name, values, source } });
  lk.values = values; lk.source = source; await lk.save();
  return lk;
}
/** Idempotent record create keyed by a unique data field. */
async function ensureRecord(entity, data, dedupeField) {
  const existing = await LcRecord.findOne({ where: { entityId: entity.id, [`data.${dedupeField}`]: data[dedupeField] } });
  if (existing) return existing;
  return entityService.createRecord(entity, data, {});
}

async function seed() {
  const [app] = await LcApp.findOrCreate({
    where: { key: `${P}-helpdesk` },
    defaults: { key: `${P}-helpdesk`, name: 'Helpdesk (demo)', description: 'Low-code runtime demo', status: 'published' },
  });

  const agent = await upsertEntity(app.id, 'agent', 'Agent', [
    { key: 'name', label: 'Name', type: 'string', required: true, role: 'dimension' },
    { key: 'email', label: 'Email', type: 'string' },
  ]);
  const customer = await upsertEntity(app.id, 'customer', 'Customer', [
    { key: 'name', label: 'Name', type: 'string', required: true, role: 'dimension' },
  ]);

  // Records first so the dynamic `agents` lookup + customer references resolve.
  const ana = await ensureRecord(agent, { name: 'Ana Ops', email: 'ana@demo.test' }, 'name');
  await ensureRecord(agent, { name: 'Bo Support', email: 'bo@demo.test' }, 'name');
  const acme = await ensureRecord(customer, { name: 'Acme Corp' }, 'name');
  await ensureRecord(customer, { name: 'Globex' }, 'name');

  await upsertLookup(app.id, 'priority', 'Priority', [
    { value: 'low', label: 'Low', color: '#7aa' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High', color: '#c55' },
  ], { type: 'static' });
  await upsertLookup(app.id, 'agents', 'Agents', [], {
    type: 'provider', provider: 'lowcode.entity', params: { entityKey: 'agent', valueField: 'id', labelField: 'name' },
  });

  const ticket = await upsertEntity(app.id, 'ticket', 'Ticket', [
    { key: 'title', label: 'Title', type: 'string', required: true, role: 'dimension' },
    { key: 'priority', label: 'Priority', type: 'enum', enumLookup: 'priority', role: 'dimension' },
    { key: 'assignee', label: 'Assignee', type: 'enum', enumLookup: 'agents', role: 'dimension' },
    { key: 'customer', label: 'Customer', type: 'reference', refEntity: 'customer' },
  ]);
  await upsertEntity(app.id, 'audit', 'Audit', [
    { key: 'message', label: 'Message', type: 'text', required: true },
  ]);

  await LcForm.findOrCreate({
    where: { appId: app.id, key: 'ticket-form' },
    defaults: {
      appId: app.id, entityKey: 'ticket', key: 'ticket-form', name: 'New Ticket',
      layout: { sections: [{ title: 'Details', fields: ['title', 'priority', 'assignee', 'customer'] }], submitLabel: 'Create ticket' },
    },
  });

  await LcFlow.findOrCreate({
    where: { appId: app.id, key: 'ticket-created-audit' },
    defaults: {
      appId: app.id, key: 'ticket-created-audit', name: 'Audit new tickets',
      event: 'lowcode.record.created',
      match: { all: [{ field: 'entity', op: 'equals', value: 'ticket' }] },
      actions: [{ type: 'create_record', entityKey: 'audit', data: { message: 'ticket created' } }],
      scopeType: 'platform', enabled: true,
    },
  });

  console.log(`Seeded app ${app.key}: entities(agent,customer,ticket,audit), lookups(priority=static, agents=dynamic), form, flow.`);

  if (process.env.SEED_LC_EMIT) {
    flowEngine.start(); // subscribe the flow engine to the in-process hook bus
    const before = await LcRecord.count({ where: { entityId: (await LcEntity.findOne({ where: { appId: app.id, key: 'audit' } })).id } });
    // Valid ticket: enum from dynamic lookup (ana.id) + real customer reference (acme.id).
    const t = await entityService.createRecord(ticket, { title: 'Printer down', priority: 'high', assignee: ana.id, customer: acme.id }, {});
    await new Promise((r) => setTimeout(r, 250)); // let the async flow run
    const auditEntity = await LcEntity.findOne({ where: { appId: app.id, key: 'audit' } });
    const after = await LcRecord.count({ where: { entityId: auditEntity.id } });
    console.log(`EMIT: created ticket ${t.id}; audit records ${before} → ${after} (flow ${after > before ? 'FIRED ✓' : 'did not fire'}).`);
    // Prove reference integrity rejects a dangling ref.
    try {
      await entityService.createRecord(ticket, { title: 'bad', customer: '00000000-0000-4000-8000-000000000000' }, {});
      console.log('EMIT: dangling-reference ticket unexpectedly accepted ✗');
    } catch (e) {
      console.log(`EMIT: dangling-reference ticket rejected ✓ (${e.message})`);
    }
  }
}

(async () => {
  try {
    await db.sequelize.authenticate();
    if (process.env.NODE_ENV === 'development') await db.sequelize.sync({ alter: true });
    if (process.env.SEED_LC_RESET) await reset();
    else await seed();
    process.exit(0);
  } catch (err) {
    console.error('lowcode-demo seed failed:', err.message);
    process.exit(1);
  }
})();
