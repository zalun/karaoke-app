# HomeKaraoke Development Commands
# Run `just` or `just --list` to see all available commands

# Default recipe - show help
default:
    @just --list --unsorted

# ══════════════════════════════════════════════════════════════════════════════
# DEVELOPMENT
# ══════════════════════════════════════════════════════════════════════════════

# Start full development environment (Tauri + Vite)
dev:
    npm run tauri dev

# Start frontend only (Vite dev server, no Tauri window)
dev-web:
    npm run dev

# Start with verbose Rust logging
dev-verbose:
    RUST_LOG=debug npm run tauri dev

# Start with specific log level (trace, debug, info, warn, error)
dev-log level="debug":
    RUST_LOG={{level}} npm run tauri dev

# ══════════════════════════════════════════════════════════════════════════════
# BUILD
# ══════════════════════════════════════════════════════════════════════════════

# Build production release (creates .app and .dmg)
build:
    npm run tauri build

# Build frontend only (TypeScript + Vite)
build-web:
    npm run build

# Build in debug mode (faster, no optimization)
build-debug:
    npm run tauri build -- --debug

# Build for specific target (aarch64-apple-darwin or x86_64-apple-darwin)
build-target target:
    npm run tauri build -- --target {{target}}

# Build Apple Silicon release
build-arm:
    npm run tauri build -- --target aarch64-apple-darwin

# Build Intel release
build-intel:
    npm run tauri build -- --target x86_64-apple-darwin

# ══════════════════════════════════════════════════════════════════════════════
# TESTING - UNIT TESTS
# ══════════════════════════════════════════════════════════════════════════════

# Run unit tests once
test:
    npm run test:run

# Run unit tests in watch mode
test-watch:
    npm run test

# Run unit tests with coverage report
test-coverage:
    npm run test:coverage

# Run specific test file
test-file file:
    npx vitest run {{file}}

# Run tests matching pattern
test-grep pattern:
    npx vitest run -t "{{pattern}}"

# ══════════════════════════════════════════════════════════════════════════════
# TESTING - E2E TESTS
# ══════════════════════════════════════════════════════════════════════════════

# Run all E2E tests
e2e:
    npm run test:e2e

# Run E2E tests with Playwright UI
e2e-ui:
    npm run test:e2e:ui

# Run E2E tests in debug mode (step through)
e2e-debug:
    npm run test:e2e:debug

# Run E2E tests in headed mode (visible browser)
e2e-headed:
    npm run test:e2e:headed

# Run E2E tests for specific spec file
e2e-file file:
    npx playwright test {{file}}

# Run E2E tests matching pattern
e2e-grep pattern:
    npx playwright test --grep "{{pattern}}"

# Run E2E tests on specific browser (chromium, webkit)
e2e-browser browser:
    npx playwright test --project={{browser}}

# Show Playwright test report
e2e-report:
    npx playwright show-report

# Install/update Playwright browsers
e2e-install:
    npx playwright install --with-deps chromium webkit

# ══════════════════════════════════════════════════════════════════════════════
# TESTING - ALL
# ══════════════════════════════════════════════════════════════════════════════

# Run all tests (unit + E2E)
test-all: test e2e

# Run all tests with coverage
test-all-coverage: test-coverage e2e

# ══════════════════════════════════════════════════════════════════════════════
# LINTING & TYPE CHECKING
# ══════════════════════════════════════════════════════════════════════════════

# Run ESLint
lint:
    npm run lint

# Run ESLint and fix auto-fixable issues
lint-fix:
    npx eslint . --fix

# TypeScript type check (no emit)
typecheck:
    npx tsc --noEmit

# Run Rust clippy (linter)
clippy:
    cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings

# Run all linters
lint-all: lint typecheck clippy

# ══════════════════════════════════════════════════════════════════════════════
# FORMATTING
# ══════════════════════════════════════════════════════════════════════════════

# Format Rust code
fmt-rust:
    cd src-tauri && cargo fmt

# Check Rust formatting (no changes)
fmt-rust-check:
    cd src-tauri && cargo fmt --check

# Format all code (Rust)
fmt: fmt-rust

# ══════════════════════════════════════════════════════════════════════════════
# RUST / CARGO
# ══════════════════════════════════════════════════════════════════════════════

# Cargo check (fast compile check)
cargo-check:
    cd src-tauri && cargo check

# Cargo build (debug)
cargo-build:
    cd src-tauri && cargo build

# Cargo build (release)
cargo-build-release:
    cd src-tauri && cargo build --release

# Cargo test
cargo-test:
    cd src-tauri && cargo test

# Cargo update dependencies
cargo-update:
    cd src-tauri && cargo update

