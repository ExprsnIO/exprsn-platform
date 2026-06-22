# Exprsn-CA — Product Requirements Document

> **Document type:** PRD · **Owner:** Platform Security · **Status:** Draft v1.0
> **Target GA:** 2027-01-01 · **Authoring date:** 2026-06-07
> **Related:** [exprsn-ca.md](./exprsn-ca.md) (current technical reference), [exprsn-auth.md](./exprsn-auth.md) (downstream consumer)

---

## 1. Problem Statement

The Exprsn Platform's security posture hinges on a single dependency — **Exprsn-CA** — that today is implemented as a Node.js/`node-forge` service. As Exprsn moves into regulated verticals (healthcare, payments, financial services) and grows beyond the current single-tenant footprint, the existing CA cannot meet the cryptographic-assurance, throughput, and operational bars its customers and auditors now demand. Without an enterprise-grade rebuild, Exprsn cannot sell into HIPAA/PCI accounts, cannot offer hybrid (managed control plane + on-prem data plane) deployments, and cannot scale token issuance past the ~100k/day soft ceiling of pure-Node RSA-PSS signing.

## 2. Goals

The following outcomes define success for the 2027-01-01 GA. Each is measurable and tied to a customer or compliance commitment.

1. **Issue and validate 10M+ tokens per day** at p99 validation latency ≤ 15 ms, sustained across rolling 24-hour windows.
2. **Achieve FIPS 140-3 validated cryptography** for all signing and key-wrapping operations, with a documented HSM-backed root and intermediate key custody chain.
3. **Pass SOC 2 Type II and a WebTrust-aligned internal audit** by Q4 2026, clearing HIPAA technical safeguards and PCI DSS v4 key-management controls (3.5, 3.6, 3.7).
4. **Ship three deployment SKUs** — Exprsn SaaS, Exprsn-Managed Data Plane (customer HSM + Exprsn ops), and fully self-hosted — each available in three regional control planes (`us-`, `eu-`, `apac-`) for data-residency compliance.
5. **Become the platform's single OIDC issuer** for service identities (SPIFFE-style workload identity) so downstream services replace bespoke JWT signing with CA-issued, OCSP-revocable tokens.

## 3. Non-Goals

These are explicitly out of scope for the GA release. They are documented to prevent scope creep and to set stakeholder expectations.

- **End-user authentication UI.** Login, MFA, social/SAML — owned by Exprsn-Auth, not Exprsn-CA. The CA never sees passwords or directly authenticates humans.
- **Becoming a publicly-trusted (browser-root) CA.** Exprsn-CA remains a **private** PKI; we do not pursue inclusion in Mozilla/Apple/Microsoft root stores. Customers needing public TLS use Let's Encrypt or a public CA.
- **Payment processing or billing enforcement.** Subscription metering for token issuance lives in Exprsn-Auth/Exprsn-Payments. The CA emits usage events but does not gate on entitlements at issuance time.
- **General-purpose secrets management.** This is not a Vault replacement. The CA stores key material it issues; it does not warehouse arbitrary application secrets.
- **Hardware-token (FIDO2/WebAuthn) issuance for end users.** Capability tokens and X.509 certificates only; WebAuthn credentials remain in Exprsn-Auth.

## 4. User Stories

### Platform service owner (internal Exprsn engineer)

> As a service owner, I want to bootstrap a new microservice with an mTLS identity in one CLI command, so that I can deploy without hand-rolling cert provisioning.

> As a service owner, I want my service's CA token to auto-rotate before expiry, so that long-running workloads never see auth failures from expired credentials.

### Tenant administrator (customer org admin)

> As a tenant admin, I want to bring my own intermediate CA rooted under Exprsn's offline root, so that my organization's certificates carry our DN and chain through our policy controls.

> As a tenant admin, I want to enroll IoT/edge devices via ACME, so that I can leverage standard tooling (`certbot`, `lego`, `cert-manager`) without writing custom enrollment code.

### End user / group member

> As a user assigned to a group, I want my session-issued CA token to carry only the resources my group grants, so that a leaked token cannot escalate beyond my authorized scope.

### Compliance auditor (internal or external)

> As an auditor, I want a tamper-evident audit log of every key-generation, signing, and revocation event, exportable to my SIEM with chain-of-custody intact, so that I can attest to SOC 2 / HIPAA / PCI controls without sampling errors.

