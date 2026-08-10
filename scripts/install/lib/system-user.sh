#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# System User Management Functions
# ═══════════════════════════════════════════════════════════════════════

create_system_user() {
    local username=${1:-exprsn}

    log "Creating system user: $username..."

    if id "$username" &>/dev/null; then
        success "User $username already exists"
        return 0
    fi

    case "$OS_DISTRO" in
        ubuntu|debian|fedora|centos|rhel)
            create_system_user_linux "$username"
            ;;
        macos)
            create_system_user_macos "$username"
            ;;
        *)
            error "Unsupported OS for user creation"
            return 1
            ;;
    esac

    # Create home directory structure
    local home_dir
    if [[ "$OS_DISTRO" == "macos" ]]; then
        home_dir="/Users/$username"
    else
        home_dir="/home/$username"
    fi

    mkdir -p "$home_dir"/{logs,data,tmp}
    chown -R "$username:$username" "$home_dir"

    success "System user $username created"
}

create_system_user_linux() {
    local username=$1

    # Create system user with home directory
    useradd \
        --system \
        --create-home \
        --home-dir "/home/$username" \
        --shell /bin/bash \
        --comment "Exprsn Service User" \
        "$username"

    # Add to necessary groups
    if getent group www-data &>/dev/null; then
        usermod -aG www-data "$username"
    fi

    if getent group postgres &>/dev/null; then
        usermod -aG postgres "$username"
    fi
}

create_system_user_macos() {
    local username=$1

    # Find next available UID
    local max_uid
    max_uid=$(dscl . -list /Users UniqueID | awk '{print $2}' | sort -n | tail -1)
    local new_uid=$((max_uid + 1))

    # Create user
    dscl . -create "/Users/$username"
    dscl . -create "/Users/$username" UserShell /bin/bash
    dscl . -create "/Users/$username" RealName "Exprsn Service User"
    dscl . -create "/Users/$username" UniqueID "$new_uid"
    dscl . -create "/Users/$username" PrimaryGroupID 20
    dscl . -create "/Users/$username" NFSHomeDirectory "/Users/$username"

    # Create home directory
    createhomedir -c -u "$username" 2>/dev/null || true
}

setup_user_permissions() {
    local username=${1:-exprsn}

    log "Setting up permissions for $username..."

    # Create necessary directories
    local directories=(
        "/var/log/exprsn"
        "/var/run/exprsn"
        "/etc/exprsn"
        "/opt/exprsn"
    )

    for dir in "${directories[@]}"; do
        mkdir -p "$dir"
        chown -R "$username:$username" "$dir"
        chmod 755 "$dir"
    done

    # Clone repository to user's home
    local home_dir
    if [[ "$OS_DISTRO" == "macos" ]]; then
        home_dir="/Users/$username"
    else
        home_dir="/home/$username"
    fi

    # Copy project files
    if [[ -d "$PROJECT_ROOT" ]]; then
        log "Copying project files to $home_dir/exprsn..."
        cp -R "$PROJECT_ROOT" "$home_dir/exprsn"
        chown -R "$username:$username" "$home_dir/exprsn"
    fi

    success "Permissions configured for $username"
}
