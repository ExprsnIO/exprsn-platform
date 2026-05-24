# Exprsn Service Documentation

Detailed, code-grounded reference documentation for core Exprsn platform services.

| Service | Port | Document |
|---------|------|----------|
| **Exprsn-CA** — Certificate Authority & CA Token system (OCSP/CRL) | `3000` / OCSP `2560` | [exprsn-ca.md](./exprsn-ca.md) |
| **Exprsn-Auth** — Authentication, SSO (OAuth2/OIDC/SAML/LDAP), MFA, RBAC | `3001` | [exprsn-auth.md](./exprsn-auth.md) |

These two services form the platform's security foundation: **Exprsn-CA is the root of trust
and must start first**, and **Exprsn-Auth** delegates capability-token issuance and validation
to it. See each document for architecture, configuration, data models, API reference, and
operational guidance.

For a platform-wide overview, see the repository [`README.md`](../README.md). Shorter service
summaries also live under [`wiki/services/`](../wiki/services/).
