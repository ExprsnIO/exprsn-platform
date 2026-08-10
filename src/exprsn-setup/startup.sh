#!/bin/bash

# Exprsn Setup Service Startup Script

set -e

echo "================================="
echo "Exprsn Setup Service Startup"
echo "================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed"
    echo "Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "Error: Node.js 18+ is required"
    echo "Current version: $(node -v)"
    exit 1
fi

echo "✓ Node.js $(node -v) detected"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "Warning: .env file not found"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "✓ Created .env file"
    echo "Please edit .env with your settings before starting the service"
    echo ""
fi

# Check if node_modules exists
if [ ! -d node_modules ]; then
    echo "Installing dependencies..."
    npm install
    echo "✓ Dependencies installed"
    echo ""
fi

# Create logs directory if it doesn't exist
if [ ! -d logs ]; then
    mkdir -p logs
    echo "✓ Created logs directory"
fi

# Create uploads directory if it doesn't exist
if [ ! -d uploads ]; then
    mkdir -p uploads
    echo "✓ Created uploads directory"
fi

echo ""
echo "================================="
echo "Starting Exprsn Setup Service"
echo "================================="
echo ""

# Start the service
if [ "$1" = "dev" ]; then
    echo "Starting in development mode..."
    npm run dev
else
    echo "Starting in production mode..."
    npm start
fi
