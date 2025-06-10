#!/bin/bash

# fix-migration-conflicts.sh - Helper script to resolve Drizzle migration conflicts
# Handles common issues like "table already exists" errors

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Detect database type from drizzle config
detect_database_type() {
    if [[ -f "drizzle.config.ts" ]]; then
        if grep -q "dialect.*postgresql" drizzle.config.ts; then
            echo "postgresql"
        elif grep -q "dialect.*sqlite" drizzle.config.ts; then
            echo "sqlite"
        elif grep -q "dialect.*mysql" drizzle.config.ts; then
            echo "mysql"
        else
            echo "unknown"
        fi
    else
        echo "none"
    fi
}

# Fix migration conflicts based on database type
fix_conflicts() {
    local db_type=$(detect_database_type)
    
    log_info "Detected database type: $db_type"
    
    case $db_type in
        "postgresql")
            fix_postgresql_conflicts
            ;;
        "sqlite")
            fix_sqlite_conflicts
            ;;
        "mysql")
            fix_mysql_conflicts
            ;;
        "none")
            log_error "No drizzle.config.ts found"
            exit 1
            ;;
        *)
            log_warn "Unknown database type, attempting generic fix"
            attempt_generic_fix
            ;;
    esac
}

# Fix PostgreSQL specific conflicts
fix_postgresql_conflicts() {
    log_info "Attempting to fix PostgreSQL migration conflicts..."
    
    # Try to reset migration state
    if command_exists drizzle-kit; then
        log_info "Resetting migration state..."
        
        # Generate fresh migrations
        log_info "Generating fresh migrations..."
        drizzle-kit generate
        
        # Try introspection to sync state
        log_info "Running introspection..."
        if drizzle-kit introspect; then
            log_info "Introspection successful"
        else
            log_warn "Introspection failed, trying push instead"
            drizzle-kit push --force
        fi
    else
        log_error "drizzle-kit not found. Please install it first."
        exit 1
    fi
}

# Fix SQLite specific conflicts
fix_sqlite_conflicts() {
    log_info "Attempting to fix SQLite migration conflicts..."
    
    # For SQLite, we can be more aggressive
    if command_exists drizzle-kit; then
        log_info "Using drizzle-kit push to sync schema..."
        drizzle-kit push --force
    else
        log_error "drizzle-kit not found. Please install it first."
        exit 1
    fi
}

# Fix MySQL specific conflicts
fix_mysql_conflicts() {
    log_info "Attempting to fix MySQL migration conflicts..."
    
    # Similar to PostgreSQL approach
    if command_exists drizzle-kit; then
        log_info "Generating fresh migrations..."
        drizzle-kit generate
        
        log_info "Attempting to push schema changes..."
        drizzle-kit push --force
    else
        log_error "drizzle-kit not found. Please install it first."
        exit 1
    fi
}

# Generic fix attempt
attempt_generic_fix() {
    log_info "Attempting generic migration fix..."
    
    if command_exists drizzle-kit; then
        # Try to regenerate migrations
        log_info "Regenerating migrations..."
        drizzle-kit generate
        
        # Try push with force
        log_info "Force pushing schema..."
        drizzle-kit push --force
    else
        log_error "drizzle-kit not found. Please install it first."
        exit 1
    fi
}

# Clear migration state (nuclear option)
clear_migration_state() {
    log_warn "WARNING: This will clear all migration history!"
    read -p "Are you sure you want to continue? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log_info "Clearing migration state..."
        
        # Remove migration files
        if [[ -d "lib/db/migrations" ]]; then
            rm -rf lib/db/migrations/*
            log_info "Cleared migration files"
        fi
        
        # Generate fresh migrations
        if command_exists drizzle-kit; then
            drizzle-kit generate
            log_info "Generated fresh migrations"
        fi
    else
        log_info "Operation cancelled"
        exit 0
    fi
}

# Show usage information
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --fix       Attempt to fix migration conflicts (default)"
    echo "  --clear     Clear all migration state and regenerate (destructive)"
    echo "  --help      Show this help message"
    echo ""
    echo "This script helps resolve common Drizzle migration conflicts like:"
    echo "  - Table already exists errors"
    echo "  - Migration state mismatches"
    echo "  - Schema synchronization issues"
}

# Main function
main() {
    local action="fix"
    
    # Parse command line arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --fix)
                action="fix"
                shift
                ;;
            --clear)
                action="clear"
                shift
                ;;
            --help)
                show_usage
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_usage
                exit 1
                ;;
        esac
    done
    
    # Ensure we're in a valid project directory
    if [[ ! -f "package.json" ]]; then
        log_error "No package.json found. Please run this script from the project root."
        exit 1
    fi
    
    log_info "Starting migration conflict resolution..."
    
    case $action in
        "fix")
            fix_conflicts
            ;;
        "clear")
            clear_migration_state
            ;;
    esac
    
    log_info "Migration conflict resolution completed!"
    echo ""
    log_info "You can now try running: bun run db:migrate"
}

# Run main function
main "$@"