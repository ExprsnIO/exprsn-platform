#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# Web Server Installation Functions
# ═══════════════════════════════════════════════════════════════════════

install_webserver() {
    local server_type=$1

    case "$server_type" in
        nginx)
            install_nginx
            ;;
        apache2)
            install_apache2
            ;;
        *)
            error "Unknown web server type: $server_type"
            return 1
            ;;
    esac
}

install_nginx() {
    log "Installing Nginx..."

    if command_exists nginx; then
        success "Nginx is already installed"
        return 0
    fi

    case "$OS_DISTRO" in
        ubuntu|debian)
            install_nginx_apt
            ;;
        fedora|centos|rhel)
            install_nginx_yum
            ;;
        macos)
            install_nginx_macos
            ;;
        *)
            error "Unsupported OS for Nginx installation"
            return 1
            ;;
    esac

    # Verify installation
    if ! command_exists nginx; then
        error "Nginx installation failed"
        return 1
    fi

    success "Nginx installed successfully"
}

install_nginx_apt() {
    log "Installing Nginx from official repository..."

    # Add Nginx repository
    add_apt_repository_key \
        "https://nginx.org/keys/nginx_signing.key" \
        "/etc/apt/keyrings/nginx.gpg"

    local codename
    codename=$(lsb_release -cs)

    echo "deb [signed-by=/etc/apt/keyrings/nginx.gpg] http://nginx.org/packages/${OS_DISTRO}/ ${codename} nginx" > \
        /etc/apt/sources.list.d/nginx.list

    apt-get update -qq
    apt-get install -y -qq nginx

    success "Nginx installed via apt"
}

install_nginx_yum() {
    log "Installing Nginx from EPEL repository..."

    if [[ "$OS_DISTRO" == "fedora" ]]; then
        dnf install -y -q nginx
    else
        yum install -y -q epel-release
        yum install -y -q nginx
    fi

    success "Nginx installed via yum/dnf"
}

install_nginx_macos() {
    log "Installing Nginx from source..."

    local temp_dir="/tmp/nginx-install"
    mkdir -p "$temp_dir"

    # Download Nginx
    local nginx_version="1.24.0"
    local download_url="https://nginx.org/download/nginx-${nginx_version}.tar.gz"

    log "Downloading Nginx from $download_url..."
    curl -fsSL "$download_url" -o "${temp_dir}/nginx.tar.gz"

    # Extract
    tar -xzf "${temp_dir}/nginx.tar.gz" -C "$temp_dir"
    cd "${temp_dir}/nginx-${nginx_version}" || exit 1

    # Configure
    ./configure \
        --prefix=/usr/local/nginx \
        --conf-path=/usr/local/etc/nginx/nginx.conf \
        --sbin-path=/usr/local/bin/nginx \
        --pid-path=/var/run/nginx.pid \
        --error-log-path=/var/log/nginx/error.log \
        --http-log-path=/var/log/nginx/access.log \
        --with-http_ssl_module \
        --with-http_v2_module \
        --with-http_realip_module \
        --with-http_gzip_static_module

    # Compile and install
    make -s
    make install -s

    # Create directories
    mkdir -p /usr/local/etc/nginx/sites-available
    mkdir -p /usr/local/etc/nginx/sites-enabled
    mkdir -p /var/log/nginx

    # Cleanup
    cd / || exit 1
    rm -rf "$temp_dir"

    success "Nginx installed on macOS"
}

install_apache2() {
    log "Installing Apache2..."

    if command_exists apache2 || command_exists httpd; then
        success "Apache2 is already installed"
        return 0
    fi

    case "$OS_DISTRO" in
        ubuntu|debian)
            apt-get install -y -qq apache2
            ;;
        fedora|centos|rhel)
            if command_exists dnf; then
                dnf install -y -q httpd
            else
                yum install -y -q httpd
            fi
            ;;
        macos)
            # Apache is built into macOS
            success "Apache is pre-installed on macOS"
            return 0
            ;;
        *)
            error "Unsupported OS for Apache2 installation"
            return 1
            ;;
    esac

    success "Apache2 installed successfully"
}

configure_webserver() {
    local server_type=$1

    case "$server_type" in
        nginx)
            configure_nginx
            ;;
        apache2)
            configure_apache2
            ;;
    esac
}

configure_nginx() {
    log "Configuring Nginx..."

    local config_dir
    if [[ "$OS_DISTRO" == "macos" ]]; then
        config_dir="/usr/local/etc/nginx"
    else
        config_dir="/etc/nginx"
    fi

    # Create sites directories if they don't exist
    mkdir -p "${config_dir}/sites-available"
    mkdir -p "${config_dir}/sites-enabled"

    # Copy Exprsn configuration
    cp "${CONFIG_DIR}/nginx/exprsn.conf" "${config_dir}/sites-available/exprsn.conf"

    # Enable site
    ln -sf "${config_dir}/sites-available/exprsn.conf" "${config_dir}/sites-enabled/exprsn.conf"

    # Update main nginx.conf to include sites-enabled
    if ! grep -q "sites-enabled" "${config_dir}/nginx.conf"; then
        sed -i.bak '/http {/a\    include /etc/nginx/sites-enabled/*;' "${config_dir}/nginx.conf"
    fi

    # Test configuration
    nginx -t

    # Reload nginx
    if [[ "$OS_TYPE" == "Linux" ]]; then
        systemctl enable nginx
        systemctl reload nginx
    elif [[ "$OS_TYPE" == "Darwin" ]]; then
        nginx -s reload
    fi

    success "Nginx configured"
}