### Developer integrating with the platform

> As a developer, I want to call a standards-compliant OIDC discovery endpoint and validate JWTs against the published JWKS, so that I can integrate with the platform using any conformant OIDC library.

### Security / incident responder

> As an incident responder, I want to revoke a compromised certificate and have every dependent token invalidated within 60 seconds across all regions, so that a key-compromise blast radius is bounded.

## 5. Requirements

Requirements are categorized P0 (Must-Have for GA), P1 (Nice-to-Have, target GA + 1 quarter), and P2 (Future Considerations).

### 5.1 P0 — Must-Have for 2027-01-01 GA

**P0-1 — FIPS 140-3 validated cryptographic core.**
Replace the `node-forge` crypto path with a C/C++ signing engine built on OpenSSL 3.x in FIPS mode (or BoringSSL FIPS module). All RSA, ECDSA, and SHA-2 operations on the signing path must execute inside the validated boundary. Node.js retains the API surface; native bindings (N-API) marshal signing requests to the C++ engine.
- *Acceptance:* CMVP certificate number referenced in `/admin/api/health`; `openssl version -a` reports FIPS module loaded; signing key material never leaves the HSM/PKCS#11 boundary in plaintext.

**P0-2 — HSM-backed root and intermediate keys (multi-vendor PKCS#11 matrix).**
All private keys live in PKCS#11 HSMs, abstracted behind a vendor-neutral driver layer. Supported backends at GA: **Entrust nShield** (on-prem primary, FIPS 140-3 L3), **AWS CloudHSM**, **GCP Cloud HSM**, **Azure Managed HSM** (cloud-managed, selected per customer cloud), and **YubiHSM 2** (low-tier / developer / edge). Thales Luna is explicitly *not* in the GA matrix (lead-time risk, see [Decisions Log Q1](#7-decisions-log-resolved-2026-06-07)). Root is held offline (Entrust nShield in nominated facility); intermediates online in the customer-selected backend. Key generation occurs on-HSM; export disabled.
- *Acceptance:* `pkcs11-tool --list-objects` shows `CKA_EXTRACTABLE=false` for every key on every backend; a documented quorum-controlled (Shamir M-of-N) root signing ceremony is rehearsed and recorded; integration tests pass against all five backend drivers in CI (CloudHSM/GCP/Azure use ephemeral test partitions, nShield/YubiHSM run on dedicated lab units).

**P0-3 — ACME (RFC 8555) issuance endpoint.**
Implement ACME v2 server protocol for `http-01`, `dns-01`, and `tls-alpn-01` challenges. Account binding ties ACME accounts to tenant orgs. External Account Binding (EAB, RFC 8555 §7.3.4) is mandatory for tenant-scoped issuance.
- *Acceptance:* `certbot register --server https://ca.exprsn.io/acme/directory` succeeds; `cert-manager` and `lego` conformance suites pass; `dns-01` works with Route53, Cloudflare, and Google Cloud DNS providers.

**P0-4 — Hybrid deployment topology with three SKUs.**
Ship two deployment artifacts — a **control-plane** image (policy, audit, billing, UI, ACME front door) and a **data-plane signer** image (signing engine + HSM driver) — composable into three GA SKUs:

1. **Exprsn SaaS** — Exprsn operates both planes; multi-tenant; AWS CloudHSM backend.
2. **Exprsn-Managed Data Plane** — Exprsn operates control plane, Exprsn-Ops runs the data plane against a *customer-attested* HSM partition (CloudHSM / GCP / Azure / nShield in the customer's account). Customer holds the cryptographic root of trust; Exprsn holds operational responsibility.
3. **Fully Self-Hosted** — Customer operates both planes; Exprsn provides images, runbooks, and support. Required for air-gapped and sovereign-cloud customers.

mTLS-authenticated gRPC carries signing requests from control plane to data plane in SKUs 2 and 3. Per-SKU support boundary documented in a public runbook before GA.
- *Acceptance:* One design-partner deployment running on each of the three SKUs by GA; reference SKU-2 deployment processes 1k signing requests/sec with control plane in a different cloud region/account; data-plane outage degrades issuance only, validation still works against cached CRL/OCSP.

**P0-5 — Throughput: 10M tokens/day sustained.**
Sustained issuance ≥ 120 tokens/sec average, peaks to 2,000/sec; validation ≥ 12,000/sec average, peaks to 50,000/sec. Achieved via (a) C++ signing engine, (b) connection pooling to HSM with session caching, (c) horizontal scaling of validation workers reading a replicated PostgreSQL + Redis topology.
- *Acceptance:* Load test issuance ≥ 2,000 tokens/sec for 60 minutes with p99 ≤ 250 ms; validation ≥ 50,000/sec for 60 minutes with p99 ≤ 15 ms.

**P0-6 — Revocation propagation ≤ 60s, globally (hybrid bus).**
Revocation events fan out over a two-tier bus: **Redis pub/sub intra-region** for low-latency cache invalidation (sub-second p99 within a region) and **Kafka inter-region** for durable cross-region delivery that survives region partitions. Every validation worker subscribes to its local Redis channel; the regional control plane bridges revocation events into a global Kafka topic that every other region's bridge consumes and republishes on its local Redis. CRL regeneration on revoke (no waiting for `CRL_UPDATE_INTERVAL`). OCSP cache TTL capped at 60s for revoked-status responses.
- *Acceptance:* Integration test: revoke a cert in region A, validate a dependent token in region B within 60s → returns `TOKEN_REVOKED` or `CERT_REVOKED`. Chaos test: kill the inter-region bridge for 5 minutes, restore, confirm no revocation events are lost (Kafka durability).

**P0-7 — Tamper-evident audit log with SIEM export and opt-in public transparency.**
All key, certificate, token, and configuration mutations append to `audit_logs` with a hash-chained `prev_hash` field (each row's hash includes the prior row's hash). Daily Merkle root **always** written to an immutable internal store (S3 Object Lock / WORM). **Per-tenant opt-in**: tenants may enable public publication of their Merkle root to a Certificate-Transparency-style log; default off. Schema additions: `tenants.transparency_log_enabled`, `tenants.transparency_log_url`. Streaming export to Splunk, Datadog, and generic syslog/CEF.
- *Acceptance:* Tamper-detection test: mutate any historical row → audit verifier flags the chain break; SIEM export delivers events within 30s of write; opt-in tenants' daily roots appear in the configured public log within 24h with verifiable inclusion proofs.

**P0-8 — OIDC issuer with JWKS rotation.**
Expose `/.well-known/openid-configuration` and `/.well-known/jwks.json` for service identity tokens. JWKS contains multiple active keys for zero-downtime rotation. JWTs are signed by HSM-resident keys.
- *Acceptance:* `oidc-conformance-suite` core profile passes; key rotation completes without invalidating in-flight tokens during the overlap window.

**P0-9 — Multi-tenant isolation.**
Every certificate, token, audit row, and ACME account is scoped to a tenant (`organizationId`). Cross-tenant reads are impossible at the data layer (row-level security in PostgreSQL, not application-layer filtering alone). Per-tenant rate limits prevent noisy-neighbor issuance bursts.
- *Acceptance:* Penetration test: a valid Tenant A session attempting to read Tenant B resources returns 404; PostgreSQL RLS policy enforced even if application middleware is bypassed.

**P0-10 — HIPAA & PCI DSS controls.**
Encryption at rest (AES-256-GCM, HSM-wrapped DEKs), encryption in transit (TLS 1.3, mTLS for service-to-service), key rotation (DEK rotation every 90 days, JWKS rotation every 90 days, intermediate rotation per policy), access logging (every read of sensitive material audited).
- *Acceptance:* HIPAA technical safeguards mapping document (§164.312) signed off by compliance; PCI DSS v4 §3.5-3.7 control evidence collected for an internal audit dry-run.

**P0-11 — Per-region control planes (us, eu, apac).**
Three fully isolated regional control planes at GA: `us-` (primary US region), `eu-` (EU residency, GDPR), `apac-` (APAC residency, sovereign data laws). Each region has its own PostgreSQL cluster, HSM pool, audit chain, Kafka cluster, and Merkle-root WORM store. **No cross-region data flows** for tenant data — only the inter-region revocation Kafka topic crosses borders, and it carries opaque revocation events (cert serial + tenant ID hash), no PII. Tenant home region is selected at onboarding and immutable thereafter.
- *Acceptance:* GDPR data-flow review passes (no EU tenant data egresses `eu-` region); separate region status pages with independent SLOs; per-region disaster-recovery drill (kill `eu-` primary, confirm `eu-` secondary takes over without touching `us-`/`apac-`).

### 5.2 P1 — Nice-to-Have (GA + 1 quarter)

**P1-1 — SPIFFE/SPIRE issuer plugin.**
Issue SPIFFE-format SVIDs (X.509 and JWT) so workloads running in service meshes (Istio, Linkerd) can adopt CA-issued identities without custom code.
- *Acceptance:* `spire-server` plugin loads, attests a workload, and is issued an SVID with TTL ≤ 1 hour.

**P1-2 — Bring-your-own-key (BYOK) for tenant intermediates.**
A tenant can upload a CSR for an intermediate they generated on their own HSM; Exprsn-CA signs it under the Exprsn root. Tenant retains the private key entirely.
- *Acceptance:* CSR upload → signed intermediate cert returned; tenant private key never touches Exprsn infrastructure.

**P1-3 — Quantum-readiness experimentation.**
Behind a feature flag, support hybrid X.509 certificates carrying both ECDSA-P384 and ML-DSA (Dilithium) signatures, per NIST PQC migration guidance.
- *Acceptance:* `openssl x509 -text` shows both signature algorithms; certificate validates under both classical and PQ validation paths.

**P1-4 — Intra-region active-active.**
Within each regional control plane (us / eu / apac), run active-active PostgreSQL with sub-second consistency for validation reads (managed: Aurora multi-AZ writer-failover, or Patroni-managed self-hosted). Active-active is *intra-region only* — cross-region is intentionally active-passive per [P0-11](#51-p0--must-have-for-2027-01-01-ga) and [Decisions Log Q7](#7-decisions-log-resolved-2026-06-07).
- *Acceptance:* Region failover test: kill primary writer in `us-` → secondary writer takes over within 30s, no audit-log gaps; `eu-` and `apac-` are unaffected.

**P1-5 — Self-service tenant onboarding API.**
Programmatic tenant creation (CRUD), intermediate-CA provisioning, ACME EAB credential issuance — without manual operator steps.
- *Acceptance:* Full tenant onboarding from API call to first issued cert in < 5 minutes, automated end-to-end test.

### 5.3 P2 — Future Considerations

- **WebTrust for CAs audit** and submission to a public root program (would change the project's positioning from private CA to public CA).
- **Code-signing time-stamp authority (RFC 3161)** as a complementary service.
- **EST (RFC 7030)** as an alternative enrollment protocol for environments where ACME isn't appropriate (some IoT vendors).
- **Hardware attestation** (TPM 2.0, Apple DeviceCheck, Android Key Attestation) as input to issuance policy.
- **Confidential-compute signing** (AWS Nitro Enclaves, Intel SGX, AMD SEV-SNP) for customers who need attested signing without dedicated HSM hardware.

## 6. Success Metrics

### Leading indicators (move within days/weeks)

| Metric | Target | Measurement |
|---|---|---|
| Token issuance p99 latency | ≤ 250 ms | Prometheus histogram, 5-min windows |
| Token validation p99 latency | ≤ 15 ms | Prometheus histogram, 5-min windows |
| ACME-issued cert success rate | ≥ 99.5% | `acme_orders_completed / acme_orders_total`, 24h window |
| Revocation propagation time (region-to-region) | ≤ 60s p99 | Synthetic test, every 5 min, alert if breached |
| Audit-chain verifier pass rate | 100% | Daily Merkle-root job, alert on any chain break |

### Lagging indicators (move within quarters)

| Metric | Target | Measurement |
|---|---|---|
| Sustained issuance throughput | 10M tokens/day by 2027-Q2 | Daily issuance counter |
| Customer compliance attestations | ≥ 5 HIPAA + ≥ 3 PCI by 2027-Q4 | Sales/compliance tracking |
| Mean time to revoke a compromised cert | ≤ 5 min from report to global effect | Incident postmortems |
| Service availability | ≥ 99.95% control plane, ≥ 99.99% validation path | Status page, SLO burn-rate alerting |
| Audit findings (SOC 2 / WebTrust dry run) | 0 critical, ≤ 3 medium | Audit reports |

## 7. Decisions Log (resolved 2026-06-07)

All seven launch-blocking questions are resolved. Each decision below is binding for GA-scope work; reversing one requires PRD revision.

| # | Question | Decision | Implication |
|---|---|---|---|
| Q1 | HSM vendor standardization | **Multi-vendor PKCS#11 matrix:** Entrust nShield (on-prem primary, FIPS 140-3 L3), AWS CloudHSM / GCP Cloud HSM / Azure Managed HSM (cloud-managed, selected per customer cloud), YubiHSM 2 (low-tier / dev / edge). Thales Luna **not** in the matrix. | Removes Thales 8–16 week lead-time from the critical path. Locks us into a vendor-neutral PKCS#11 abstraction. Data-plane signer image must bundle all five drivers; CI must test against all five. Reflected in [P0-2](#51-p0--must-have-for-2027-01-01-ga). |
| Q2 | Revocation fanout bus | **Hybrid:** Redis pub/sub intra-region for sub-second invalidation, Kafka inter-region for durable cross-region delivery. | New operational dependency: managed Kafka per region (AWS MSK / Confluent Cloud). Bridge component required between Redis ↔ Kafka. Reflected in [P0-6](#51-p0--must-have-for-2027-01-01-ga). |
| Q3 | Hybrid SKU midpoint | **Yes — three SKUs:** (a) Exprsn SaaS, (b) Exprsn-Managed Data Plane (customer HSM, Exprsn ops), (c) fully self-hosted. | Doubles runbook surface; aligns with multi-HSM matrix. Support-boundary doc required pre-GA. Reflected in [P0-4](#51-p0--must-have-for-2027-01-01-ga). |
| Q4 | Pricing model | **Per active token** (count-based subscription). Tier inclusions cap the active-token count; overage policy TBD by Finance before GA. | Issuance bursts free, recurring footprint billable — incentivizes short-lived tokens and rotation, aligning customer cost with security posture. Active-token meter must be exposed in `/admin/api/stats` and emitted to the billing pipeline. |
| Q5 | Audit-log transparency | **Opt-in per tenant.** Tenants choose whether their daily Merkle root publishes to a public transparency log; default off. | Differentiator for regulated customers without forcing publication on confidential hierarchies. Schema additions: `tenants.transparency_log_enabled`, `tenants.transparency_log_url`. Reflected in [P0-7](#51-p0--must-have-for-2027-01-01-ga). |
| Q6 | Legacy migration path | **Dual-issuance period.** HSM-backed path issues all net-new credentials at Phase 1 cutover; legacy `node-forge` path remains *validate-only* until the longest in-flight credential expires naturally. | Lowest-risk migration; no forced re-issuance. Cutover window driven by longest legacy validity (365d for entity certs; ~10y for intermediates — those must be revoked manually before GA + 1y, not allowed to age out). Reflected in Phase 1 of [Section 8](#8-timeline--phasing). |
| Q7 | EU / regional data residency | **Per-region control planes** — `us-`, `eu-`, `apac-` — with full isolation: separate DB, HSM pool, Kafka cluster, audit chain, WORM store. Only opaque revocation events cross regions. | GDPR-clean; satisfies APAC sovereign-data laws. Promoted from open question to new [P0-11](#51-p0--must-have-for-2027-01-01-ga); demotes the original P1-4 "cross-region active-active" to *intra-region* active-active. |

## 8. Timeline & Phasing

GA is fixed at **2027-01-01**. Phasing works backward from that date and respects the dependency that every downstream Exprsn service consumes the CA.

### Phase 0 — Foundations (2026-Q3, Jul–Sep 2026)
- Entrust nShield procurement initiated (decision closed — see Q1); cloud HSM partitions provisioned in AWS / GCP / Azure dev accounts.
- C++ signing engine prototype against PKCS#11; benchmark vs. `node-forge` baseline across all five HSM backends.
- Audit-log hash-chaining shipped to production (low-risk, additive change).
- Active-token billing meter wired into `/admin/api/stats` (Q4 decision).
- Per-region infrastructure scaffolding stood up (`us-` first; `eu-` and `apac-` accounts opened).
- **Exit criteria:** signing engine demonstrates ≥ 5x throughput improvement on each HSM backend; Entrust contract signed; meter emitting to billing staging.

### Phase 1 — FIPS core + HSM root + dual-issuance (2026-Q4, Oct–Dec 2026)
- New root and intermediates generated on-HSM in a recorded ceremony (M-of-N quorum, video-witnessed).
- **Dual-issuance period begins** (Q6 decision): HSM-backed path serves *all net-new* issuance; legacy `node-forge` path drops to *validate-only* — no new credentials issued from it. Long-lived legacy intermediates flagged for forced revocation before GA + 1y rather than natural aging.
- ACME endpoint behind feature flag, internal dogfooding only.
- Redis ↔ Kafka revocation bridge deployed in `us-` region.
- **Exit criteria:** FIPS 140-3 module integrated; revocation propagation ≤ 60s validated intra- and inter-region; legacy issuance path quiesced (zero new issuance in 7-day window).

### Phase 2 — Hybrid SKUs + OIDC issuer + regional rollout (2026-Q4 → 2027-Q1, Nov 2026 – Jan 2027)
- Data-plane signer image GA; all three SKUs (Q3 decision) have at least one design-partner deployment.
- OIDC issuer endpoints public.
- ACME endpoint generally available with EAB.
- Multi-tenant isolation hardened (PostgreSQL RLS rolled out per region).
- `eu-` and `apac-` control planes brought to feature parity with `us-` (Q7 decision).
- Opt-in transparency log machinery (Q5) shipped behind a tenant setting.
- HIPAA/PCI control evidence collection complete.
- **Exit criteria:** SOC 2 Type II observation window covers the new architecture; one design-partner customer running on each of the three SKUs; all three regions serving traffic.

### GA — 2027-01-01
- All P0 requirements met across all three regions.
- Legacy `node-forge` issuance path code-deleted (validation-only mode continues for in-flight tokens until natural expiry; legacy intermediates revoked rather than waiting out the ~10y validity).

### Hard dependencies & risk

- **Entrust nShield procurement** (8–12 weeks) is now the longest single dependency. Mitigated by parallel cloud-HSM provisioning — Phase 0 work can proceed against AWS/GCP/Azure partitions while nShield ships.
- **Exprsn-Auth migration** to the new OIDC issuer must complete before legacy issuance is removed. Coordinate with Exprsn-Auth team early in Phase 2.
- **Three SKUs × three regions = nine deployment matrices** at GA. Test automation must cover this combinatorially or scope reductions are required.
- **Customer commitments** for design-partner deployments (one per SKU) need to be lined up by 2026-Q3 — Sales engagement should start now.
- **Kafka operational maturity** — neither the platform team nor SRE has deep Kafka experience; budget for managed (MSK / Confluent Cloud) plus training.

---

## Appendix A — Current State vs. Target

Snapshot of where the codebase stands today (per [exprsn-ca.md](./exprsn-ca.md)) and the delta this PRD closes.

| Area | Current | Target (GA) |
|---|---|---|
| Crypto module | `node-forge` (pure JS) | OpenSSL 3 FIPS / PKCS#11 via C++ N-API |
| Root key custody | Disk, AES-256 wrapped | Offline Entrust nShield HSM, M-of-N quorum |
| HSM backend matrix | None | Entrust nShield + AWS CloudHSM + GCP Cloud HSM + Azure Managed HSM + YubiHSM 2 |
| Issuance throughput | ~100/sec (single node) | 2,000/sec peak, 120/sec sustained |
| Validation throughput | ~5,000/sec (cached) | 50,000/sec peak, 12,000/sec sustained |
| Enrollment protocols | Custom HTTP API only | + ACME v2 with EAB |
| Standards exposure | X.509 + bespoke CA Tokens | + OIDC issuer, JWKS, OCSP, CRL |
| Deployment | Single-process Node app | Three SKUs (SaaS / Managed Data Plane / Self-Hosted) × three regions (us / eu / apac) |
| Revocation bus | Redis pub/sub, single region | Redis intra-region + Kafka inter-region |
| Tenant isolation | Application-layer filtering | PostgreSQL row-level security + per-region data residency |
| Audit log | Append-only `audit_logs` table | Hash-chained + Merkle root in WORM + opt-in public transparency |
| Pricing model | None (internal-only service) | Per-active-token subscription with tiered allotments |
| Compliance posture | None formal | SOC 2 Type II, FIPS 140-3, HIPAA, PCI DSS v4 |

## Appendix B — Stack Constraints

Per project conventions: **C/C++** for the new signing engine and HSM driver, **Node.js + TypeScript** for the API/control plane (continuity with existing codebase), **PostgreSQL** for primary persistence (continuity), **Redis** for cache + revocation fanout, **macOS** as a supported developer environment (the C++ engine must build and test on Darwin/arm64 as well as Linux/x86_64 and Linux/arm64 for production).
