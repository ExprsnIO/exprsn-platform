# Exprsn universal installer

One self-hostable entrypoint that detects your platform, optionally provisions a
cloud VM, fetches the source, and installs the platform either as **native**
bare-metal services or as **Docker** containers.

```
curl -fsSL https://git.exprsn.io/install.sh | sh                       # native, this host
curl -fsSL https://git.exprsn.io/install.sh | sh -s -- --mode docker   # containers, this host
curl -fsSL https://git.exprsn.io/install.sh | sh -s -- \
     --provision do --region nyc3 --size s-2vcpu-4gb                    # create a DO droplet + install
```

## Layout

| File | Role |
|------|------|
| `install.sh` | POSIX-sh bootstrap (curl-pipeable). Detects OS, provisions cloud, fetches source, dispatches. |
| `lib/os.sh` | OS abstraction: `pkg_install`, `svc_*`, `fw_*`, per-distro package-name map (apt/dnf/pacman/brew, systemd/launchd). |
| `targets/native.sh` | Bare-metal install. apt → delegates to the deep `scripts/provision-ubuntu.sh`; dnf/pacman/brew → generalized native. |
| `targets/docker.sh` | Installs Docker + Compose, renders `.env`, brings up `docker-compose.yml`. Works on every OS. |
| `cloud/{digitalocean,aws,azure}.sh` | Create a VM via doctl/aws/az with cloud-init that re-runs the installer unattended. |

## Flags

`--mode native|docker` · `--source git|tarball|xz|zip` · `--channel stable|main`
`--provision do|aws|azure` · `--region` · `--size` · `--dir` · `--ref` · `--unattended` · `--no-verify`

## Source

- Primary git: `https://git.exprsn.io/exprsn/exprsn.git`
- Mirror: `https://github.com/exprsnio/exprsn.git`
- Archives: `https://git.exprsn.io/exprsn/exprsn/archive/<ref>.{tar.gz,tar.xz,zip}` (+ `.sha256`)

## Platform support matrix

| OS | Native | Docker |
|----|--------|--------|
| Ubuntu / Debian | ✅ full (LDAP+KRB-in-LDAP, MinIO, mail, app, backups) — `scripts/provision-ubuntu.sh` | ✅ |
| Fedora / RHEL / Rocky / Alma | ✅ full (cn=config LDAP, KRB-in-LDAP, LDAP mail, SSSD+authselect, SELinux, firewalld) — `scripts/provision-fedora.sh` | ✅ |
| Arch | ⚠️ core services + identity stack installed; deep config flagged for verification; OpenSearch via AUR or Docker | ✅ |
| macOS (Homebrew) | ⚠️ core services; no SSSD; Kerberos is Heimdal | ✅ |
| macOS (no Homebrew) | ❌ use Docker | ✅ |

> Docker mode is the recommended path for full feature parity on every non-apt OS today.
