#!/bin/bash

# RAG Chat Application Setup Script
# This script handles the initial setup of the project with proper error handling

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Functions
print_error() {
    echo -e "${RED}❌ Error: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "ℹ️  $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Verify system requirements
check_system_requirements() {
    print_info "Checking system requirements..."
    
    # Check Node.js
    if ! command_exists node; then
        print_error "Node.js is not installed. Please install Node.js 18+ from https://nodejs.org"
        exit 1
    fi
    
    local node_version=$(node -v | cut -d'v' -f2)
    local required_version="18.0.0"
    
    if [ "$(printf '%s\n' "$required_version" "$node_version" | sort -V | head -n1)" != "$required_version" ]; then
        print_error "Node.js version $node_version is too old. Please upgrade to Node.js 18+"
        exit 1
    fi
    
    print_success "Node.js $(node -v) detected"
    
    # Check Git
    if ! command_exists git; then
        print_error "Git is not installed. Please install Git from https://git-scm.com"
        exit 1
    fi
    
    print_success "Git $(git --version | cut -d' ' -f3) detected"
}

# Install Bun with error handling
install_bun() {
    if command_exists bun; then
        print_success "Bun is already installed ($(bun --version))"
        return 0
    fi
    
    print_info "Installing Bun..."
    
    # Try to install Bun
    if ! curl -fsSL https://bun.sh/install | bash; then
        print_error "Failed to install Bun automatically"
        print_info "Please try manual installation:"
        print_info "  1. Visit https://bun.sh"
        print_info "  2. Follow the installation instructions for your platform"
        print_info "  3. Run this script again"
        
        # Alternative installation methods
        print_info ""
        print_info "Alternative installation methods:"
        print_info "  macOS/Linux: curl -fsSL https://bun.sh/install | bash"
        print_info "  macOS (Homebrew): brew install oven-sh/bun/bun"
        print_info "  Windows: powershell -c \"irm bun.sh/install.ps1 | iex\""
        
        exit 1
    fi
    
    # Source the bashrc/zshrc to get bun in PATH
    if [ -f "$HOME/.bashrc" ]; then
        source "$HOME/.bashrc"
    elif [ -f "$HOME/.zshrc" ]; then
        source "$HOME/.zshrc"
    fi
    
    # Verify installation
    if ! command_exists bun; then
        print_warning "Bun installed but not in PATH"
        print_info "Please add the following to your shell configuration:"
        print_info "  export BUN_INSTALL=\"\$HOME/.bun\""
        print_info "  export PATH=\"\$BUN_INSTALL/bin:\$PATH\""
        print_info ""
        print_info "Then restart your terminal and run this script again"
        exit 1
    fi
    
    print_success "Bun $(bun --version) installed successfully"
}

# Install dependencies
install_dependencies() {
    print_info "Installing project dependencies..."
    
    if ! bun install; then
        print_error "Failed to install dependencies"
        print_info "Troubleshooting tips:"
        print_info "  1. Check your internet connection"
        print_info "  2. Clear Bun cache: bun pm cache rm"
        print_info "  3. Remove node_modules and bun.lockb, then try again"
        exit 1
    fi
    
    print_success "Dependencies installed successfully"
}

# Setup environment variables
setup_environment() {
    print_info "Setting up environment variables..."
    
    if [ ! -f .env.local ]; then
        if [ -f .env.example ]; then
            cp .env.example .env.local
            print_success "Created .env.local from .env.example"
            print_warning "Please update .env.local with your API keys"
        else
            print_warning ".env.local not found and no .env.example available"
            print_info "Please create .env.local with the required environment variables"
        fi
    else
        print_success ".env.local already exists"
    fi
}

# Setup database
setup_database() {
    print_info "Setting up database..."
    
    # Check if PostgreSQL URL is configured
    if ! grep -q "POSTGRES_URL=" .env.local || grep -q "POSTGRES_URL=$" .env.local; then
        print_warning "POSTGRES_URL not configured in .env.local"
        print_info "Please add your PostgreSQL connection string to .env.local"
        print_info "Example: POSTGRES_URL=postgresql://user:password@host/database"
        return
    fi
    
    # Generate migrations
    print_info "Generating database migrations..."
    if ! bun run db:generate; then
        print_error "Failed to generate database migrations"
        return 1
    fi
    
    # Run migrations
    print_info "Running database migrations..."
    if ! bun run db:migrate; then
        print_error "Failed to run database migrations"
        print_info "Please check your database connection and try again"
        return 1
    fi
    
    print_success "Database setup complete"
}

# Verify development server
verify_dev_server() {
    print_info "Verifying development server..."
    
    # Start the server in background
    bun dev &
    local server_pid=$!
    
    # Wait for server to start
    print_info "Waiting for server to start..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
            print_success "Development server is running at http://localhost:3000"
            
            # Run health check
            local health_response=$(curl -s http://localhost:3000/api/health)
            if echo "$health_response" | grep -q "\"ok\":true"; then
                print_success "Health check passed"
            else
                print_warning "Health check failed. Please check your configuration"
                echo "Response: $health_response"
            fi
            
            # Kill the server
            kill $server_pid 2>/dev/null || true
            wait $server_pid 2>/dev/null || true
            
            return 0
        fi
        
        sleep 1
        attempt=$((attempt + 1))
    done
    
    # Server failed to start
    kill $server_pid 2>/dev/null || true
    wait $server_pid 2>/dev/null || true
    
    print_error "Development server failed to start"
    print_info "Check the logs above for error messages"
    return 1
}

# Main setup flow
main() {
    echo "🚀 RAG Chat Application Setup"
    echo "============================"
    echo ""
    
    # Step 1: Check system requirements
    check_system_requirements
    
    # Step 2: Install Bun
    install_bun
    
    # Step 3: Install dependencies
    install_dependencies
    
    # Step 4: Setup environment
    setup_environment
    
    # Step 5: Setup database
    setup_database || print_warning "Database setup incomplete - please configure manually"
    
    # Step 6: Verify development server
    if verify_dev_server; then
        echo ""
        print_success "Setup complete! 🎉"
        echo ""
        echo "Next steps:"
        echo "  1. Update .env.local with your API keys"
        echo "  2. Run 'bun dev' to start the development server"
        echo "  3. Visit http://localhost:3000"
        echo ""
        echo "Useful commands:"
        echo "  bun dev          - Start development server"
        echo "  bun test         - Run tests"
        echo "  bun run build    - Build for production"
        echo "  bun run db:studio - Open database GUI"
    else
        echo ""
        print_error "Setup completed with errors"
        echo ""
        echo "Please check the troubleshooting guide in TROUBLESHOOTING.md"
    fi
}

# Run main function
main