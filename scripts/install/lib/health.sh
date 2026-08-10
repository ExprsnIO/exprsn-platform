#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# Health Check Functions
# ═══════════════════════════════════════════════════════════════════════

run_health_checks() {
    log "Running health checks..."

    local all_healthy=true

    # Check PostgreSQL
    if ! check_postgresql_health; then
        all_healthy=false
    fi

    # Check Redis
    if ! check_redis_health; then
        all_healthy=false
    fi

    # Check Nginx/Apache
    if [[ "$INSTALL_WEBSERVER" == "true" ]]; then
        if ! check_webserver_health; then
            all_healthy=false
        fi
    fi

    # Check Exprsn services
    if ! check_exprsn_services_health; then
        all_healthy=false
    fi

    if [[ "$all_healthy" == "true" ]]; then
        success "All health checks passed"
        return 0
    else
        warn "Some health checks failed"
        return 1
    fi
}

check_postgresql_health() {
    log "Checking PostgreSQL health..."

    if ! pg_isready -h localhost -U postgres &>/dev/null; then
        error "PostgreSQL is not responding"
        return 1
    fi

    # Check if databases exist
    local missing_dbs=0
    for db in exprsn_ca exprsn_auth exprsn_spark exprsn_timeline; do
        if ! psql -U postgres -lqt | cut -d \| -f 1 | grep -qw "$db"; then
            warn "Database $db does not exist"
            ((missing_dbs++))
        fi
    done

    if [[ $missing_dbs -eq 0 ]]; then
        success "PostgreSQL is healthy"
        return 0
    else
        error "PostgreSQL has missing databases"
        return 1
    fi
}

check_redis_health() {
    log "Checking Redis health..."

    if ! redis-cli ping &>/dev/null; then
        error "Redis is not responding"
        return 1
    fi

    success "Redis is healthy"
    return 0
}

check_webserver_health() {
    log "Checking web server health..."

    if [[ "$WEB_SERVER" == "nginx" ]]; then
        if ! nginx -t &>/dev/null; then
            error "Nginx configuration test failed"
            return 1
        fi
    elif [[ "$WEB_SERVER" == "apache2" ]]; then
        if command_exists apache2ctl; then
            if ! apache2ctl configtest &>/dev/null; then
                error "Apache configuration test failed"
                return 1
            fi
        fi
    fi

    success "Web server is healthy"
    return 0
}

check_exprsn_services_health() {
    log "Checking Exprsn services health..."

    local unhealthy_services=0

    # Core services to check
    local services=(
        "exprsn-ca:3000"
        "exprsn-setup:3015"
    )

    for service_info in "${services[@]}"; do
        local service_name="${service_info%%:*}"
        local service_port="${service_info##*:}"

        # Check if port is listening
        if command_exists netstat; then
            if ! netstat -tuln | grep -q ":${service_port} "; then
                warn "Service $service_name is not listening on port $service_port"
                ((unhealthy_services++))
            fi
        elif command_exists ss; then
            if ! ss -tuln | grep -q ":${service_port} "; then
                warn "Service $service_name is not listening on port $service_port"
                ((unhealthy_services++))
            fi
        fi

        # Try HTTP health check
        if command_exists curl; then
            if curl -sf "http://localhost:${service_port}/health" &>/dev/null; then
                log "Service $service_name is responding"
            else
                warn "Service $service_name is not responding to health checks"
            fi
        fi
    done

    if [[ $unhealthy_services -eq 0 ]]; then
        success "Exprsn services are healthy"
        return 0
    else
        warn "$unhealthy_services service(s) are not healthy"
        return 1
    fi
}

print_service_status() {
    log "Service Status Summary:"

    if [[ "$OS_TYPE" == "Linux" ]]; then
        # PostgreSQL
        systemctl status postgresql --no-pager -l 2>/dev/null | head -5

        # Redis
        systemctl status redis --no-pager -l 2>/dev/null | head -5

        # Web server
        if [[ "$WEB_SERVER" == "nginx" ]]; then
            systemctl status nginx --no-pager -l 2>/dev/null | head -5
        else
            systemctl status apache2 --no-pager -l 2>/dev/null | head -5 || \
            systemctl status httpd --no-pager -l 2>/dev/null | head -5
        fi

        # Exprsn services
        for service in exprsn-ca exprsn-setup; do
            systemctl status "$service" --no-pager -l 2>/dev/null | head -3
        done
    elif [[ "$OS_TYPE" == "Darwin" ]]; then
        log "Use 'launchctl list | grep exprsn' to see service status"
    fi
}
