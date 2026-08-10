#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# Package Manager Helper Functions
# ═══════════════════════════════════════════════════════════════════════

update_package_manager() {
    log "Updating package manager..."

    case "$OS_DISTRO" in
        ubuntu|debian)
            export DEBIAN_FRONTEND=noninteractive
            apt-get update -qq
            apt-get install -y -qq \
                curl \
                wget \
                gnupg \
                lsb-release \
                ca-certificates \
                apt-transport-https \
                software-properties-common \
                build-essential
            ;;
        fedora)
            dnf check-update -q || true
            dnf install -y -q \
                curl \
                wget \
                gnupg2 \
                ca-certificates \
                gcc \
                gcc-c++ \
                make
            ;;
        centos|rhel)
            yum check-update -q || true
            yum install -y -q \
                curl \
                wget \
                gnupg2 \
                ca-certificates \
                gcc \
                gcc-c++ \
                make
            ;;
        macos)
            # macOS doesn't need package manager update
            # Install basic command line tools if needed
            if ! xcode-select -p &>/dev/null; then
                log "Installing Xcode Command Line Tools..."
                xcode-select --install 2>/dev/null || true
            fi
            ;;
        *)
            warn "Unknown distribution: $OS_DISTRO"
            return 1
            ;;
    esac

    success "Package manager updated"
}

install_package() {
    local package=$1

    case "$OS_DISTRO" in
        ubuntu|debian)
            apt-get install -y -qq "$package"
            ;;
        fedora)
            dnf install -y -q "$package"
            ;;
        centos|rhel)
            yum install -y -q "$package"
            ;;
        *)
            error "Cannot install package on $OS_DISTRO"
            return 1
            ;;
    esac
}

add_apt_repository_key() {
    local url=$1
    local keyring=$2

    mkdir -p /etc/apt/keyrings
    curl -fsSL "$url" | gpg --dearmor -o "$keyring"
}

add_yum_repository() {
    local name=$1
    local baseurl=$2
    local gpgkey=${3:-}

    cat > "/etc/yum.repos.d/${name}.repo" <<EOF
[$name]
name=$name
baseurl=$baseurl
enabled=1
gpgcheck=1
gpgkey=$gpgkey
EOF
}
