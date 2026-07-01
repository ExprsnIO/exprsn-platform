# Plugin system — demo

A runnable demonstration of the plugin framework and how it interacts with the
rest of the platform. Seeded by `scripts/seed/plugins-demo.js`.

```bash
npm run db:migrate        # ensure plugins + lowcode schemas exist
npm run seed:plugins      # register + install the demo plugins, rules, workflows, low-code flow
SEED_DEMO_EMIT=1 npm run seed:plugins   # also fire sample events and print the deliveries
SEED_DEMO_RESET=1 npm run seed:plugins  # remove all demo rows
```

Everything is keyed `demo-*` and idempotent (each run cleans then re-inserts).
The hook bus only dispatches when `PLUGINS_ENABLED=true` (the seed sets it);
sandboxed `script` plugins additionally need `PLUGINS_SCRIPT_ENABLED=true`.

## The four plugins — one per execution kind

| Plugin | Kind | Scope | Capabilities | What it does |
| --- | --- | --- | --- | --- |
| `demo-welcome-coach` | `declarative` | `user` | `read:timeline.posts`, `emit:notifications`, `emit:audit` | Nudges a notification when a user posts something very short (`length_lt 40`). |
| `demo-toxic-tripwire` | `declarative` | `platform` | `read:timeline.posts`, `read:spark.messages`, `emit:moderator.flag`, `emit:audit` | Nested `all/any/none` tree: (keyword **or** regex) **and not** satire → advisory `flag`. Spans timeline **and** spark. |
| `demo-spam-sentry` | `webhook` | `platform` | `read:timeline.posts`, `call:webhook` | Signs and delivers each new post to an external scorer endpoint (circuit-breaker + retry). |
| `demo-hashtag-enricher` | `script` | `platform` | `read:timeline.posts`, `emit:audit` | Worker-thread sandboxed JS (no `require`/`fs`/`net`) derives `#hashtags`; all I/O brokered via the gateway. |

Lifecycle each one goes through: `lifecycle.register(manifest)` → catalog +
immutable version row → `lifecycle.install({ scope, config, capabilities })` →
grants (⊆ declared) → state machine `installed → enabled`.

## Moderator rules + workflows they feed into

Rules (moderator schema, `metadata.seedDemo=true`):
- **Tripwire abuse → require review** — content the tripwire flags is routed to human review.
- **Spam-sentry score ≥ 80 → hide** — acts on the score Spam Sentry returns over its webhook.
- **Verified exempt from plugin flags** — safeguard so verified partners are never auto-actioned.

Workflows (`moderator_config` category `workflows`): `wf-plugin-intake`,
`wf-webhook-spam-loop`, `wf-lowcode-incident` — they document the
plugin-integrated pipeline surfaced in the admin Moderation → Workflows console.

## Low-code on the **same** hook bus (separate runtime, shared infra)

App `demo-ops` + entity `incident` + flow `flag-to-incident`. The low-code flow
engine `subscribe()`s to the plugins hook bus rather than building a second
dispatch path, so the same `timeline.post.created` event that drives the plugins
also `create_record`s an incident when a post matches.

## Interaction flow (verified by `SEED_DEMO_EMIT=1`)

```
timeline.post.created ─▶ pluginHost.emit ─▶ scopeResolver (platform ∪ user…)
   ├─ declarative  welcome-coach   → emit:notifications   (short posts only)
   ├─ declarative  toxic-tripwire  → emit:moderator.flag  → moderator rule "→ require review"
   ├─ webhook      spam-sentry     → signed delivery      → score → rule "≥80 → hide"
   ├─ script       hashtag-enricher (sandboxed JS)        → { tags, length }
   └─ subscriber   lowcode flag-to-incident               → create_record(incident)
```

Observed `plugin_deliveries` from the three sample events (normal / short / abusive):

```
completed demo-welcome-coach     [notify,audit]   ← short + abusive posts; skipped on the long one
completed demo-toxic-tripwire    [flag,audit]     ← abusive post; skipped (no match) otherwise
completed demo-hashtag-enricher  [script]         ← every post
failed    demo-spam-sentry       [webhook]        ← demo endpoint host is unreachable (exercises failure path)
→ low-code: 1 incident record created from the abusive post via the shared bus
```

Every outcome is written to `plugins.plugin_deliveries` (the audit trail),
tagged with the plugin key + correlation id. Dispatch is best-effort and never
throws into the originating request, and a re-entrancy depth guard drops
plugin-induced event storms.
