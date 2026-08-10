#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# Node.js Installation Functions
# ═══════════════════════════════════════════════════════════════════════

install_nodejs() {
    local version=${1:-20}

    if command_exists node; then
        local current_version
        current_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ "$current_version" -ge "$version" ]]; then
            success "Node.js $current_version is already installed"
            return 0
        fi
    fi

    case "$OS_DISTRO" in
        ubuntu|debian)
            install_nodejs_apt "$version"
            ;;
        fedora|centos|rhel)
            install_nodejs_yum "$version"
            ;;
        macos)
            install_nodejs_macos "$version"
            ;;
        *)
            error "Unsupported OS for Node.js installation"
            return 1
            ;;
    esac

    # Verify installation
    if ! command_exists node || ! command_exists npm; then
        error "Node.js installation failed"
        return 1
    fi

    local installed_version
    installed_version=$(node --version)
    success "Node.js $installed_version installed successfully"
}

install_nodejs_apt() {
    local version=$1

    log "Installing Node.js $version from NodeSource repository..."

    # Add NodeSource repository
    curl -fsSL "https://deb.nodesource.com/setup_${version}.x" | bash -

    # Install Node.js
    apt-get install -y -qq nodejs

    success "Node.js installed via apt"
}

install_nodejs_yum() {
    local version=$1

    log "Installing Node.js $version from NodeSource repository..."

    # Add NodeSource repository
    curl -fsSL "https://rpm.nodesource.com/setup_${version}.x" | bash -

    # Install Node.js
    if command_exists dnf; then
        dnf install -y -q nodejs
    else
        yum install -y -q nodejs
    fi

    success "Node.js installed via yum/dnf"
}

install_nodejs_macos() {
    local version=$1

    log "Installing Node.js $version from official website..."

    # Detect architecture
    local arch
    if [[ "$OS_ARCH" == "arm64" ]]; then
        arch="arm64"
    else
        arch="x64"
    fi

    # Download official Node.js installer
    local download_url="https://nodejs.org/dist/latest-v${version}.x/node-v${version}-latest-darwin-${arch}.tar.gz"
    local temp_dir="/tmp/nodejs-install"
    mkdir -p "$temp_dir"

    log "Downloading Node.js from $download_url..."
    curl -fsSL "$download_url" -o "${temp_dir}/nodejs.tar.gz"

    # Extract to /usr/local
    log "Extracting Node.js..."
    tar -xzf "${temp_dir}/nodejs.tar.gz" -C "$temp_dir"

    # Find the extracted directory
    local extracted_dir
    extracted_dir=$(find "$temp_dir" -maxdepth 1 -type d -name "node-v*" | head -1)

    # Copy files to /usr/local
    cp -R "${extracted_dir}"/* /usr/local/

    # Cleanup
    rm -rf "$temp_dir"

    # Update PATH if needed
    if ! grep -q '/usr/local/bin' /etc/paths; then
        echo '/usr/local/bin' >> /etc/paths
    fi

    success "Node.js installed on macOS"
}

install_npm_packages() {
    log "Installing global npm packages..."

    npm install -g npm@latest
    npm install -g pm2
    npm install -g nodemon

    success "Global npm packages installed"
}
