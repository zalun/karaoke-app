# E2E Tests

End-to-end tests for HomeKaraoke using [Playwright](https://playwright.dev/).

## Running Tests

```bash
# Run all E2E tests
just e2e

# Run with Playwright UI
just e2e-ui

# Run in debug mode
just e2e-debug

# Run specific test file
just e2e-file search-and-queue.spec.ts

# Run tests matching pattern
just e2e-grep "should search"
```

## Architecture

```
tests/e2e/
├── fixtures/
│   ├── tauri-mocks.ts    # Tauri API mock infrastructure
│   └── test-data.ts      # Mock data (search results, etc.)
├── pages/
│   ├── main-page.ts      # Main app page object
│   └── player-controls.ts # Player controls page object
└── specs/
    ├── search-and-queue.spec.ts
    ├── video-playback.spec.ts
    ├── queue-management.spec.ts
    ├── error-handling.spec.ts
    └── player-controls.spec.ts
```

## Known Limitations

### Tauri WebDriver Not Supported on macOS

**Important**: Tauri WebDriver only supports Linux and Windows - it does not support macOS. Since HomeKaraoke primarily targets macOS, we use **Playwright standalone mode** instead of Tauri WebDriver.

This means:
- Tests run in a real browser (Chromium/WebKit) with **mocked Tauri APIs**
- The web layer is fully testable
- Native Tauri functionality is mocked, not actually executed

### What CAN Be Tested

- Search functionality and results display
- Queue management (add, remove, reorder, clear)
- Player controls (play/pause, volume, next/previous)
- Navigation between tabs
- Error handling and recovery
- Settings persistence (mocked)

### What CANNOT Be Tested (Requires Manual Testing)

- **Detached player window** - Multi-window communication requires real Tauri
- **Native file system access** - Local library browsing
- **System menu items** - Native macOS menus
- **Real YouTube playback** - Uses mocked stream URLs
- **Window position/size persistence** - Native window management
- **Keyboard shortcuts** - Global shortcuts require native handling

### Skipped Tests

Some tests are skipped due to flakiness in CI environments:

- **"should navigate back to previous song"** - The Previous button state depends on complex timing between Zustand store updates and React re-renders. The mocked IPC layer doesn't perfectly replicate this timing. This functionality is tested via unit tests.

## Mock System

The Tauri mock system (`fixtures/tauri-mocks.ts`) intercepts all Tauri IPC calls and provides mock responses. Key features:

- **In-memory state**: Settings and queue state persist within a test
- **Configurable behavior**: Pass config to `injectTauriMocks()` to customize
- **Dynamic updates**: Use `updateMockConfig()` to change behavior mid-test

### Example: Testing Error Scenarios

```typescript
// Test search failure
await injectTauriMocks(page, {
  shouldFailSearch: true,
});

// Later, recover from error
await updateMockConfig(page, {
  shouldFailSearch: false,
  searchResults: createMockSearchResults(5),
});
```

## Writing New Tests

1. **Use Page Objects** - Don't write selectors directly in tests
2. **Wait for state, not time** - Prefer `expect().toPass()` over `waitForTimeout()`
3. **Mock at the right level** - Mock Tauri commands, not React components
4. **Test user flows** - Focus on what users actually do

### Good Example

```typescript
test("should add video to queue", async ({ page }) => {
  await mainPage.search("test");
  await mainPage.waitForSearchResults();
  await mainPage.clickAddToQueueOnResult(0);

  // Wait for queue to update
  await expect(async () => {
    const count = await mainPage.getQueueItemCount();
    expect(count).toBe(1);
  }).toPass();
});
```

### Avoid

```typescript
// Don't use fixed timeouts
await page.waitForTimeout(500);

// Don't use raw selectors in tests
await page.click('.search-result button');
```

## CI Integration

Tests run on GitHub Actions for every PR:
- Browsers: Chromium, WebKit
- Workers: 2 (parallel)
- Retries: 2 on failure
- Artifacts: Screenshots and videos on failure
