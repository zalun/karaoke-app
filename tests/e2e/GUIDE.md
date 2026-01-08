# E2E Testing Guide

This guide documents patterns, best practices, and lessons learned from implementing E2E tests for HomeKaraoke. These insights were gathered during PR #148 which added Playwright integration tests.

## Table of Contents

1. [Mocking Tauri APIs](#mocking-tauri-apis)
2. [Handling Timing Issues](#handling-timing-issues)
3. [Page Object Model](#page-object-model)
4. [Selectors and Locators](#selectors-and-locators)
5. [CI-Specific Considerations](#ci-specific-considerations)
6. [Common Pitfalls](#common-pitfalls)
7. [When to Skip Tests](#when-to-skip-tests)

---

## Mocking Tauri APIs

### Why Mock at the IPC Level

Tauri WebDriver does not support macOS, so we test in standalone browser mode with mocked Tauri APIs. The key is to mock at the `__TAURI_INTERNALS__` level, which intercepts all IPC calls.

### Implementation Pattern

```typescript
await page.addInitScript((mockConfig) => {
  // Mock the Tauri internals object
  window.__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args?: Record<string, unknown>) => {
      switch (cmd) {
        case "youtube_search":
          if (mockConfig.shouldFailSearch) {
            throw new Error("Search failed");
          }
          return mockConfig.searchResults || [];
        // ... other commands
      }
    },
    transformCallback: (callback, once) => {
      // Handle event callbacks
    },
  };
}, config);
```

### Mock State Management

Keep in-memory state for settings and queue within the mock:

```typescript
// In-memory settings store for tests
const settingsStore: Record<string, string> = { ...defaultSettings };

case "settings_get":
  return settingsStore[args?.key as string] ?? null;

case "settings_set":
  settingsStore[args?.key as string] = args?.value as string;
  return null;
```

### Dynamic Mock Updates

Allow tests to update mock behavior mid-test:

```typescript
export async function updateMockConfig(
  page: Page,
  config: Partial<TauriMockConfig>
): Promise<void> {
  await page.evaluate((newConfig) => {
    window.__TAURI_MOCK_CONFIG__ = {
      ...window.__TAURI_MOCK_CONFIG__,
      ...newConfig,
    };
  }, config);
}
```

**Use case:** Testing error recovery - first make search fail, then update config to succeed.

---

## Handling Timing Issues

### The Core Problem

CI environments are significantly slower than local development machines. A test that passes locally with 100ms timing can fail on CI because state updates take longer to propagate.

### Pattern 1: Use `toPass()` for Retry-Based Assertions

**Bad - Fixed timeout:**
```typescript
await page.waitForTimeout(500);
const count = await mainPage.getQueueItemCount();
expect(count).toBe(1);
```

**Good - Retry until passing:**
```typescript
await expect(async () => {
  const count = await mainPage.getQueueItemCount();
  expect(count).toBe(1);
}).toPass({ timeout: 10000 });
```

The `toPass()` pattern:
- Retries the entire block until assertions pass
- Has exponential backoff built-in
- Provides clear error messages on final failure

### Pattern 2: Wait for Specific State Changes

When navigating between videos, don't wait for "a video to load" - wait for "the title to change FROM the previous value":

```typescript
async waitForTitleChange(previousTitle: string): Promise<void> {
  await this.page.waitForFunction(
    (prevTitle) => {
      const title = document.querySelector('[data-testid="player-controls"] p.font-medium');
      return title && title.textContent !== prevTitle && title.textContent !== "No video selected";
    },
    previousTitle,
    { timeout: 15000 }
  );
}
```

### Pattern 3: Wrap Multi-Step Actions in toPass()

When multiple conditions must be true before an action:

```typescript
// Wait for button to be enabled, then click
await expect(async () => {
  await expect(playerControls.previousButton).toBeEnabled();
  await playerControls.clickPrevious();
}).toPass({ timeout: 15000 });
```

This handles cases where:
- Button state depends on store updates
- Store updates are async
- React hasn't re-rendered yet

### Timeout Guidelines

| Timeout Type | Local | CI |
|--------------|-------|-----|
| Test timeout | 30s | 45s |
| Expect timeout | 5s | 10s |
| Video load | 10s | 15s |
| Title change | 10s | 15s |

---

## Page Object Model

### Why Use Page Objects

1. **Maintainability**: Change selector in one place
2. **Readability**: Tests read like user stories
3. **Reusability**: Share logic across tests

### Structure

```typescript
export class PlayerControls {
  readonly page: Page;
  readonly playPauseButton: Locator;
  readonly previousButton: Locator;
  readonly nextButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.playPauseButton = page.locator('button:has-text("▶"), button:has-text("⏸")').first();
    this.previousButton = page.locator('button[title="Previous"]');
    this.nextButton = page.locator('button[title="Next"]');
  }

  async clickNext(): Promise<void> {
    await this.nextButton.click();
  }

  async waitForVideoLoaded(): Promise<void> {
    await this.page.waitForFunction(
      () => {
        const title = document.querySelector('[data-testid="player-controls"] p.font-medium');
        return title && title.textContent !== "No video selected";
      },
      { timeout: 15000 }
    );
  }
}
```

### Naming Conventions

- **Actions**: `clickNext()`, `search()`, `toggleMute()`
- **Queries**: `getVideoTitle()`, `getVolume()`, `isPlaying()`
- **Waits**: `waitForVideoLoaded()`, `waitForTitleChange()`
- **Checks**: `isDisabled()`, `isMuted()`, `canGoNext()`

---

## Selectors and Locators

### Prefer data-testid Attributes

Add stable test IDs to components:

```tsx
<div data-testid="player-controls">
  <div data-testid="progress-bar">...</div>
</div>
```

### Button Locator Strategies

**Title attribute (most reliable for icon buttons):**
```typescript
this.previousButton = page.locator('button[title="Previous"]');
```

**Text content (for text buttons):**
```typescript
this.searchButton = page.getByRole("button", { name: "Search", exact: true });
```

**Multiple possible states:**
```typescript
this.playPauseButton = page.locator('button:has-text("▶"), button:has-text("⏸")').first();
```

### Avoid These Patterns

```typescript
// Fragile - class names change
page.locator('.bg-blue-600.hover\\:bg-blue-700');

// Fragile - structure changes
page.locator('.player-wrapper > div:nth-child(2) > button');

// Ambiguous - multiple matches
page.locator('button');
```

---

## CI-Specific Considerations

### GitHub Actions Configuration

```yaml
jobs:
  e2e:
    timeout-minutes: 30
    runs-on: ubuntu-latest
    steps:
      - name: Run E2E tests
        run: npm run test:e2e
        env:
          CI: true
```

### Playwright Config for CI

```typescript
export default defineConfig({
  timeout: 45000,           // Generous test timeout
  expect: { timeout: 10000 }, // Allow slower DOM updates
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "on-failure" }]],
});
```

### Artifact Collection

Always upload artifacts on failure:

```yaml
- name: Upload test results
  uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: test-results
    path: test-results/
```

---

## Common Pitfalls

### 1. Mock Video IDs Must Match YouTube Format

YouTube filters out invalid video IDs. Use exactly 11-character IDs:

```typescript
// Bad - will be filtered out
const videoIds = ["video-1", "video-2"];

// Good - valid YouTube ID format
const videoIds = ["dQw4w9WgXcQ", "jNQXAC9IVRw"];
```

### 2. Cross-Platform Shell Commands

`sed -i` behaves differently on macOS vs Linux:

```bash
# Bad - fails on Linux
sed -i '' 's/old/new/' file.txt

# Bad - fails on macOS
sed -i 's/old/new/' file.txt

# Good - use temp file
sed 's/old/new/' file.txt > file.tmp && mv file.tmp file.txt
```

### 3. Zustand Store Updates Don't Immediately Re-render

When mocking IPC calls, the Zustand store updates synchronously, but React re-rendering is async. Always wait for DOM changes, not store updates.

### 4. Event Listeners Need Mock Infrastructure

Tauri's event system requires:
- `__TAURI_PLUGIN_EVENT__` for emit/listen
- `__TAURI_EVENT_PLUGIN_INTERNALS__` for unregisterListener
- `transformCallback` for callback ID management

### 5. Settings Store Initialization

The frontend reads settings on startup. Ensure mocks are injected BEFORE `page.goto()`:

```typescript
await injectTauriMocks(page, { playbackMode: "youtube" });
await page.goto("/"); // Mocks are ready when app initializes
```

---

## When to Skip Tests

### Valid Reasons to Skip

1. **Fundamental mock limitations**: State synchronization between mocked IPC and React
2. **Platform-specific features**: Can't test macOS-specific behavior on Linux CI
3. **External dependencies**: Real YouTube playback, filesystem access

### How to Skip

```typescript
// Skip with explanation
test.skip("should navigate back to previous song", async ({ page }) => {
  // Test implementation
});

// Or use fixme for temporary skips
test.fixme("feature not yet implemented", async () => {});
```

### Documentation Requirements

When skipping a test:
1. Add comment explaining WHY it's skipped
2. Document in README.md under "Skipped Tests"
3. Note alternative coverage (unit tests, manual testing)
4. Create issue for future investigation if appropriate

### Example Skip Comment

```typescript
// Skip: This test is flaky on CI due to complex timing between Zustand store
// updates (queue history) and React re-renders. The mocked Tauri IPC layer
// doesn't perfectly replicate the state management behavior of the real app.
// The underlying functionality is covered by unit tests and manual testing.
// See: https://github.com/zalun/karaoke-app/issues/125#navigate-back-flaky
test.skip("should navigate back to previous song", async ({ page }) => {
```

---

## Quick Reference

### Test Structure Template

```typescript
import { test, expect } from "@playwright/test";
import { injectTauriMocks, createMockSearchResults } from "../fixtures/tauri-mocks";
import { MainPage, PlayerControls } from "../pages";

test.describe("Feature Name", () => {
  let mainPage: MainPage;
  let playerControls: PlayerControls;

  test.beforeEach(async ({ page }) => {
    await injectTauriMocks(page, {
      searchResults: createMockSearchResults(5),
      ytdlpAvailable: true,
    });

    mainPage = new MainPage(page);
    playerControls = new PlayerControls(page);
    await mainPage.goto();
    await mainPage.waitForAppReady();
  });

  test("should do something", async ({ page }) => {
    // Arrange
    await mainPage.search("test");
    await mainPage.waitForSearchResults();

    // Act
    await mainPage.clickPlayOnResult(0);

    // Assert with retry
    await expect(async () => {
      const title = await playerControls.getVideoTitle();
      expect(title).toContain("Test Karaoke Song");
    }).toPass({ timeout: 15000 });
  });
});
```

### Debugging Failed Tests

1. **Run with UI**: `just e2e-ui`
2. **Run with debug**: `just e2e-debug`
3. **Check artifacts**: Screenshots and videos in `test-results/`
4. **Add console logging**: Mock logs all IPC calls to console
5. **Reduce parallelism**: Run single test with `just e2e-grep "test name"`
