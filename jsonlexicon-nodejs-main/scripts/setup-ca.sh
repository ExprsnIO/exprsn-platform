#!/bin/bash
# Exprsn Certificate Authority Setup Script
# This script creates a complete CA hierarchy using OpenSSL

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CA_ROOT_DIR="./certs/root-ca"
CA_INTERMEDIATE_DIR="./certs/intermediate"
CA_SERVER_DIR="./certs/server"
OPENSSL_CNF="./certs/openssl.cnf"

# Key parameters
ROOT_KEY_BITS=4096
INTERMEDIATE_KEY_BITS=4096
SERVER_KEY_BITS=2048
ROOT_VALID_DAYS=7300  # 20 years
INTERMEDIATE_VALID_DAYS=3650  # 10 years
SERVER_VALID_DAYS=365  # 1 year

echo -e "${GREEN}=== Exprsn Certificate Authority Setup ===${NC}"
echo ""

# Function to create directory structure
create_directory_structure() {
    echo -e "${YELLOW}Creating directory structure...${NC}"

    mkdir -p "$CA_ROOT_DIR"/{private,certs,crl,newcerts}
    mkdir -p "$CA_INTERMEDIATE_DIR"/{private,certs,crl,newcerts,csr}
    mkdir -p "$CA_SERVER_DIR"/{private,certs,csr}

    chmod 700 "$CA_ROOT_DIR/private"
    chmod 700 "$CA_INTERMEDIATE_DIR/private"
    chmod 700 "$CA_SERVER_DIR/private"

    # Create database files
    touch "$CA_ROOT_DIR/index.txt"
    touch "$CA_INTERMEDIATE_DIR/index.txt"
    echo 1000 > "$CA_ROOT_DIR/serial"
    echo 1000 > "$CA_INTERMEDIATE_DIR/serial"
    echo 1000 > "$CA_ROOT_DIR/crlnumber"
    echo 1000 > "$CA_INTERMEDIATE_DIR/crlnumber"

    echo -e "${GREEN}✓ Directory structure created${NC}"
}

# Function to create Root CA
create_root_ca() {
    echo -e "${YELLOW}Creating Root CA...${NC}"

    if [ -f "$CA_ROOT_DIR/private/ca.key" ]; then
        echo -e "${YELLOW}Root CA key already exists, skipping...${NC}"
        return
    fi

    # Generate root CA private key
    openssl genrsa -aes256 \
        -out "$CA_ROOT_DIR/private/ca.key" \
        -passout pass:exprsn-root-ca-password \
        $ROOT_KEY_BITS

    chmod 400 "$CA_ROOT_DIR/private/ca.key"

    # Generate root CA certificate
    openssl req -config "$OPENSSL_CNF" \
        -key "$CA_ROOT_DIR/private/ca.key" \
        -passin pass:exprsn-root-ca-password \
        -new -x509 -days $ROOT_VALID_DAYS -sha256 \
        -extensions v3_ca \
        -out "$CA_ROOT_DIR/certs/ca.crt" \
        -subj "/C=US/ST=California/L=San Francisco/O=Exprsn/OU=Exprsn Root CA/CN=Exprsn Root Certificate Authority"

    chmod 444 "$CA_ROOT_DIR/certs/ca.crt"

    echo -e "${GREEN}✓ Root CA created${NC}"

    # Verify root certificate
    openssl x509 -noout -text -in "$CA_ROOT_DIR/certs/ca.crt" > /dev/null
    echo -e "${GREEN}✓ Root CA certificate verified${NC}"
}

# Function to create Intermediate CA
create_intermediate_ca() {
    echo -e "${YELLOW}Creating Intermediate CA...${NC}"

    if [ -f "$CA_INTERMEDIATE_DIR/private/intermediate.key" ]; then
        echo -e "${YELLOW}Intermediate CA key already exists, skipping...${NC}"
        return
    fi

    # Generate intermediate CA private key
    openssl genrsa -aes256 \
        -out "$CA_INTERMEDIATE_DIR/private/intermediate.key" \
        -passout pass:exprsn-intermediate-ca-password \
        $INTERMEDIATE_KEY_BITS

    chmod 400 "$CA_INTERMEDIATE_DIR/private/intermediate.key"

    # Generate intermediate CA CSR
    openssl req -config "$OPENSSL_CNF" \
        -new -sha256 \
        -key "$CA_INTERMEDIATE_DIR/private/intermediate.key" \
        -passin pass:exprsn-intermediate-ca-password \
        -out "$CA_INTERMEDIATE_DIR/csr/intermediate.csr" \
        -subj "/C=US/ST=California/L=San Francisco/O=Exprsn/OU=Exprsn Intermediate CA/CN=Exprsn Intermediate Certificate Authority"

    # Sign intermediate certificate with root CA
    openssl ca -config "$OPENSSL_CNF" \
        -extensions v3_intermediate_ca \
        -days $INTERMEDIATE_VALID_DAYS -notext -md sha256 \
        -in "$CA_INTERMEDIATE_DIR/csr/intermediate.csr" \
        -out "$CA_INTERMEDIATE_DIR/certs/intermediate.crt" \
        -cert "$CA_ROOT_DIR/certs/ca.crt" \
        -keyfile "$CA_ROOT_DIR/private/ca.key" \
        -passin pass:exprsn-root-ca-password \
        -batch

    chmod 444 "$CA_INTERMEDIATE_DIR/certs/intermediate.crt"

    # Copy intermediate cert to main location
    cp "$CA_INTERMEDIATE_DIR/certs/intermediate.crt" "$CA_INTERMEDIATE_DIR/intermediate.crt"
    cp "$CA_INTERMEDIATE_DIR/private/intermediate.key" "$CA_INTERMEDIATE_DIR/intermediate.key"

    echo -e "${GREEN}✓ Intermediate CA created${NC}"

    # Verify intermediate certificate
    openssl x509 -noout -text -in "$CA_INTERMEDIATE_DIR/intermediate.crt" > /dev/null
    echo -e "${GREEN}✓ Intermediate CA certificate verified${NC}"

    # Create certificate chain
    cat "$CA_INTERMEDIATE_DIR/intermediate.crt" \
        "$CA_ROOT_DIR/certs/ca.crt" > "$CA_INTERMEDIATE_DIR/ca-chain.crt"
    chmod 444 "$CA_INTERMEDIATE_DIR/ca-chain.crt"

    echo -e "${GREEN}✓ Certificate chain created${NC}"
}

