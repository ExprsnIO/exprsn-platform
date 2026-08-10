#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# PostgreSQL Installation Functions
# ═══════════════════════════════════════════════════════════════════════

install_postgresql() {
    local version=${1:-15}

    if command_exists psql && command_exists postgres; then
        local current_version
        current_version=$(psql --version | grep -oP '\d+' | head -1)
        if [[ "$current_version" -ge "$version" ]]; then
            success "PostgreSQL $current_version is already installed"
            return 0
        fi
    fi

    case "$OS_DISTRO" in
        ubuntu|debian)
            install_postgresql_apt "$version"
            ;;
        fedora|centos|rhel)
            install_postgresql_yum "$version"
            ;;
        macos)
            install_postgresql_macos "$version"
            ;;
        *)
            error "Unsupported OS for PostgreSQL installation"
            return 1
            ;;
    esac

    # Configure PostgreSQL
    configure_postgresql "$version"

    # Start PostgreSQL service
    start_postgresql_service

    # Verify installation
    if ! command_exists psql; then
        error "PostgreSQL installation failed"
        return 1
    fi

    success "PostgreSQL $version installed successfully"
}

install_postgresql_apt() {
    local version=$1

    log "Installing PostgreSQL $version from official repository..."

    # Add PostgreSQL repository
    local codename
    codename=$(lsb_release -cs)

    # Install repository key
    add_apt_repository_key \
        "https://www.postgresql.org/media/keys/ACCC4CF8.asc" \
        "/etc/apt/keyrings/postgresql.gpg"

    # Add repository
    echo "deb [signed-by=/etc/apt/keyrings/postgresql.gpg] http://apt.postgresql.org/pub/repos/apt ${codename}-pgdg main" > \
        /etc/apt/sources.list.d/pgdg.list

    # Update and install
    apt-get update -qq
    apt-get install -y -qq \
        "postgresql-${version}" \
        "postgresql-contrib-${version}" \
        "postgresql-client-${version}"

    success "PostgreSQL installed via apt"
}

install_postgresql_yum() {
    local version=$1

    log "Installing PostgreSQL $version from official repository..."

    # Determine OS version
    local os_version
    if [[ "$OS_DISTRO" == "fedora" ]]; then
        os_version="F-$(rpm -E %fedora)"
    else
        os_version="EL-$(rpm -E %{rhel})"
    fi

    # Install repository RPM
    local repo_url="https://download.postgresql.org/pub/repos/yum/reporpms/${os_version}-x86_64/pgdg-redhat-repo-latest.noarch.rpm"

    if command_exists dnf; then
        dnf install -y -q "$repo_url"
        dnf -qy module disable postgresql
        dnf install -y -q "postgresql${version}-server" "postgresql${version}-contrib"
    else
        yum install -y -q "$repo_url"
        yum install -y -q "postgresql${version}-server" "postgresql${version}-contrib"
    fi

    # Initialize database
    "/usr/pgsql-${version}/bin/postgresql-${version}-setup" initdb

    success "PostgreSQL installed via yum/dnf"
}

