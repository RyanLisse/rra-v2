#!/bin/bash

# SETUP.sh - Automated environment setup for RRA_V2 RAG Chat Application
# This script sets up the development environment with proper error handling

set -e  # Exit on any error
set -u  # Exit on undefined variables

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

# Detect project type and validate dependencies
detect_dependencies() {
    log_info "Detecting project dependencies..."
    
    # Check for package.json (Node.js project)
    if [[ ! -f "package.json" ]]; then
        log_error "package.json not found. This doesn't appear to be a Node.js project."
        exit 1
    fi
    
    # Detect package manager preference
    if [[ -f "bun.lock" ]]; then
        PACKAGE_MANAGER="bun"
    elif [[ -f "package-lock.json" ]]; then
        PACKAGE_MANAGER="npm"
    elif [[ -f "yarn.lock" ]]; then
        PACKAGE_MANAGER="yarn"
    else
        PACKAGE_MANAGER="bun"  # Default to bun based on project
    fi
    
    log_info "Detected package manager: $PACKAGE_MANAGER"
}

# Install package manager if needed
install_package_manager() {
    case $PACKAGE_MANAGER in
        "bun")
            if ! command_exists bun; then
                log_info "Installing Bun..."
                curl -fsSL https://bun.sh/install | bash
                export PATH="$HOME/.bun/bin:$PATH"
            fi
            ;;
        "npm")
            if ! command_exists npm; then
                log_error "npm is required but not installed. Please install Node.js."
                exit 1
            fi
            ;;
        "yarn")
            if ! command_exists yarn; then
                log_info "Installing Yarn..."
                npm install -g yarn
            fi
            ;;
    esac
}

# Install project dependencies
install_dependencies() {
    log_info "Installing project dependencies..."
    
    case $PACKAGE_MANAGER in
        "bun")
            bun install
            ;;
        "npm")
            npm install
            ;;
        "yarn")
            yarn install
            ;;
    esac
}

# Setup environment file
setup_environment() {
    log_info "Setting up environment configuration..."
    
    if [[ ! -f ".env.local" && ! -f ".env" ]]; then
        if [[ -f ".env.example" ]]; then
            cp .env.example .env.local
            log_info "Created .env.local from .env.example template"
            log_warn "Please edit .env.local with your actual environment variables"
        else
            log_warn "No .env.example found. You'll need to create environment variables manually."
        fi
    else
        log_info "Environment file already exists"
    fi
}

# Validate database setup
validate_database() {
    log_info "Validating database configuration..."
    
    if [[ -f "drizzle.config.ts" ]]; then
        log_info "Found Drizzle configuration"
        
        # Check if database migrations exist
        if [[ -d "lib/db/migrations" ]]; then
            log_info "Database migrations found"
        else
            log_warn "No database migrations found. Run 'bun run db:generate' if needed."
        fi
    else
        log_warn "No database configuration found"
    fi
}

# Safe database migration with conflict handling
migrate_database() {
    log_info "Running database migrations..."
    
    if [[ ! -f "drizzle.config.ts" ]]; then
        log_warn "No Drizzle configuration found, skipping migrations"
        return 0
    fi
    
    # Check if migrations directory exists
    if [[ ! -d "lib/db/migrations" ]]; then
        log_warn "No migrations directory found, skipping migration"
        return 0
    fi
    
    # Run migration with error handling
    if $PACKAGE_MANAGER run db:migrate 2>&1 | tee migration.log; then
        log_info "Database migration completed successfully"
        rm -f migration.log
    else
        # Check if the error is about tables already existing
        if grep -q "already exists\|SQLITE_ERROR.*exists" migration.log 2>/dev/null; then
            log_warn "Some tables already exist - this is usually safe to ignore"
            log_info "Migration conflicts detected but database may be functional"
            
            # Optionally mark migrations as applied
            if command_exists drizzle-kit; then
                log_info "Attempting to resolve migration state..."
                # Note: This would need to be implemented based on your specific needs
                # For now, we'll just warn the user
                log_warn "You may need to manually resolve migration conflicts"
                log_info "Consider running: drizzle-kit push --force (use with caution)"
            fi
        else
            log_error "Database migration failed with unexpected error:"
            cat migration.log
            rm -f migration.log
            return 1
        fi
        rm -f migration.log
    fi
}

# Run initial validations
run_validations() {
    log_info "Running initial validations..."
    
    # Check TypeScript compilation
    if command_exists tsc; then
        log_info "Checking TypeScript compilation..."
        npx tsc --noEmit || log_warn "TypeScript compilation has issues"
    fi
    
    # Check if tests can run
    log_info "Verifying test setup..."
    if [[ -f "vitest.config.ts" ]]; then
        log_info "Vitest configuration found"
    fi
    
    if [[ -f "playwright.config.ts" ]]; then
        log_info "Playwright configuration found"
        
        # Install Playwright browsers if needed
        if command_exists playwright; then
            log_info "Installing Playwright browsers..."
            npx playwright install --with-deps
        fi
    fi
}

# Main setup function
main() {
    log_info "Starting RRA_V2 RAG Chat Application setup..."
    
    # Ensure we're in project root
    if [[ ! -f "package.json" || ! -f "AGENTS.md" ]]; then
        log_error "Please run this script from the project root directory"
        exit 1
    fi
    
    # Run setup steps
    detect_dependencies
    install_package_manager
    install_dependencies
    setup_environment
    validate_database
    migrate_database
    run_validations
    
    log_info "Setup completed successfully!"
    echo
    log_info "Next steps:"
    echo "  1. Configure your environment variables in .env.local"
    echo "  2. Start development with 'bun dev'"
    echo "  3. Run tests with 'bun test'"
    echo
    log_info "For more information, see AGENTS.md and CLAUDE.md"
}

# Run main function with error handling
if ! main "$@"; then
    log_error "Setup failed. Please check the errors above."
    exit 1
fi