'use strict';

const {
  PolicyError,
  assertAllowed,
  assertConfirmed,
  assertNotProtected,
  levelForMethod,
} = require('./policy');

// ---------------------------------------------------------------------------
// Compact projections — the raw API objects are huge; the model rarely needs
// more than this. Tools accept `raw: true` to get the full payload.
// ---------------------------------------------------------------------------

function summarizeDroplet(d) {
  const nets = (d.networks && d.networks.v4) || [];
  return {
    id: d.id,
    name: d.name,
    status: d.status,
    region: d.region && d.region.slug,
    size: d.size_slug,
    image: d.image && (d.image.slug || d.image.name),
    public_ipv4: (nets.find((n) => n.type === 'public') || {}).ip_address || null,
    private_ipv4: (nets.find((n) => n.type === 'private') || {}).ip_address || null,
    vpc_uuid: d.vpc_uuid,
    tags: d.tags,
    created_at: d.created_at,
  };
}

const pick = (keys) => (o) => Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]));

const project = {
  droplets: summarizeDroplet,
  regions: pick(['slug', 'name', 'available', 'features']),
  sizes: pick(['slug', 'vcpus', 'memory', 'disk', 'price_monthly', 'price_hourly', 'available', 'regions']),
  images: pick(['id', 'slug', 'name', 'distribution', 'type', 'public', 'regions', 'min_disk_size']),
  ssh_keys: pick(['id', 'name', 'fingerprint']),
  domains: pick(['name', 'ttl']),
  domain_records: pick(['id', 'type', 'name', 'data', 'ttl', 'priority']),
  firewalls: (f) => ({
    id: f.id, name: f.name, status: f.status, droplet_ids: f.droplet_ids, tags: f.tags,
    inbound: (f.inbound_rules || []).map((r) => `${r.protocol}/${r.ports}`),
  }),
  volumes: pick(['id', 'name', 'size_gigabytes', 'region', 'droplet_ids', 'tags']),
  databases: (d) => ({
    id: d.id, name: d.name, engine: d.engine, version: d.version, status: d.status,
    region: d.region, size: d.size, num_nodes: d.num_nodes, tags: d.tags,
  }),
  apps: (a) => ({
    id: a.id, name: a.spec && a.spec.name, live_url: a.live_url, region: a.region && a.region.slug,
    active_deployment: a.active_deployment && { id: a.active_deployment.id, phase: a.active_deployment.phase },
    updated_at: a.updated_at,
  }),
  kubernetes_clusters: (k) => ({
    id: k.id, name: k.name, region: k.region, version: k.version, status: k.status && k.status.state,
    node_pools: (k.node_pools || []).map((p) => ({ name: p.name, size: p.size, count: p.count })),
  }),
  load_balancers: (l) => ({
    id: l.id, name: l.name, ip: l.ip, status: l.status, region: l.region && l.region.slug,
    droplet_ids: l.droplet_ids, tag: l.tag,
  }),
  projects: pick(['id', 'name', 'purpose', 'environment', 'is_default']),
  tags: (t) => ({ name: t.name, count: t.resources && t.resources.count }),
};

function listTool({ name, path, key, description, filters = {}, query }) {
  return {
    name,
    level: 'read',
    description,
    inputSchema: {
      type: 'object',
      properties: {
        ...filters,
        raw: { type: 'boolean', description: 'Return full API objects instead of compact summaries.' },
        max_pages: { type: 'integer', minimum: 1, maximum: 50, description: 'Page cap (200 items/page). Default 10.' },
      },
      additionalProperties: false,
    },
    async handler(args, { client }) {
      const q = query ? query(args) : {};
      const { items, total, truncated } = await client.list(path, key, { query: q, maxPages: args.max_pages || 10 });
      const shaped = args.raw || !project[key] ? items : items.map(project[key]);
      return { total, returned: shaped.length, truncated, [key]: shaped };
    },
  };
}

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const DRY_RUN = { type: 'boolean', description: 'Validate and return the request that would be sent, without sending it.' };
const CONFIRM = (what) => str(`Must exactly equal ${what}. Only set this after the user explicitly approved the action.`);

async function getDroplet(client, id) {
  const { data } = await client.get(`/droplets/${encodeURIComponent(id)}`);
  return data.droplet;
}

function dryRunResult(method, path, body) {
  return { dry_run: true, would_send: { method, path, body } };
}