# Function to create server certificate
create_server_certificate() {
    echo -e "${YELLOW}Creating server certificate...${NC}"

    if [ -f "$CA_SERVER_DIR/private/server.key" ]; then
        echo -e "${YELLOW}Server certificate already exists, skipping...${NC}"
        return
    fi

    # Generate server private key (no passphrase for server certs)
    openssl genrsa \
        -out "$CA_SERVER_DIR/private/server.key" \
        $SERVER_KEY_BITS

    chmod 400 "$CA_SERVER_DIR/private/server.key"

    # Generate server CSR
    openssl req -config "$OPENSSL_CNF" \
        -key "$CA_SERVER_DIR/private/server.key" \
        -new -sha256 \
        -out "$CA_SERVER_DIR/csr/server.csr" \
        -subj "/C=US/ST=California/L=San Francisco/O=Exprsn/OU=Exprsn Server/CN=api.exprsn.local"

    # Sign server certificate with intermediate CA
    openssl ca -config "$OPENSSL_CNF" \
        -extensions server_cert \
        -days $SERVER_VALID_DAYS -notext -md sha256 \
        -in "$CA_SERVER_DIR/csr/server.csr" \
        -out "$CA_SERVER_DIR/certs/server.crt" \
        -cert "$CA_INTERMEDIATE_DIR/intermediate.crt" \
        -keyfile "$CA_INTERMEDIATE_DIR/intermediate.key" \
        -passin pass:exprsn-intermediate-ca-password \
        -batch

    chmod 444 "$CA_SERVER_DIR/certs/server.crt"

    # Copy server cert to main location
    cp "$CA_SERVER_DIR/certs/server.crt" "$CA_SERVER_DIR/server.crt"
    cp "$CA_SERVER_DIR/private/server.key" "$CA_SERVER_DIR/server.key"

    echo -e "${GREEN}✓ Server certificate created${NC}"

    # Verify server certificate
    openssl verify -CAfile "$CA_INTERMEDIATE_DIR/ca-chain.crt" \
        "$CA_SERVER_DIR/server.crt"

    echo -e "${GREEN}✓ Server certificate verified${NC}"

    # Copy certificates to nginx SSL directory
    if [ -d "./nginx/ssl" ]; then
        cp "$CA_SERVER_DIR/server.crt" "./nginx/ssl/server.crt"
        cp "$CA_SERVER_DIR/server.key" "./nginx/ssl/server.key"
        cp "$CA_ROOT_DIR/certs/ca.crt" "./nginx/ssl/ca.crt"
        echo -e "${GREEN}✓ Certificates copied to nginx/ssl${NC}"
    fi
}

# Function to display certificate info
display_certificate_info() {
    echo -e "${GREEN}=== Certificate Information ===${NC}"
    echo ""

    echo -e "${YELLOW}Root CA:${NC}"
    openssl x509 -noout -subject -issuer -dates \
        -in "$CA_ROOT_DIR/certs/ca.crt"
    echo ""

    echo -e "${YELLOW}Intermediate CA:${NC}"
    openssl x509 -noout -subject -issuer -dates \
        -in "$CA_INTERMEDIATE_DIR/intermediate.crt"
    echo ""

    echo -e "${YELLOW}Server Certificate:${NC}"
    openssl x509 -noout -subject -issuer -dates \
        -in "$CA_SERVER_DIR/server.crt"
    echo ""
}

# Main execution
main() {
    create_directory_structure
    create_root_ca
    create_intermediate_ca
    create_server_certificate
    display_certificate_info

    echo -e "${GREEN}=== Certificate Authority Setup Complete ===${NC}"
    echo -e "${GREEN}Root CA:         $CA_ROOT_DIR/certs/ca.crt${NC}"
    echo -e "${GREEN}Intermediate CA: $CA_INTERMEDIATE_DIR/intermediate.crt${NC}"
    echo -e "${GREEN}Server Cert:     $CA_SERVER_DIR/server.crt${NC}"
    echo -e "${GREEN}Server Key:      $CA_SERVER_DIR/server.key${NC}"
    echo ""
    echo -e "${YELLOW}Note: This is a development CA. DO NOT use in production without proper key management!${NC}"
}

# Run main function
main
