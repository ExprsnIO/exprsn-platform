#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# Redis Installation Functions
# ═══════════════════════════════════════════════════════════════════════

install_redis() {
    local version=${1:-7.2}

    if command_exists redis-server || command_exists redis-cli; then
        success "Redis is already installed"
        return 0
    fi

    case "$OS_DISTRO" in
        ubuntu|debian)
            install_redis_apt "$version"
            ;;
        fedora|centos|rhel)
            install_redis_yum "$version"
            ;;
        macos)
            install_redis_macos "$version"
            ;;
        *)
            error "Unsupported OS for Redis installation"
            return 1
            ;;
    esac

    # Configure Redis
    configure_redis

    # Start Redis service
    start_redis_service

    # Verify installation
    if ! command_exists redis-cli; then
        error "Redis installation failed"
        return 1
    fi

    success "Redis $version installed successfully"
}

install_redis_apt() {
    local version=$1

    log "Installing Redis from official repository..."

    # Add Redis repository
    curl -fsSL https://packages.redis.io/gpg | gpg --dearmor -o /etc/apt/keyrings/redis.gpg

    echo "deb [signed-by=/etc/apt/keyrings/redis.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" > \
        /etc/apt/sources.list.d/redis.list

    # Update and install
    apt-get update -qq
    apt-get install -y -qq redis-server redis-tools

    success "Redis installed via apt"
}

install_redis_yum() {
    local version=$1

    log "Installing Redis from EPEL repository..."

    # Enable EPEL repository
    if [[ "$OS_DISTRO" == "fedora" ]]; then
        if command_exists dnf; then
            dnf install -y -q redis
        fi
    else
        # RHEL/CentOS
        yum install -y -q epel-release
        yum install -y -q redis
    fi

    success "Redis installed via yum/dnf"
}

install_redis_macos() {
    local version=$1

    log "Installing Redis from source..."

    # Download Redis source
    local temp_dir="/tmp/redis-install"
    mkdir -p "$temp_dir"

    local download_url="https://download.redis.io/redis-stable.tar.gz"

    log "Downloading Redis from $download_url..."
    curl -fsSL "$download_url" -o "${temp_dir}/redis.tar.gz"

    # Extract
    tar -xzf "${temp_dir}/redis.tar.gz" -C "$temp_dir"
    cd "${temp_dir}/redis-stable" || exit 1

    # Compile
    log "Compiling Redis..."
    make -s

    # Install
    log "Installing Redis..."
    make install PREFIX=/usr/local

    # Create directories
    mkdir -p /usr/local/etc/redis
    mkdir -p /var/lib/redis
    mkdir -p /var/log/redis

    # Copy default config
    cp redis.conf /usr/local/etc/redis/redis.conf

    # Cleanup
    cd / || exit 1
    rm -rf "$temp_dir"

    success "Redis installed on macOS"
}

configure_redis() {
    log "Configuring Redis..."

    local config_file
    if [[ "$OS_DISTRO" == "macos" ]]; then
        config_file="/usr/local/etc/redis/redis.conf"
    elif [[ -f "/etc/redis/redis.conf" ]]; then
        config_file="/etc/redis/redis.conf"
    else
        config_file="/etc/redis.conf"
    fi

    if [[ -f "$config_file" ]]; then
        # Backup original
        cp "$config_file" "${config_file}.backup"

        # Configure for production
        sed -i.bak 's/^bind 127.0.0.1/bind 127.0.0.1/' "$config_file"
        sed -i.bak 's/^# requirepass foobared/requirepass exprsn_redis_password/' "$config_file"
        sed -i.bak 's/^appendonly no/appendonly yes/' "$config_file"
        sed -i.bak 's/^# maxmemory <bytes>/maxmemory 256mb/' "$config_file"
        sed -i.bak 's/^# maxmemory-policy noeviction/maxmemory-policy allkeys-lru/' "$config_file"

        success "Redis configured"
    else
        warn "Redis configuration file not found"
    fi
}

start_redis_service() {
    log "Starting Redis service..."

    if [[ "$OS_TYPE" == "Linux" ]]; then
        systemctl enable redis
        systemctl start redis
        systemctl status redis --no-pager || true
    elif [[ "$OS_TYPE" == "Darwin" ]]; then
        # Create launchd plist
        local plist_file="/Library/LaunchDaemons/io.redis.redis-server.plist"
        cat > "$plist_file" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>io.redis.redis-server</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/redis-server</string>
        <string>/usr/local/etc/redis/redis.conf</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardErrorPath</key>
    <string>/var/log/redis/redis.log</string>
    <key>StandardOutPath</key>
    <string>/var/log/redis/redis.log</string>
</dict>
</plist>
EOF
        chmod 644 "$plist_file"

        launchctl load "$plist_file" 2>/dev/null || true
        launchctl start io.redis.redis-server 2>/dev/null || true
    fi

    # Wait for Redis to start
    sleep 2

    success "Redis service started"
}