configure_apache2() {
    log "Configuring Apache2..."

    local config_dir
    local service_name

    if [[ "$OS_DISTRO" =~ ^(ubuntu|debian)$ ]]; then
        config_dir="/etc/apache2/sites-available"
        service_name="apache2"
    elif [[ "$OS_DISTRO" =~ ^(fedora|centos|rhel)$ ]]; then
        config_dir="/etc/httpd/conf.d"
        service_name="httpd"
    fi

    # Copy Exprsn configuration
    cp "${CONFIG_DIR}/apache2/exprsn.conf" "${config_dir}/exprsn.conf"

    # Enable modules
    if command_exists a2enmod; then
        a2enmod proxy
        a2enmod proxy_http
        a2enmod proxy_wstunnel
        a2enmod ssl
        a2enmod rewrite
        a2enmod headers
    fi

    # Enable site (Debian/Ubuntu)
    if command_exists a2ensite; then
        a2ensite exprsn.conf
    fi

    # Test configuration
    if command_exists apache2ctl; then
        apache2ctl configtest
    elif command_exists apachectl; then
        apachectl configtest
    fi

    # Reload Apache
    if [[ "$OS_TYPE" == "Linux" ]]; then
        systemctl enable "$service_name"
        systemctl reload "$service_name"
    fi

    success "Apache2 configured"
}

install_rabbitmq() {
    log "Installing RabbitMQ..."

    if command_exists rabbitmq-server || command_exists rabbitmqctl; then
        success "RabbitMQ is already installed"
        return 0
    fi

    case "$OS_DISTRO" in
        ubuntu|debian)
            install_rabbitmq_apt
            ;;
        fedora|centos|rhel)
            install_rabbitmq_yum
            ;;
        macos)
            warn "RabbitMQ installation on macOS requires manual setup"
            return 0
            ;;
        *)
            error "Unsupported OS for RabbitMQ installation"
            return 1
            ;;
    esac

    # Enable management plugin
    rabbitmq-plugins enable rabbitmq_management

    # Start RabbitMQ
    if [[ "$OS_TYPE" == "Linux" ]]; then
        systemctl enable rabbitmq-server
        systemctl start rabbitmq-server
    fi

    success "RabbitMQ installed successfully"
}

install_rabbitmq_apt() {
    log "Installing RabbitMQ from official repository..."

    # Add RabbitMQ repository
    curl -fsSL https://github.com/rabbitmq/signing-keys/releases/download/2.0/rabbitmq-release-signing-key.asc | \
        gpg --dearmor -o /etc/apt/keyrings/rabbitmq.gpg

    local codename
    codename=$(lsb_release -cs)

    echo "deb [signed-by=/etc/apt/keyrings/rabbitmq.gpg] https://dl.cloudsmith.io/public/rabbitmq/rabbitmq-server/deb/ubuntu ${codename} main" > \
        /etc/apt/sources.list.d/rabbitmq.list

    apt-get update -qq
    apt-get install -y -qq rabbitmq-server

    success "RabbitMQ installed via apt"
}

install_rabbitmq_yum() {
    log "Installing RabbitMQ from official repository..."

    if command_exists dnf; then
        dnf install -y -q rabbitmq-server
    else
        yum install -y -q rabbitmq-server
    fi

    success "RabbitMQ installed via yum/dnf"
}

install_postfix() {
    log "Installing Postfix..."

    case "$OS_DISTRO" in
        ubuntu|debian)
            DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postfix
            ;;
        fedora|centos|rhel)
            if command_exists dnf; then
                dnf install -y -q postfix
            else
                yum install -y -q postfix
            fi
            ;;
        macos)
            success "Postfix is pre-installed on macOS"
            return 0
            ;;
    esac

    # Start postfix
    if [[ "$OS_TYPE" == "Linux" ]]; then
        systemctl enable postfix
        systemctl start postfix
    fi

    success "Postfix installed successfully"
}

install_dovecot() {
    log "Installing Dovecot..."

    case "$OS_DISTRO" in
        ubuntu|debian)
            apt-get install -y -qq dovecot-core dovecot-imapd
            ;;
        fedora|centos|rhel)
            if command_exists dnf; then
                dnf install -y -q dovecot
            else
                yum install -y -q dovecot
            fi
            ;;
        macos)
            warn "Dovecot installation on macOS requires manual setup"
            return 0
            ;;
    esac

    # Start dovecot
    if [[ "$OS_TYPE" == "Linux" ]]; then
        systemctl enable dovecot
        systemctl start dovecot
    fi

    success "Dovecot installed successfully"
}