# Show outdated Rust dependencies
cargo-outdated:
    cd src-tauri && cargo outdated 2>/dev/null || echo "Install with: cargo install cargo-outdated"

# ══════════════════════════════════════════════════════════════════════════════
# DEPENDENCIES
# ══════════════════════════════════════════════════════════════════════════════

# Install all dependencies
install:
    npm ci

# Install dependencies (allow updates)
install-update:
    npm install

# Update npm dependencies
npm-update:
    npm update

# Show outdated npm packages
npm-outdated:
    npm outdated

# Install all project dependencies (npm + Playwright + Rust)
install-all: install e2e-install
    cd src-tauri && cargo fetch

# ══════════════════════════════════════════════════════════════════════════════
# GIT WORKFLOW (per CLAUDE.md guidelines)
# ══════════════════════════════════════════════════════════════════════════════

# Create feature branch from issue number
feature issue description:
    git checkout main
    git pull origin main
    git checkout -b feature/{{issue}}-{{description}}

# Create fix branch from issue number
fix issue description:
    git checkout main
    git pull origin main
    git checkout -b fix/{{issue}}-{{description}}

# Show current branch and status
status:
    @echo "Branch: $(git branch --show-current)"
    @git status --short

# Show recent commits
log:
    git log --oneline -15

# Show diff of staged changes
diff:
    git diff --staged

# Sync with main branch (rebase)
sync:
    git fetch origin main
    git rebase origin/main

# ══════════════════════════════════════════════════════════════════════════════
# RELEASE & VERSIONING
# ══════════════════════════════════════════════════════════════════════════════

# Show current version
version:
    @echo "package.json: $(jq -r .version package.json)"
    @echo "Cargo.toml: $(grep '^version' src-tauri/Cargo.toml | head -1 | cut -d'"' -f2)"
    @echo "tauri.conf.json: $(jq -r .version src-tauri/tauri.conf.json)"

# Bump version (updates all 3 files) - use: just bump 0.8.0
bump new_version:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "Bumping version to {{new_version}}..."
    jq '.version = "{{new_version}}"' package.json > package.json.tmp && mv package.json.tmp package.json
    jq '.version = "{{new_version}}"' src-tauri/tauri.conf.json > src-tauri/tauri.conf.json.tmp && mv src-tauri/tauri.conf.json.tmp src-tauri/tauri.conf.json
    # Cross-platform sed: create temp file and move (works on both macOS and Linux)
    sed 's/^version = ".*"/version = "{{new_version}}"/' src-tauri/Cargo.toml > src-tauri/Cargo.toml.tmp && mv src-tauri/Cargo.toml.tmp src-tauri/Cargo.toml
    echo "Version bumped to {{new_version}}"
    just version

# Create git tag for release
tag version:
    git tag v{{version}}
    @echo "Created tag v{{version}}"
    @echo "Push with: git push origin v{{version}}"

# ══════════════════════════════════════════════════════════════════════════════
# MACOS CODE SIGNING & NOTARIZATION
# ══════════════════════════════════════════════════════════════════════════════

# Submit DMG for notarization (requires Apple credentials in env)
notarize dmg_path:
    xcrun notarytool submit "{{dmg_path}}" \
        --apple-id "$APPLE_ID" \
        --password "$APPLE_APP_PASSWORD" \
        --team-id "$APPLE_TEAM_ID" \
        --wait

# Staple notarization ticket to DMG
staple dmg_path:
    xcrun stapler staple "{{dmg_path}}"

# Validate stapled notarization
validate dmg_path:
    xcrun stapler validate "{{dmg_path}}"

# Full notarization flow
notarize-full dmg_path: (notarize dmg_path) (staple dmg_path) (validate dmg_path)

# ══════════════════════════════════════════════════════════════════════════════
# DATABASE & LOGS
# ══════════════════════════════════════════════════════════════════════════════

# Open SQLite database (requires sqlite3)
db:
    sqlite3 ~/Library/Application\ Support/app.homekaraoke/homekaraoke.db

# Show database tables
db-tables:
    sqlite3 ~/Library/Application\ Support/app.homekaraoke/homekaraoke.db ".tables"

# Show database schema
db-schema:
    sqlite3 ~/Library/Application\ Support/app.homekaraoke/homekaraoke.db ".schema"

# Tail application logs
logs:
    tail -f ~/Library/Logs/app.homekaraoke/homekaraoke.log

# Show last 100 log lines
logs-recent:
    tail -100 ~/Library/Logs/app.homekaraoke/homekaraoke.log

# Open log file in default editor
logs-open:
    open ~/Library/Logs/app.homekaraoke/homekaraoke.log

# Clear logs
logs-clear:
    echo "" > ~/Library/Logs/app.homekaraoke/homekaraoke.log
    @echo "Logs cleared"