install_postgresql_macos() {
    local version=$1

    log "Installing PostgreSQL $version from source..."

    # Install dependencies
    if ! command_exists gcc; then
        error "GCC not found. Please install Xcode Command Line Tools."
        return 1
    fi

    # Download PostgreSQL source
    local temp_dir="/tmp/postgresql-install"
    mkdir -p "$temp_dir"

    local download_url="https://ftp.postgresql.org/pub/source/v${version}.0/postgresql-${version}.0.tar.gz"

    log "Downloading PostgreSQL from $download_url..."
    curl -fsSL "$download_url" -o "${temp_dir}/postgresql.tar.gz"

    # Extract
    tar -xzf "${temp_dir}/postgresql.tar.gz" -C "$temp_dir"
    cd "${temp_dir}/postgresql-${version}.0" || exit 1

    # Configure and compile
    log "Configuring PostgreSQL..."
    ./configure --prefix=/usr/local/pgsql

    log "Compiling PostgreSQL (this may take several minutes)..."
    make -s

    log "Installing PostgreSQL..."
    make install -s

    # Create postgres user
    if ! id -u postgres &>/dev/null; then
        log "Creating postgres user..."
        dscl . -create /Users/postgres
        dscl . -create /Users/postgres UserShell /bin/bash
        dscl . -create /Users/postgres RealName "PostgreSQL Server"
        dscl . -create /Users/postgres UniqueID 26
        dscl . -create /Users/postgres PrimaryGroupID 26
        dscl . -create /Users/postgres NFSHomeDirectory /usr/local/pgsql
    fi

    # Initialize database
    mkdir -p /usr/local/pgsql/data
    chown postgres:postgres /usr/local/pgsql/data

    # Cleanup
    cd / || exit 1
    rm -rf "$temp_dir"

    # Add to PATH
    if ! grep -q '/usr/local/pgsql/bin' /etc/paths; then
        echo '/usr/local/pgsql/bin' >> /etc/paths
    fi

    success "PostgreSQL installed on macOS"
}

configure_postgresql() {
    local version=$1

    log "Configuring PostgreSQL..."

    # Determine config directory
    local config_dir
    if [[ "$OS_DISTRO" == "macos" ]]; then
        config_dir="/usr/local/pgsql/data"
    elif [[ "$OS_DISTRO" =~ ^(fedora|centos|rhel)$ ]]; then
        config_dir="/var/lib/pgsql/${version}/data"
    else
        config_dir="/etc/postgresql/${version}/main"
    fi

    # Configure pg_hba.conf for local connections
    if [[ -f "${config_dir}/pg_hba.conf" ]]; then
        log "Configuring pg_hba.conf..."
        # Backup original
        cp "${config_dir}/pg_hba.conf" "${config_dir}/pg_hba.conf.backup"

        # Allow local connections
        cat >> "${config_dir}/pg_hba.conf" <<EOF

# Exprsn local connections
local   all             all                                     trust
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
EOF
    fi

    # Configure postgresql.conf
    if [[ -f "${config_dir}/postgresql.conf" ]]; then
        log "Configuring postgresql.conf..."
        # Backup original
        cp "${config_dir}/postgresql.conf" "${config_dir}/postgresql.conf.backup"

        # Update settings
        sed -i.bak "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "${config_dir}/postgresql.conf"
        sed -i.bak "s/#max_connections = 100/max_connections = 200/" "${config_dir}/postgresql.conf"
    fi

    success "PostgreSQL configured"
}

start_postgresql_service() {
    log "Starting PostgreSQL service..."

    if [[ "$OS_TYPE" == "Linux" ]]; then
        local service_name="postgresql"
        if [[ "$OS_DISTRO" =~ ^(fedora|centos|rhel)$ ]]; then
            service_name="postgresql-${POSTGRESQL_VERSION}"
        fi

        systemctl enable "$service_name"
        systemctl start "$service_name"
        systemctl status "$service_name" --no-pager || true
    elif [[ "$OS_TYPE" == "Darwin" ]]; then
        # Create launchd plist if it doesn't exist
        local plist_file="/Library/LaunchDaemons/com.postgresql.postgres.plist"
        if [[ ! -f "$plist_file" ]]; then
            cat > "$plist_file" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.postgresql.postgres</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/pgsql/bin/postgres</string>
        <string>-D</string>
        <string>/usr/local/pgsql/data</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>UserName</key>
    <string>postgres</string>
    <key>StandardErrorPath</key>
    <string>/usr/local/pgsql/data/postgres.log</string>
    <key>StandardOutPath</key>
    <string>/usr/local/pgsql/data/postgres.log</string>
</dict>
</plist>
EOF
            chmod 644 "$plist_file"
        fi

        launchctl load "$plist_file" 2>/dev/null || true
        launchctl start com.postgresql.postgres 2>/dev/null || true
    fi

    # Wait for PostgreSQL to start
    sleep 3

    success "PostgreSQL service started"
}
