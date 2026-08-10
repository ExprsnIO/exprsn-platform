#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# Exprsn Services Setup Functions
# ═══════════════════════════════════════════════════════════════════════

setup_exprsn_services() {
    log "Setting up Exprsn services..."

    local username=${INSTALL_USER:-exprsn}
    local home_dir
    if [[ "$OS_DISTRO" == "macos" ]]; then
        home_dir="/Users/$username"
    else
        home_dir="/home/$username"
    fi

    local exprsn_dir="$home_dir/exprsn"

    # Install Node.js dependencies
    install_exprsn_dependencies "$exprsn_dir"

    # Generate environment files
    generate_environment_files "$exprsn_dir"

    # Initialize system
    initialize_exprsn_system "$exprsn_dir"

    # Create systemd/launchd service files
    create_service_files

    success "Exprsn services configured"
}

install_exprsn_dependencies() {
    local exprsn_dir=$1

    log "Installing Node.js dependencies..."

    cd "$exprsn_dir" || return 1

    # Install root dependencies
    npm install --production

    # Install workspace dependencies
    npm run install:all

    success "Dependencies installed"
}

generate_environment_files() {
    local exprsn_dir=$1

    log "Generating environment configuration files..."

    cd "$exprsn_dir" || return 1

    # Copy environment template
    if [[ ! -f ".env" ]]; then
        if [[ "$ENVIRONMENT" == "production" ]]; then
            cp ".env.production.example" ".env" 2>/dev/null || cp ".env.example" ".env"
        else
            cp ".env.development.example" ".env" 2>/dev/null || cp ".env.example" ".env"
        fi

        # Update environment file with installation-specific values
        sed -i.bak "s/NODE_ENV=development/NODE_ENV=$ENVIRONMENT/" .env
        sed -i.bak "s/DB_HOST=localhost/DB_HOST=localhost/" .env
        sed -i.bak "s/REDIS_HOST=localhost/REDIS_HOST=localhost/" .env

        success "Environment file created"
    else
        log "Environment file already exists"
    fi
}

initialize_exprsn_system() {
    local exprsn_dir=$1

    log "Initializing Exprsn system..."

    cd "$exprsn_dir" || return 1

    # Run initialization script
    if [[ "$ENVIRONMENT" == "production" ]]; then
        npm run init:prod
    else
        npm run init:dev
    fi

    success "Exprsn system initialized"
}

create_service_files() {
    log "Creating service files..."

    if [[ "$OS_TYPE" == "Linux" ]]; then
        create_systemd_services
    elif [[ "$OS_TYPE" == "Darwin" ]]; then
        create_launchd_services
    fi

    success "Service files created"
}

create_systemd_services() {
    log "Creating systemd service files..."

    local username=${INSTALL_USER:-exprsn}
    local home_dir="/home/$username"
    local exprsn_dir="$home_dir/exprsn"

    # Define all Exprsn services
    local services=(
        "exprsn-ca:3000"
        "exprsn-setup:3015"
        "exprsn-auth:3001"
        "exprsn-spark:3002"
        "exprsn-timeline:3004"
        "exprsn-prefetch:3005"
        "exprsn-moderator:3006"
        "exprsn-filevault:3007"
        "exprsn-gallery:3008"
        "exprsn-live:3009"
        "exprsn-bridge:3010"
        "exprsn-nexus:3011"
        "exprsn-pulse:3012"
        "exprsn-vault:3013"
        "exprsn-herald:3014"
        "exprsn-forge:3016"
        "exprsn-workflow:3017"
        "exprsn-svr:5000"
    )

    for service_info in "${services[@]}"; do
        local service_name="${service_info%%:*}"
        local service_port="${service_info##*:}"
        local service_dir="${service_name/exprsn-/}"

        # Create systemd service file
        cat > "/etc/systemd/system/${service_name}.service" <<EOF
[Unit]
Description=Exprsn ${service_name} Service
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=$username
WorkingDirectory=${exprsn_dir}/src/${service_name}
Environment=NODE_ENV=$ENVIRONMENT
Environment=PORT=$service_port
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${service_name}

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/log/exprsn /var/run/exprsn ${exprsn_dir}

[Install]
WantedBy=multi-user.target
EOF

        log "Created systemd service: ${service_name}"
    done

    # Reload systemd
    systemctl daemon-reload

    success "Systemd services created"
}

