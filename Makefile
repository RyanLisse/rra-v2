.PHONY: install dev build lint test clean format check test-unit test-e2e test-all

install:
	bun install

dev:
	bun run dev

build:
	bun run build

lint:
	bun run format
	bun run lint

format:
	bun run format

check:
	bun run check

test:
	bun run test

test-unit:
	bun run test:unit

test-e2e:
	bun run test:e2e

test-all:
	bun run test:all

clean:
	rm -rf .next
	rm -rf node_modules
	rm -f bun.lockb
	rm -rf test-results
	rm -rf playwright-report

setup: clean install build