# ══════════════════════════════════════════════════════════════════════════════
# CLEANUP
# ══════════════════════════════════════════════════════════════════════════════

# Clean all build artifacts
clean:
    rm -rf dist/
    rm -rf src-tauri/target/
    rm -rf node_modules/.vite/
    @echo "Build artifacts cleaned"

# Clean Rust target only
clean-rust:
    rm -rf src-tauri/target/
    @echo "Rust target cleaned"

# Clean frontend build only
clean-web:
    rm -rf dist/
    rm -rf node_modules/.vite/
    @echo "Frontend build cleaned"

# Clean test artifacts
clean-test:
    rm -rf coverage/
    rm -rf test-results/
    rm -rf playwright-report/
    @echo "Test artifacts cleaned"

# Clean node_modules (full reinstall needed after)
clean-node:
    rm -rf node_modules/
    @echo "node_modules removed - run 'just install' to reinstall"

# Nuclear clean - removes everything
clean-all: clean clean-test clean-node
    @echo "All artifacts cleaned"

# ══════════════════════════════════════════════════════════════════════════════
# UTILITIES
# ══════════════════════════════════════════════════════════════════════════════

# Show project info
info:
    @echo "HomeKaraoke App"
    @echo "==============="
    @just version
    @echo ""
    @echo "Node: $(node --version)"
    @echo "npm: $(npm --version)"
    @echo "Rust: $(rustc --version)"
    @echo "Cargo: $(cargo --version)"

# Open GitHub repo in browser
github:
    gh browse

# Open GitHub issues in browser
issues:
    gh browse --issues

# Create GitHub issue (requires gh CLI)
issue-create title:
    gh issue create --title "{{title}}"

# List open issues
issue-list:
    gh issue list

# Watch for file changes and run tests
watch-test:
    npm run test

# Run a quick health check
check: typecheck lint cargo-check
    @echo "All checks passed!"

# ══════════════════════════════════════════════════════════════════════════════
# CI SIMULATION
# ══════════════════════════════════════════════════════════════════════════════

# Run what CI would run (lint + type check + tests)
ci: lint typecheck test e2e
    @echo "CI simulation complete!"

# Run pre-commit checks
pre-commit: lint typecheck test
    @echo "Pre-commit checks passed!"


# ══════════════════════════════════════════════════════════════════════════════
# RALPH
# ══════════════════════════════════════════════════════════════════════════════

# Clear Ralph state and restart (fresh session)
ralph-restart:
    rm -f .exit_signals .call_count .last_reset status.json progress.json .circuit_breaker_state .circuit_breaker_history .ralph_session .ralph_session_history
    @echo "Ralph state cleared"
    ralph --no-continue

# Clear Ralph state and restart with monitor (fresh session)
ralph-restart-monitor:
    rm -f .exit_signals .call_count .last_reset status.json progress.json .circuit_breaker_state .circuit_breaker_history .ralph_session .ralph_session_history
    @echo "Ralph state cleared"
    ralph --monitor --no-continue

# Clear Ralph state only (don't start)
ralph-clear:
    rm -f .exit_signals .call_count .last_reset status.json progress.json .circuit_breaker_state .circuit_breaker_history .ralph_session .ralph_session_history
    @echo "Ralph state cleared"

# Check Ralph status
ralph-status:
    ralph --status


# ══════════════════════════════════════════════════════════════════════════════
# HELP
# ══════════════════════════════════════════════════════════════════════════════

# Show detailed help for a recipe
help recipe:
    @just --show {{recipe}}

# Show all recipes grouped by category
help-all:
    @echo "Development:   dev, dev-web, dev-verbose"
    @echo "Build:         build, build-web, build-debug, build-arm, build-intel"
    @echo "Unit Tests:    test, test-watch, test-coverage, test-file, test-grep"
    @echo "E2E Tests:     e2e, e2e-ui, e2e-debug, e2e-headed, e2e-file, e2e-grep"
    @echo "Linting:       lint, lint-fix, typecheck, clippy, lint-all"
    @echo "Formatting:    fmt, fmt-rust, fmt-rust-check"
    @echo "Cargo:         cargo-check, cargo-build, cargo-test, cargo-update"
    @echo "Dependencies:  install, install-all, npm-update, npm-outdated"
    @echo "Git:           feature, fix, status, log, diff, sync"
    @echo "Release:       version, bump, tag"
    @echo "Notarization:  notarize, staple, validate, notarize-full"
    @echo "Database:      db, db-tables, db-schema"
    @echo "Logs:          logs, logs-recent, logs-open, logs-clear"
    @echo "Cleanup:       clean, clean-rust, clean-web, clean-test, clean-all"
    @echo "Utilities:     info, github, issues, check"
    @echo "CI:            ci, pre-commit"