create_launchd_services() {
    log "Creating launchd service files..."

    local username=${INSTALL_USER:-exprsn}
    local home_dir="/Users/$username"
    local exprsn_dir="$home_dir/exprsn"

    # Define all Exprsn services
    local services=(
        "exprsn-ca:3000"
        "exprsn-setup:3015"
        "exprsn-auth:3001"
        "exprsn-spark:3002"
        "exprsn-timeline:3004"
        "exprsn-prefetch:3005"
        "exprsn-moderator:3006"
        "exprsn-filevault:3007"
        "exprsn-gallery:3008"
        "exprsn-live:3009"
        "exprsn-bridge:3010"
        "exprsn-nexus:3011"
        "exprsn-pulse:3012"
        "exprsn-vault:3013"
        "exprsn-herald:3014"
        "exprsn-forge:3016"
        "exprsn-workflow:3017"
        "exprsn-svr:5000"
    )

    for service_info in "${services[@]}"; do
        local service_name="${service_info%%:*}"
        local service_port="${service_info##*:}"
        local plist_name="io.exprsn.${service_name}"

        # Create launchd plist file
        cat > "/Library/LaunchDaemons/${plist_name}.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${plist_name}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>index.js</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${exprsn_dir}/src/${service_name}</string>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>UserName</key>
    <string>${username}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>NODE_ENV</key>
        <string>${ENVIRONMENT}</string>
        <key>PORT</key>
        <string>${service_port}</string>
    </dict>
    <key>StandardErrorPath</key>
    <string>/var/log/exprsn/${service_name}.log</string>
    <key>StandardOutPath</key>
    <string>/var/log/exprsn/${service_name}.log</string>
</dict>
</plist>
EOF

        chmod 644 "/Library/LaunchDaemons/${plist_name}.plist"
        log "Created launchd service: ${plist_name}"
    done

    success "Launchd services created"
}

start_all_services() {
    log "Starting Exprsn services..."

    if [[ "$OS_TYPE" == "Linux" ]]; then
        start_systemd_services
    elif [[ "$OS_TYPE" == "Darwin" ]]; then
        start_launchd_services
    fi

    success "All services started"
}

start_systemd_services() {
    local services=(
        "exprsn-ca"
        "exprsn-setup"
        "exprsn-auth"
        "exprsn-spark"
        "exprsn-timeline"
        "exprsn-prefetch"
        "exprsn-moderator"
        "exprsn-filevault"
        "exprsn-gallery"
        "exprsn-live"
        "exprsn-bridge"
        "exprsn-nexus"
        "exprsn-pulse"
        "exprsn-vault"
        "exprsn-herald"
        "exprsn-forge"
        "exprsn-workflow"
        "exprsn-svr"
    )

    for service in "${services[@]}"; do
        log "Enabling and starting $service..."
        systemctl enable "$service"
        systemctl start "$service"
    done
}

start_launchd_services() {
    local services=(
        "io.exprsn.exprsn-ca"
        "io.exprsn.exprsn-setup"
        "io.exprsn.exprsn-auth"
        "io.exprsn.exprsn-spark"
        "io.exprsn.exprsn-timeline"
        "io.exprsn.exprsn-prefetch"
        "io.exprsn.exprsn-moderator"
        "io.exprsn.exprsn-filevault"
        "io.exprsn.exprsn-gallery"
        "io.exprsn.exprsn-live"
        "io.exprsn.exprsn-bridge"
        "io.exprsn.exprsn-nexus"
        "io.exprsn.exprsn-pulse"
        "io.exprsn.exprsn-vault"
        "io.exprsn.exprsn-herald"
        "io.exprsn.exprsn-forge"
        "io.exprsn.exprsn-workflow"
        "io.exprsn.exprsn-svr"
    )

    for service in "${services[@]}"; do
        log "Loading $service..."
        launchctl load "/Library/LaunchDaemons/${service}.plist" 2>/dev/null || true
        launchctl start "$service" 2>/dev/null || true
    done
}
