#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# SSL/TLS Certificate Setup Functions
# ═══════════════════════════════════════════════════════════════════════

setup_ssl_certificates() {
    if [[ -z "$DOMAIN" ]]; then
        warn "No domain specified, skipping SSL setup"
        return 0
    fi

    log "Setting up SSL/TLS certificates for $DOMAIN..."

    # Check if certbot is available
    if ! command_exists certbot; then
        install_certbot
    fi

    # Obtain certificate
    obtain_certificate

    # Setup auto-renewal
    setup_certificate_renewal

    success "SSL/TLS certificates configured"
}

install_certbot() {
    log "Installing Certbot..."

    case "$OS_DISTRO" in
        ubuntu|debian)
            apt-get install -y -qq certbot
            if [[ "$WEB_SERVER" == "nginx" ]]; then
                apt-get install -y -qq python3-certbot-nginx
            else
                apt-get install -y -qq python3-certbot-apache
            fi
            ;;
        fedora|centos|rhel)
            if command_exists dnf; then
                dnf install -y -q certbot
                if [[ "$WEB_SERVER" == "nginx" ]]; then
                    dnf install -y -q python3-certbot-nginx
                else
                    dnf install -y -q python3-certbot-apache
                fi
            else
                yum install -y -q certbot
                if [[ "$WEB_SERVER" == "nginx" ]]; then
                    yum install -y -q python3-certbot-nginx
                else
                    yum install -y -q python3-certbot-apache
                fi
            fi
            ;;
        macos)
            warn "Certbot installation on macOS requires manual setup"
            return 1
            ;;
    esac

    success "Certbot installed"
}

obtain_certificate() {
    log "Obtaining SSL certificate for $DOMAIN..."

    local email_arg=""
    if [[ -n "$ADMIN_EMAIL" ]]; then
        email_arg="--email $ADMIN_EMAIL"
    else
        email_arg="--register-unsafely-without-email"
    fi

    if [[ "$WEB_SERVER" == "nginx" ]]; then
        certbot --nginx \
            $email_arg \
            --agree-tos \
            --no-eff-email \
            --redirect \
            -d "$DOMAIN" \
            --non-interactive
    else
        certbot --apache \
            $email_arg \
            --agree-tos \
            --no-eff-email \
            --redirect \
            -d "$DOMAIN" \
            --non-interactive
    fi

    success "SSL certificate obtained for $DOMAIN"
}

setup_certificate_renewal() {
    log "Setting up automatic certificate renewal..."

    # Certbot automatically sets up renewal on most systems
    # Verify renewal cron/timer exists
    if [[ "$OS_TYPE" == "Linux" ]]; then
        if systemctl list-timers | grep -q certbot; then
            log "Certbot renewal timer is active"
        else
            # Create cron job as fallback
            (crontab -l 2>/dev/null; echo "0 0,12 * * * /usr/bin/certbot renew --quiet") | crontab -
            log "Certbot renewal cron job created"
        fi
    fi

    # Test renewal
    certbot renew --dry-run

    success "Certificate auto-renewal configured"
}

create_self_signed_certificate() {
    local domain=${1:-localhost}

    log "Creating self-signed certificate for $domain..."

    local cert_dir="/etc/ssl/exprsn"
    mkdir -p "$cert_dir"

    # Generate private key
    openssl genrsa -out "${cert_dir}/private.key" 4096

    # Generate certificate
    openssl req -new -x509 \
        -key "${cert_dir}/private.key" \
        -out "${cert_dir}/certificate.crt" \
        -days 365 \
        -subj "/C=US/ST=State/L=City/O=Exprsn/CN=$domain"

    # Set permissions
    chmod 600 "${cert_dir}/private.key"
    chmod 644 "${cert_dir}/certificate.crt"

    success "Self-signed certificate created at $cert_dir"
}