// Droplet action types, grouped by blast radius.
const DROPLET_WRITE_ACTIONS = [
  'power_on', 'power_off', 'shutdown', 'reboot', 'power_cycle', 'snapshot', 'resize',
  'enable_backups', 'disable_backups', 'enable_ipv6', 'rename', 'password_reset',
];
const DROPLET_DESTROY_ACTIONS = ['rebuild', 'restore'];
const DROPLET_DISRUPTIVE = new Set(['power_off', 'shutdown', 'reboot', 'power_cycle', 'resize', 'password_reset', 'rename']);

const tools = [
  // -------------------------------------------------------------- account
  {
    name: 'do_account',
    level: 'read',
    description: 'Show the authenticated DigitalOcean account (email, team, droplet limit, status), the balance, and the current server safety mode.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    async handler(_args, { client, policy }) {
      const [{ data: acct }, balance] = await Promise.all([
        client.get('/account'),
        client.get('/customers/my/balance').then((r) => r.data).catch((e) => ({ error: e.message })),
      ]);
      return {
        account: acct.account,
        balance,
        server: { mode: policy.mode, protected_tag: policy.protectedTag || null },
        rate_limit: client.lastRateLimit,
      };
    },
  },
  {
    name: 'do_inventory',
    level: 'read',
    description: 'One-shot overview of the account: counts plus compact lists of droplets, apps, databases, k8s clusters, load balancers, volumes, domains and firewalls. Start here when orienting.',
    inputSchema: { type: 'object', properties: { tag_name: str('Only include droplets with this tag.') }, additionalProperties: false },
    async handler(args, { client }) {
      const sections = {
        droplets: ['/droplets', args.tag_name ? { tag_name: args.tag_name } : {}],
        apps: ['/apps', {}],
        databases: ['/databases', {}],
        kubernetes_clusters: ['/kubernetes/clusters', {}],
        load_balancers: ['/load_balancers', {}],
        volumes: ['/volumes', {}],
        domains: ['/domains', {}],
        firewalls: ['/firewalls', {}],
      };
      const out = {};
      await Promise.all(Object.entries(sections).map(async ([key, [path, query]]) => {
        try {
          const { items, total } = await client.list(path, key, { query, maxPages: 5 });
          out[key] = { total, items: items.map(project[key]) };
        } catch (e) {
          out[key] = { error: e.message };
        }
      }));
      return out;
    },
  },

  // -------------------------------------------------------------- catalog
  listTool({
    name: 'do_list_regions', path: '/regions', key: 'regions',
    description: 'List DigitalOcean regions (slug, availability, features).',
  }),
  listTool({
    name: 'do_list_sizes', path: '/sizes', key: 'sizes',
    description: 'List droplet sizes with vCPU/memory/disk/price and the regions each is available in.',
  }),
  listTool({
    name: 'do_list_images', path: '/images', key: 'images',
    description: 'List images. Use type=distribution for base OS images, type=application for 1-click apps, private=true for your snapshots/custom images.',
    filters: {
      type: str('distribution | application', { enum: ['distribution', 'application'] }),
      private: { type: 'boolean', description: 'Only your own images/snapshots.' },
    },
    query: (a) => ({ type: a.type, private: a.private }),
  }),
  listTool({
    name: 'do_list_ssh_keys', path: '/account/keys', key: 'ssh_keys',
    description: 'List SSH keys registered on the account (ids/fingerprints are needed for do_create_droplet).',
  }),
  listTool({
    name: 'do_list_projects', path: '/projects', key: 'projects',
    description: 'List projects.',
  }),
  listTool({
    name: 'do_list_tags', path: '/tags', key: 'tags',
    description: 'List tags and how many resources carry each.',
  }),

  // -------------------------------------------------------------- droplets
  listTool({
    name: 'do_list_droplets', path: '/droplets', key: 'droplets',
    description: 'List droplets (compact: id, name, status, region, size, IPs, tags). Filter by tag_name or exact name.',
    filters: { tag_name: str('Only droplets with this tag.'), name: str('Exact droplet name.') },
    query: (a) => ({ tag_name: a.tag_name, name: a.name }),
  }),
  {
    name: 'do_get_droplet',
    level: 'read',
    description: 'Get one droplet by id.',
    inputSchema: {
      type: 'object',
      properties: { droplet_id: int('Droplet id.'), raw: { type: 'boolean' } },
      required: ['droplet_id'],
      additionalProperties: false,
    },
    async handler(args, { client }) {
      const d = await getDroplet(client, args.droplet_id);
      return args.raw ? d : summarizeDroplet(d);
    },
  },
  {
    name: 'do_create_droplet',
    level: 'write',
    description: 'Create a droplet. Look up valid region/size/image slugs and ssh key ids first. Supports cloud-init via user_data. Use dry_run first to show the user the exact request. Returns the droplet and the create action id — follow with do_wait_for_action.',
    inputSchema: {
      type: 'object',
      properties: {
        name: str('Hostname (letters, digits, dots, dashes).'),
        region: str('Region slug, e.g. nyc3.'),
        size: str('Size slug, e.g. s-2vcpu-4gb.'),
        image: str('Image slug or numeric id, e.g. ubuntu-24-04-x64.'),
        ssh_keys: { type: 'array', items: { type: ['string', 'integer'] }, description: 'SSH key ids or fingerprints.' },
        tags: { type: 'array', items: { type: 'string' } },
        user_data: str('cloud-init user-data (max 64 KiB).'),
        vpc_uuid: str('VPC to place the droplet in (defaults to the region default VPC).'),
        monitoring: { type: 'boolean', description: 'Install the metrics agent. Default true.' },
        backups: { type: 'boolean' },
        ipv6: { type: 'boolean' },
        dry_run: DRY_RUN,
      },
      required: ['name', 'region', 'size', 'image'],
      additionalProperties: false,
    },
    async handler(args, { client }) {
      if (args.user_data && Buffer.byteLength(args.user_data) > 64 * 1024) {
        throw new PolicyError('user_data exceeds the 64 KiB DigitalOcean limit.');
      }
      const body = {
        name: args.name,
        region: args.region,
        size: args.size,
        image: /^\d+$/.test(String(args.image)) ? Number(args.image) : args.image,
        ssh_keys: args.ssh_keys,
        tags: args.tags,
        user_data: args.user_data,
        vpc_uuid: args.vpc_uuid,
        monitoring: args.monitoring !== false,
        backups: args.backups,
        ipv6: args.ipv6,
      };
      for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
      if (args.dry_run) return dryRunResult('POST', '/droplets', body);
      const { data } = await client.request('POST', '/droplets', { body });
      const actions = (data.links && data.links.actions) || [];
      return { droplet: summarizeDroplet(data.droplet), action_ids: actions.map((a) => a.id) };
    },
  },
  {
    name: 'do_droplet_action',
    level: 'write',
    description: `Run a droplet action. Write-level types: ${DROPLET_WRITE_ACTIONS.join(', ')}. ` +
      `Disk-wiping types (${DROPLET_DESTROY_ACTIONS.join(', ')}) need full mode and confirm=<droplet name>. ` +
      'Disruptive actions (power_off, reboot, resize, …) are refused on droplets carrying the protected tag. ' +
      'Returns the action — follow with do_wait_for_action.',
    inputSchema: {
      type: 'object',
      properties: {
        droplet_id: int('Droplet id.'),
        type: str('Action type.', { enum: [...DROPLET_WRITE_ACTIONS, ...DROPLET_DESTROY_ACTIONS] }),
        params: {
          type: 'object',
          description: 'Extra action fields, e.g. {"size":"s-4vcpu-8gb","disk":false} for resize, {"name":"snap-1"} for snapshot/rename, {"image":"ubuntu-24-04-x64"} for rebuild, {"image":123} for restore.',
        },
        confirm: CONFIRM('the droplet name (required for rebuild/restore)'),
        dry_run: DRY_RUN,
      },
      required: ['droplet_id', 'type'],
      additionalProperties: false,
    },
    async handler(args, { client, policy }) {
      const destroy = DROPLET_DESTROY_ACTIONS.includes(args.type);
      if (destroy) assertAllowed(policy, 'destroy', `do_droplet_action(${args.type})`);
      const droplet = await getDroplet(client, args.droplet_id);
      if (destroy || DROPLET_DISRUPTIVE.has(args.type)) {
        assertNotProtected(policy, droplet, `${args.type} droplet`);
      }
      if (destroy) assertConfirmed(droplet.name, args.confirm, `${args.type} droplet ${droplet.name}`);
      const path = `/droplets/${encodeURIComponent(args.droplet_id)}/actions`;
      const body = { type: args.type, ...(args.params || {}) };
      if (args.dry_run) return { ...dryRunResult('POST', path, body), droplet: summarizeDroplet(droplet) };
      const { data } = await client.request('POST', path, { body });
      return data;
    },
  },
  {
    name: 'do_delete_droplet',
    level: 'destroy',
    description: 'Permanently delete a droplet. Requires full mode, confirm=<exact droplet name>, and the droplet must not carry the protected tag. Show the user what will be destroyed and get explicit approval first.',
    inputSchema: {
      type: 'object',
      properties: { droplet_id: int('Droplet id.'), confirm: CONFIRM('the droplet name'), dry_run: DRY_RUN },
      required: ['droplet_id', 'confirm'],
      additionalProperties: false,
    },
    async handler(args, { client, policy }) {
      const droplet = await getDroplet(client, args.droplet_id);
      assertNotProtected(policy, droplet, 'delete droplet');
      assertConfirmed(droplet.name, args.confirm, `delete droplet ${droplet.name}`);
      const path = `/droplets/${encodeURIComponent(args.droplet_id)}`;
      if (args.dry_run) return { ...dryRunResult('DELETE', path), droplet: summarizeDroplet(droplet) };
      await client.request('DELETE', path);
      return { deleted: true, droplet: summarizeDroplet(droplet) };
    },
  },

  // -------------------------------------------------------------- actions
  {
    name: 'do_get_action',
    level: 'read',
    description: 'Get the status of an action (in-progress | completed | errored).',
    inputSchema: {
      type: 'object', properties: { action_id: int('Action id.') }, required: ['action_id'], additionalProperties: false,
    },
    async handler(args, { client }) {
      const { data } = await client.get(`/actions/${encodeURIComponent(args.action_id)}`);
      return data.action;
    },
  },
  {
    name: 'do_wait_for_action',
    level: 'read',
    description: 'Poll an action until it is completed or errored (or the timeout passes). Use after create/power/resize/snapshot.',
    inputSchema: {
      type: 'object',
      properties: {
        action_id: int('Action id.'),
        timeout_seconds: int('Give up after this long. Default 300, max 900.', { minimum: 5, maximum: 900 }),
        interval_seconds: int('Poll interval. Default 5.', { minimum: 1, maximum: 60 }),
      },
      required: ['action_id'],
      additionalProperties: false,
    },
    async handler(args, { client, sleep }) {
      const deadline = Date.now() + (args.timeout_seconds || 300) * 1000;
      const interval = (args.interval_seconds || 5) * 1000;
      for (;;) {
        const { data } = await client.get(`/actions/${encodeURIComponent(args.action_id)}`);
        const action = data.action;
        if (action.status !== 'in-progress') return { done: true, action };
        if (Date.now() + interval > deadline) return { done: false, timed_out: true, action };
        await sleep(interval);
      }
    },
  },

  // -------------------------------------------------------------- networking
  listTool({
    name: 'do_list_domains', path: '/domains', key: 'domains',
    description: 'List DNS domains managed by DigitalOcean.',
  }),
  {
    name: 'do_list_domain_records',
    level: 'read',
    description: 'List DNS records for a domain. Filter by type (A, AAAA, CNAME, MX, TXT, …) and/or fully-qualified name.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: str('Domain, e.g. example.com.'),
        type: str('Record type.'),
        name: str('Fully-qualified record name, e.g. api.example.com.'),
        raw: { type: 'boolean' },
      },
      required: ['domain'],
      additionalProperties: false,
    },
    async handler(args, { client }) {
      const { items, total, truncated } = await client.list(
        `/domains/${encodeURIComponent(args.domain)}/records`, 'domain_records',
        { query: { type: args.type, name: args.name } }
      );
      return { total, truncated, domain_records: args.raw ? items : items.map(project.domain_records) };
    },
  },
  {
    name: 'do_upsert_domain_record',
    level: 'write',
    description: 'Create a DNS record, or update it in place when record_id is given. Use name "@" for the apex and a relative name (e.g. "api") otherwise.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: str('Domain, e.g. example.com.'),
        record_id: int('Existing record id to update. Omit to create.'),
        type: str('A | AAAA | CNAME | MX | TXT | NS | SRV | CAA'),
        name: str('Relative record name, "@" for apex.'),
        data: str('Record value (IP, hostname, text…).'),
        ttl: int('TTL seconds (min 30). Default 1800.'),
        priority: int('MX/SRV priority.'),
        port: int('SRV port.'),
        weight: int('SRV weight.'),
        flags: int('CAA flags.'),
        tag: str('CAA tag.'),
        dry_run: DRY_RUN,
      },
      required: ['domain'],
      additionalProperties: false,
    },
    async handler(args, { client }) {
      const { domain, record_id: recordId, dry_run: dryRun, ...fields } = args;
      if (!recordId && !(fields.type && fields.name && fields.data)) {
        throw new PolicyError('Creating a record needs type, name and data.');
      }
      for (const k of Object.keys(fields)) if (fields[k] === undefined) delete fields[k];
      const base = `/domains/${encodeURIComponent(domain)}/records`;
      const [method, path] = recordId ? ['PATCH', `${base}/${encodeURIComponent(recordId)}`] : ['POST', base];
      if (dryRun) return dryRunResult(method, path, fields);
      const { data } = await client.request(method, path, { body: fields });
      return data.domain_record;
    },
  },
  {
    name: 'do_delete_domain_record',
    level: 'destroy',
    description: 'Delete a DNS record. Requires full mode and confirm=<record id>.',
    inputSchema: {
      type: 'object',
      properties: { domain: str('Domain.'), record_id: int('Record id.'), confirm: CONFIRM('the record id'), dry_run: DRY_RUN },
      required: ['domain', 'record_id', 'confirm'],
      additionalProperties: false,
    },
    async handler(args, { client }) {
      assertConfirmed(args.record_id, args.confirm, `delete DNS record ${args.record_id}`);
      const path = `/domains/${encodeURIComponent(args.domain)}/records/${encodeURIComponent(args.record_id)}`;
      const { data } = await client.get(path);
      if (args.dry_run) return { ...dryRunResult('DELETE', path), record: data.domain_record };
      await client.request('DELETE', path);
      return { deleted: true, record: data.domain_record };
    },
  },
  listTool({
    name: 'do_list_firewalls', path: '/firewalls', key: 'firewalls',
    description: 'List cloud firewalls with their inbound rules and attached droplets/tags.',
  }),
  {
    name: 'do_create_firewall',
    level: 'write',
    description: 'Create a cloud firewall. Rules follow the API shape, e.g. inbound_rules: [{"protocol":"tcp","ports":"443","sources":{"addresses":["0.0.0.0/0","::/0"]}}]. Attach by droplet_ids or tags.',
    inputSchema: {
      type: 'object',
      properties: {
        name: str('Firewall name.'),
        inbound_rules: { type: 'array', items: { type: 'object' } },
        outbound_rules: {
          type: 'array', items: { type: 'object' },
          description: 'Defaults to allow-all outbound (tcp/udp/icmp to 0.0.0.0/0 and ::/0).',
        },
        droplet_ids: { type: 'array', items: { type: 'integer' } },
        tags: { type: 'array', items: { type: 'string' } },
        dry_run: DRY_RUN,
      },
      required: ['name', 'inbound_rules'],
      additionalProperties: false,
    },
    async handler(args, { client }) {
      const everywhere = { addresses: ['0.0.0.0/0', '::/0'] };
      const body = {
        name: args.name,
        inbound_rules: args.inbound_rules,
        outbound_rules: args.outbound_rules || [
          { protocol: 'tcp', ports: 'all', destinations: everywhere },
          { protocol: 'udp', ports: 'all', destinations: everywhere },
          { protocol: 'icmp', destinations: everywhere },
        ],
        droplet_ids: args.droplet_ids,
        tags: args.tags,
      };
      if (args.dry_run) return dryRunResult('POST', '/firewalls', body);
      const { data } = await client.request('POST', '/firewalls', { body });
      return project.firewalls(data.firewall);
    },
  },
  listTool({
    name: 'do_list_load_balancers', path: '/load_balancers', key: 'load_balancers',
    description: 'List load balancers.',
  }),

  // -------------------------------------------------------------- storage / data / platform
  listTool({
    name: 'do_list_volumes', path: '/volumes', key: 'volumes',
    description: 'List block storage volumes.',
    filters: { region: str('Region slug.') },
    query: (a) => ({ region: a.region }),
  }),
  listTool({
    name: 'do_list_databases', path: '/databases', key: 'databases',
    description: 'List managed database clusters (Postgres, Redis/Valkey, MySQL, …).',
    filters: { tag_name: str('Only clusters with this tag.') },
    query: (a) => ({ tag_name: a.tag_name }),
  }),
  listTool({
    name: 'do_list_kubernetes_clusters', path: '/kubernetes/clusters', key: 'kubernetes_clusters',
    description: 'List DOKS Kubernetes clusters and their node pools.',
  }),
  listTool({
    name: 'do_list_apps', path: '/apps', key: 'apps',
    description: 'List App Platform apps with live URL and active deployment phase.',
  }),
  {
    name: 'do_get_app',
    level: 'read',
    description: 'Get an App Platform app plus its most recent deployments.',
    inputSchema: {
      type: 'object',
      properties: { app_id: str('App id (uuid).'), raw: { type: 'boolean' } },
      required: ['app_id'],
      additionalProperties: false,
    },
    async handler(args, { client }) {
      const id = encodeURIComponent(args.app_id);
      const [{ data: app }, { data: deps }] = await Promise.all([
        client.get(`/apps/${id}`),
        client.get(`/apps/${id}/deployments`, { per_page: 5 }),
      ]);
      const deployments = (deps.deployments || []).map((d) => ({
        id: d.id, phase: d.phase, cause: d.cause, created_at: d.created_at,
        progress: d.progress && `${d.progress.success_steps}/${d.progress.total_steps}`,
      }));
      return { app: args.raw ? app.app : project.apps(app.app), deployments };
    },
  },
  {
    name: 'do_create_app_deployment',
    level: 'write',
    description: 'Trigger a new App Platform deployment (redeploy). Set force_build to rebuild from source.',
    inputSchema: {
      type: 'object',
      properties: { app_id: str('App id (uuid).'), force_build: { type: 'boolean' }, dry_run: DRY_RUN },
      required: ['app_id'],
      additionalProperties: false,
    },
    async handler(args, { client }) {
      const path = `/apps/${encodeURIComponent(args.app_id)}/deployments`;
      const body = { force_build: Boolean(args.force_build) };
      if (args.dry_run) return dryRunResult('POST', path, body);
      const { data } = await client.request('POST', path, { body });
      return { id: data.deployment.id, phase: data.deployment.phase };
    },
  },

  // -------------------------------------------------------------- escape hatch
  {
    name: 'do_api_request',
    level: 'dynamic',
    description: 'Call any DigitalOcean API v2 endpoint not covered by a dedicated tool (see https://docs.digitalocean.com/reference/api/digitalocean/). ' +
      'path is relative to /v2, e.g. "/vpcs" or "/monitoring/alerts". GET is read-level; POST/PUT/PATCH need read-write mode; ' +
      'DELETE needs full mode and confirm=<the exact path>. Prefer dedicated tools when they exist.',
    inputSchema: {
      type: 'object',
      properties: {
        method: str('HTTP method.', { enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }),
        path: str('API path relative to /v2, starting with "/".'),
        query: { type: 'object', description: 'Query-string parameters.' },
        body: { type: 'object', description: 'JSON request body.' },
        confirm: CONFIRM('path (required for DELETE)'),
        dry_run: DRY_RUN,
      },
      required: ['method', 'path'],
      additionalProperties: false,
    },
    async handler(args, { client, policy }) {
      const method = args.method.toUpperCase();
      if (!args.path.startsWith('/') || args.path.includes('..') || /^\/*https?:/i.test(args.path)) {
        throw new PolicyError('path must be an API path relative to /v2, e.g. "/vpcs".');
      }
      const level = levelForMethod(method);
      assertAllowed(policy, level, `do_api_request(${method})`);
      if (level === 'destroy') assertConfirmed(args.path, args.confirm, `${method} ${args.path}`);
      if (args.dry_run) return dryRunResult(method, args.path, args.body);
      const { status, data } = await client.request(method, args.path, { query: args.query, body: args.body });
      return { status, data };
    },
  },
];

function annotationsFor(tool) {
  if (tool.level === 'read') return { readOnlyHint: true, destructiveHint: false, openWorldHint: true };
  if (tool.level === 'destroy') return { readOnlyHint: false, destructiveHint: true, openWorldHint: true };
  return { readOnlyHint: false, destructiveHint: tool.level === 'dynamic', openWorldHint: true };
}

/** Tools visible in the given mode (read-only mode hides write/destroy tools entirely). */
function visibleTools(policy) {
  return tools.filter((t) => {
    if (t.level === 'read' || t.level === 'dynamic') return true;
    if (t.level === 'write') return policy.mode !== 'read-only';
    if (t.level === 'destroy') return policy.mode === 'full';
    return false;
  });
}

async function callTool(name, args, ctx) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new PolicyError(`Unknown tool: ${name}`);
  if (tool.level !== 'dynamic') assertAllowed(ctx.policy, tool.level, name);
  return tool.handler(args || {}, ctx);
}

module.exports = { tools, visibleTools, callTool, annotationsFor, summarizeDroplet };
