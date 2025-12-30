# Contributing to HomeKaraoke

Thank you for your interest in contributing to HomeKaraoke! This document provides guidelines and information for contributors.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Development Commands](#development-commands)
- [Code Style](#code-style)
- [Testing](#testing)
- [Commit Guidelines](#commit-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Getting Help](#getting-help)

## Code of Conduct

Please be respectful and constructive in all interactions. We welcome contributors of all experience levels and backgrounds.

## Getting Started

### Prerequisites

- **Node.js** 18+ and npm
- **Rust** (latest stable) - Install via [rustup](https://rustup.rs/)
- **Platform-specific requirements:**
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`)
  - **Linux:** See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux)
  - **Windows:** Not currently supported

### Setup

```bash
# Clone the repository
git clone https://github.com/zalun/karaoke-app.git
cd karaoke-app

# Install dependencies
npm install

# Run in development mode
npm run tauri dev
```

### Project Structure

```
├── src/                    # React frontend
│   ├── components/         # UI components (by feature)
│   ├── stores/             # Zustand state management
│   ├── services/           # Frontend services
│   └── hooks/              # Custom React hooks
├── src-tauri/              # Rust backend
│   └── src/
│       ├── lib.rs          # App initialization
│       ├── commands/       # Tauri IPC commands
│       ├── db/             # SQLite database
│       └── services/       # Backend services
├── plan/                   # Design documents & roadmap
└── CLAUDE.md               # Technical reference for AI assistants
```

For detailed architecture information, see [CLAUDE.md](CLAUDE.md).

## Development Workflow

We follow a structured workflow to maintain code quality:

### 1. Create an Issue First

Every change requires a GitHub issue:
- **Bugs:** Describe the problem, steps to reproduce, expected vs actual behavior
- **Features:** Explain the use case and proposed solution
- **Wait for feedback** on larger changes before starting work

### 2. Create a Feature Branch

```bash
# For features
git checkout -b feature/<issue-number>-<short-description>

# For bug fixes
git checkout -b fix/<issue-number>-<short-description>

# Examples
git checkout -b feature/42-add-playlist-export
git checkout -b fix/100-fedora-video-playback
```

### 3. Make Your Changes

- Write clean, readable code
- Add tests for new functionality
- Update documentation if needed
- Add a CHANGELOG entry under `[Unreleased]`

### 4. Submit a Pull Request

- Reference the issue in your PR description (`Fixes #42`)
- Ensure CI checks pass
- Request review from maintainers

## Development Commands

### Frontend + Backend (Tauri)

```bash
npm run tauri dev      # Start development (hot-reload)
npm run tauri build    # Production build
```

### Frontend Only

```bash
npm run dev            # Vite dev server (no Tauri window)
npm run build          # TypeScript + Vite build
npm run lint           # ESLint
npm run preview        # Preview production build
```

### Testing

```bash
npm test               # Run tests in watch mode
npm run test:run       # Run tests once
npm run test:coverage  # Run tests with coverage report
```

### Rust Backend

```bash
cd src-tauri
cargo check            # Type check
cargo clippy           # Linting
cargo test             # Run Rust tests
cargo fmt              # Format code
```

## Code Style

### TypeScript/React

- Use functional components with hooks
- Zustand for state management (see pattern in `src/stores/`)
- Tailwind CSS for styling (dark theme: `gray-900` background)
- Use barrel exports via `index.ts` files
- Prefer named exports over default exports

```typescript
// Zustand store pattern
export const useExampleStore = create<ExampleState>((set, get) => ({
  items: [],
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
}));
```

### Rust

- Follow standard Rust conventions
- Use `log::info!()`, `log::debug!()`, etc. for logging
- Handle errors with `Result` and `?` operator
- Use `#[cfg(target_os = "...")]` for platform-specific code

### Formatting

- **TypeScript:** Handled by ESLint
- **Rust:** Run `cargo fmt` before committing

## Testing

### Frontend Tests

We use Vitest with React Testing Library:

```bash
npm test                    # Watch mode
npm run test:run            # Single run
npm run test:coverage       # With coverage
```

### Manual Testing Checklist

For UI changes, manually verify:
- [ ] Works on macOS (primary platform)
- [ ] Works on Linux (if applicable)
- [ ] Responsive layout
- [ ] Keyboard navigation
- [ ] Dark theme appearance

## Commit Guidelines

Write clear, descriptive commit messages:

```
<type>: <short summary> (#<issue>)

<optional body explaining the change>
```

### Types

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

### Examples

```
feat: Add playlist export to JSON (#42)

fix: Resolve choppy video in detached window on Linux (#100)

docs: Update README with Linux installation steps
```

## Pull Request Process

### Before Submitting

1. **Run checks locally:**
   ```bash
   npm run lint
   npm run test:run
   cargo clippy
   cargo fmt --check
   ```

2. **Update CHANGELOG.md** under `[Unreleased]`:
   ```markdown
   ## [Unreleased]

   ### Added
   - Your new feature (#issue-number)

   ### Fixed
   - Bug you fixed (#issue-number)
   ```

3. **Update version** (for releases only):
   - `package.json`
   - `src-tauri/Cargo.toml`
   - `src-tauri/tauri.conf.json`

### PR Description Template

```markdown
## Summary
Brief description of the changes.

## Related Issue
Fixes #<issue-number>

## Changes
- Bullet point list of changes

## Test Plan
- [ ] How to test change 1
- [ ] How to test change 2

## Screenshots (if applicable)
```

### Review Process

1. Automated CI checks must pass (Claude Code Review)
2. At least one maintainer approval required
3. Address feedback constructively
4. Squash merge to main branch

## Reporting Bugs

### Before Reporting

1. Check existing [issues](https://github.com/zalun/karaoke-app/issues) for duplicates
2. Try the latest version
3. Collect relevant log files:
   - **macOS:** `~/Library/Logs/app.homekaraoke/`
   - **Linux:** `~/.local/share/app.homekaraoke/logs/`

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
1. Go to '...'
2. Click on '...'
3. See error

**Expected behavior**
What you expected to happen.

**Environment**
- OS: [e.g., macOS 14.2, Fedora 40]
- App version: [e.g., 0.5.1-beta]
- Architecture: [e.g., Apple Silicon, Intel, x86_64]

**Logs**
Attach relevant log files or paste excerpts.

**Screenshots**
If applicable, add screenshots.
```

## Suggesting Features

We welcome feature suggestions! Please:

1. **Check existing issues** and the [roadmap](plan/) first
2. **Create an issue** with:
   - Clear use case explanation
   - Proposed solution (if you have one)
   - Any alternatives considered
3. **Wait for discussion** before implementing large features

## Getting Help

- **Questions:** Open a [Discussion](https://github.com/zalun/karaoke-app/discussions) or issue
- **Documentation:** See [CLAUDE.md](CLAUDE.md) for technical details
- **Roadmap:** Check [plan/](plan/) for upcoming features

---

Thank you for contributing to HomeKaraoke!
