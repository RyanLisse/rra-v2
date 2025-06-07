.PHONY: install dev build lint test clean format check test-unit test-e2e test-all db-generate db-migrate db-studio db-push db-pull db-check db-up test-coverage test-api test-components test-integration test-performance test-lib test-utils test-fixtures playwright-install docker-up docker-down docker-restart docker-logs help

# Default target
.DEFAULT_GOAL := help

# Help command
help:
	@echo "Available commands:"
	@echo ""
	@echo "  Setup & Verification:"
	@echo "    make setup         - Run automated setup with error handling"
	@echo "    make verify        - Verify installation and configuration"
	@echo "    make setup-manual  - Manual setup (clean + install + build)"
	@echo ""
	@echo "  Development:"
	@echo "    make dev           - Start development server"
	@echo "    make build         - Build for production"
	@echo "    make install       - Install dependencies"
	@echo ""
	@echo "  Code Quality:"
	@echo "    make lint          - Run linters (format + lint)"
	@echo "    make format        - Format code with Biome"
	@echo ""
	@echo "  Testing:"
	@echo "    make test          - Run all tests"
	@echo "    make test-unit     - Run unit tests"
	@echo "    make test-e2e      - Run E2E tests"
	@echo "    make test-coverage - Run tests with coverage"
	@echo ""
	@echo "  Database:"
	@echo "    make db-generate   - Generate Drizzle migrations"
	@echo "    make db-migrate    - Apply database migrations"
	@echo "    make db-studio     - Open Drizzle Studio"
	@echo ""
	@echo "  Docker:"
	@echo "    make docker-up     - Start Docker services"
	@echo "    make docker-down   - Stop Docker services"
	@echo ""
	@echo "  Utilities:"
	@echo "    make clean         - Clean build artifacts"
	@echo "    make fresh         - Fresh install (clean + setup)"

# Core commands
install:
	bun install

dev:
	bun run dev

build:
	bun run build

start:
	bun run start

# Linting and formatting
lint:
	bun run format
	bun run lint

lint-fix:
	bun run lint:fix

format:
	bun run format

# Database commands
db-generate:
	bun run db:generate

db-migrate:
	bun run db:migrate

db-studio:
	bun run db:studio

db-push:
	bun run db:push

db-pull:
	bun run db:pull

db-check:
	bun run db:check

db-up:
	bun run db:up

# Testing commands
test:
	bun run test

test-unit:
	bun run test:unit

test-watch:
	bun run test:watch

test-coverage:
	bun run test:coverage

test-api:
	bun run test:api

test-components:
	bun run test:components

test-integration:
	bun run test:integration

test-performance:
	bun run test:performance

test-lib:
	bun run test:lib

test-utils:
	bun run test:utils

test-fixtures:
	bun run test:fixtures

test-e2e:
	bun run test:e2e

test-e2e-ui:
	bun run test:e2e:ui

test-e2e-debug:
	bun run test:e2e:debug

test-e2e-headed:
	bun run test:e2e:headed

test-all:
	bun run test:all

test-ci:
	bun run test:ci

playwright-install:
	bun run playwright:install

# Docker commands
docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

docker-restart:
	docker-compose restart

docker-logs:
	docker-compose logs -f

docker-ps:
	docker-compose ps

# Clean commands
clean:
	rm -rf .next
	rm -rf node_modules
	rm -f bun.lockb
	rm -rf test-results
	rm -rf playwright-report
	rm -rf coverage
	rm -rf .turbo

clean-cache:
	rm -rf .next
	rm -rf .turbo

# Setup commands
setup:
	@echo "Running automated setup..."
	@bash scripts/setup.sh

setup-manual: clean install playwright-install db-migrate build

setup-dev: install playwright-install db-migrate

# Verification command
verify:
	@echo "Verifying installation..."
	@echo ""
	@echo "✓ Checking Bun installation..."
	@which bun > /dev/null && echo "  Bun $(shell bun --version) installed" || echo "  ❌ Bun not found"
	@echo ""
	@echo "✓ Checking Node.js installation..."
	@which node > /dev/null && echo "  Node $(shell node --version) installed" || echo "  ❌ Node not found"
	@echo ""
	@echo "✓ Checking environment configuration..."
	@test -f .env.local && echo "  .env.local exists" || echo "  ❌ .env.local missing"
	@echo ""
	@echo "✓ Checking dependencies..."
	@test -d node_modules && echo "  Dependencies installed" || echo "  ❌ Dependencies not installed"
	@echo ""
	@echo "✓ Checking database configuration..."
	@grep -q "POSTGRES_URL=" .env.local && echo "  Database URL configured" || echo "  ❌ Database URL missing"
	@echo ""
	@echo "✓ Running health check..."
	@curl -s http://localhost:3000/api/health > /dev/null 2>&1 && echo "  Development server is running" || echo "  ⚠️  Development server not running (run 'make dev' to start)"

# Development workflow shortcuts
fresh: clean setup

restart: docker-restart dev