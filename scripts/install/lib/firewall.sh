#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# Firewall Configuration Functions
# ═══════════════════════════════════════════════════════════════════════

configure_firewall() {
    log "Configuring firewall..."

    case "$OS_DISTRO" in
        ubuntu|debian)
            configure_ufw
            ;;
        fedora|centos|rhel)
            configure_firewalld
            ;;
        macos)
            configure_pf
            ;;
        *)
            warn "Firewall configuration not supported for $OS_DISTRO"
            return 0
            ;;
    esac

    success "Firewall configured"
}

configure_ufw() {
    log "Configuring UFW firewall..."

    # Install UFW if not present
    if ! command_exists ufw; then
        apt-get install -y -qq ufw
    fi

    # Default policies
    ufw --force default deny incoming
    ufw --force default allow outgoing

    # Allow SSH
    ufw allow 22/tcp comment 'SSH'

    # Allow HTTP and HTTPS
    ufw allow 80/tcp comment 'HTTP'
    ufw allow 443/tcp comment 'HTTPS'

    # Allow PostgreSQL (local only)
    ufw allow from 127.0.0.1 to any port 5432 comment 'PostgreSQL'

    # Allow Redis (local only)
    ufw allow from 127.0.0.1 to any port 6379 comment 'Redis'

    # Allow Exprsn services (adjust as needed for your setup)
    # For development, you might want to allow external access
    if [[ "$ENVIRONMENT" == "development" ]]; then
        ufw allow 3000:3020/tcp comment 'Exprsn Services'
        ufw allow 5000/tcp comment 'Exprsn SVR'
    fi

    # Enable firewall
    ufw --force enable

    # Show status
    ufw status verbose

    success "UFW firewall configured"
}

configure_firewalld() {
    log "Configuring firewalld..."

    # Install firewalld if not present
    if ! command_exists firewall-cmd; then
        if command_exists dnf; then
            dnf install -y -q firewalld
        else
            yum install -y -q firewalld
        fi
    fi

    # Start firewalld
    systemctl enable firewalld
    systemctl start firewalld

    # Allow HTTP and HTTPS
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https

    # Allow SSH
    firewall-cmd --permanent --add-service=ssh

    # Allow Exprsn services for development
    if [[ "$ENVIRONMENT" == "development" ]]; then
        firewall-cmd --permanent --add-port=3000-3020/tcp
        firewall-cmd --permanent --add-port=5000/tcp
    fi

    # Reload firewall
    firewall-cmd --reload

    # Show status
    firewall-cmd --list-all

    success "Firewalld configured"
}

configure_pf() {
    log "Configuring macOS packet filter (pf)..."

    # Create pf configuration for Exprsn
    local pf_conf="/etc/pf.anchors/exprsn"

    cat > "$pf_conf" <<'EOF'
# Exprsn packet filter rules

# Allow all on loopback
pass on lo0

# Allow established connections
pass out proto tcp from any to any
pass out proto udp from any to any

# Allow SSH
pass in proto tcp from any to any port 22

# Allow HTTP and HTTPS
pass in proto tcp from any to any port 80
pass in proto tcp from any to any port 443

# Allow Exprsn services (development)
pass in proto tcp from any to any port 3000:3020
pass in proto tcp from any to any port 5000
EOF

    # Add anchor to main pf.conf if not already present
    if ! grep -q "anchor \"exprsn\"" /etc/pf.conf; then
        echo 'anchor "exprsn"' >> /etc/pf.conf
        echo 'load anchor "exprsn" from "/etc/pf.anchors/exprsn"' >> /etc/pf.conf
    fi

    # Enable pf
    pfctl -e -f /etc/pf.conf 2>/dev/null || true

    success "macOS packet filter configured"
}

disable_selinux() {
    # Disable SELinux if present (optional, for easier setup)
    if command_exists getenforce; then
        local selinux_status
        selinux_status=$(getenforce)

        if [[ "$selinux_status" != "Disabled" ]]; then
            warn "SELinux is enabled. Consider disabling for easier setup."

            if [[ "$INTERACTIVE" == "true" ]]; then
                read -rp "Disable SELinux? (y/N) " response
                if [[ "$response" =~ ^[Yy]$ ]]; then
                    setenforce 0
                    sed -i 's/^SELINUX=enforcing/SELINUX=disabled/' /etc/selinux/config
                    success "SELinux disabled (requires reboot)"
                fi
            fi
        fi
    fi
}
