#!/usr/bin/env bash

# ═══════════════════════════════════════════════════════════════════════
# Database Initialization Functions
# ═══════════════════════════════════════════════════════════════════════

initialize_databases() {
    log "Initializing Exprsn databases..."

    # Wait for PostgreSQL to be ready
    wait_for_postgresql

    # Create databases for all Exprsn services
    create_exprsn_databases

    # Import schema
    import_database_schema

    # Create database users
    create_database_users

    success "Databases initialized"
}

wait_for_postgresql() {
    log "Waiting for PostgreSQL to be ready..."

    local max_attempts=30
    local attempt=0

    while ! pg_isready -h localhost -U postgres &>/dev/null; do
        if [[ $attempt -ge $max_attempts ]]; then
            error "PostgreSQL did not become ready in time"
            return 1
        fi

        sleep 2
        ((attempt++))
    done

    success "PostgreSQL is ready"
}

create_exprsn_databases() {
    log "Creating Exprsn databases..."

    local databases=(
        "exprsn_ca"
        "exprsn_auth"
        "exprsn_spark"
        "exprsn_timeline"
        "exprsn_nexus"
        "exprsn_moderator"
        "exprsn_filevault"
        "exprsn_gallery"
        "exprsn_live"
        "exprsn_pulse"
        "exprsn_vault"
        "exprsn_herald"
        "exprsn_forge"
        "exprsn_workflow"
    )

    for db in "${databases[@]}"; do
        if ! psql -U postgres -lqt | cut -d \| -f 1 | grep -qw "$db"; then
            log "Creating database: $db"
            createdb -U postgres "$db"
        else
            log "Database $db already exists"
        fi
    done

    success "All Exprsn databases created"
}

import_database_schema() {
    log "Importing database schema..."

    local schema_file="${PROJECT_ROOT}/database/schema.sql"

    if [[ ! -f "$schema_file" ]]; then
        warn "Database schema file not found: $schema_file"
        return 0
    fi

    # Import schema to CA database
    log "Importing schema to exprsn_ca..."
    psql -U postgres -d exprsn_ca -f "$schema_file" -q

    success "Database schema imported"
}

create_database_users() {
    log "Creating database users..."

    # Create exprsn database user
    if ! psql -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='exprsn'" | grep -q 1; then
        log "Creating database user: exprsn"
        psql -U postgres -c "CREATE USER exprsn WITH PASSWORD 'exprsn_secure_password';"
    fi

    # Grant permissions
    local databases=(
        "exprsn_ca"
        "exprsn_auth"
        "exprsn_spark"
        "exprsn_timeline"
        "exprsn_nexus"
        "exprsn_moderator"
        "exprsn_filevault"
        "exprsn_gallery"
        "exprsn_live"
        "exprsn_pulse"
        "exprsn_vault"
        "exprsn_herald"
        "exprsn_forge"
        "exprsn_workflow"
    )

    for db in "${databases[@]}"; do
        log "Granting permissions on $db to user exprsn"
        psql -U postgres -d "$db" -c "GRANT ALL PRIVILEGES ON DATABASE $db TO exprsn;"
        psql -U postgres -d "$db" -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO exprsn;"
        psql -U postgres -d "$db" -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO exprsn;"
    done

    success "Database users created and permissions granted"
}

setup_database_backups() {
    log "Setting up database backups..."

    local backup_dir="/var/backups/exprsn"
    mkdir -p "$backup_dir"
    chown postgres:postgres "$backup_dir"
    chmod 700 "$backup_dir"

    # Create backup script
    cat > /usr/local/bin/exprsn-backup <<'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/exprsn"
DATE=$(date +%Y%m%d_%H%M%S)

# Backup all Exprsn databases
for db in exprsn_ca exprsn_auth exprsn_spark exprsn_timeline exprsn_nexus exprsn_moderator exprsn_filevault exprsn_gallery exprsn_live exprsn_pulse exprsn_vault exprsn_herald exprsn_forge exprsn_workflow; do
    pg_dump -U postgres "$db" | gzip > "${BACKUP_DIR}/${db}_${DATE}.sql.gz"
done

# Remove backups older than 7 days
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +7 -delete
EOF

    chmod +x /usr/local/bin/exprsn-backup

    # Add cron job for daily backups (Linux only)
    if [[ "$OS_TYPE" == "Linux" ]]; then
        (crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/exprsn-backup") | crontab -
        success "Daily backup cron job installed"
    fi

    success "Database backup system configured"
}
