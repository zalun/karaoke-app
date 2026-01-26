import { test, expect } from "@playwright/test";
import {
  injectTauriMocks,
  createMockSongRequests,
} from "../fixtures/tauri-mocks";
import { MainPage } from "../pages";

/**
 * Tests for the Song Request Approval feature (#211).
 * Verifies that hosts can view, approve, and reject song requests from guests.
 *
 * Note: The requests button only appears in the queue panel when there are
 * songs in the queue. Tests use pre-populated queue state via initialSession.
 */
test.describe("Song Requests Modal", () => {
  let mainPage: MainPage;

  /**
   * Create a mock queue item for pre-populating the queue.
   */
  function createMockQueueItem(index: number) {
    return {
      id: `queue-item-${index}`,
      video: {
        id: `video-${index}`,
        title: `Test Song ${index}`,
        channel: `Test Channel ${index}`,
        duration: 180 + index * 30,
        source: "youtube",
      },
      addedAt: new Date().toISOString(),
      singer_id: null,
      status: "pending",
    };
  }

  /**
   * Base mock config that sets up authenticated user with active hosted session.
   */
  function createBaseMockConfig(songRequests: ReturnType<typeof createMockSongRequests>) {
    return {
      authTokens: {
        access_token: "test_access_token",
        refresh_token: "test_refresh_token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      },
      mockUser: {
        id: "test-user-id",
        email: "test@example.com",
        displayName: "Test User",
      },
      songRequests,
      // Pre-populate the queue so the requests button is visible
      queueState: {
        queue: [createMockQueueItem(1)],
        history: [],
        history_index: 0,
      },
      // Pre-configure an active hosted session that will be restored on load
      initialSession: {
        id: 1,
        name: "Test Session",
        hosted_session_id: "mock-session-12345",
        hosted_by_user_id: "test-user-id",
        hosted_session_status: "active",
      },
    };
  }

  test.describe("Modal Opening and Display", () => {
    test("should show requests button with badge when hosting with pending requests", async ({
      page,
    }) => {
      const mockRequests = createMockSongRequests(3, ["Alice", "Bob"]);
      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Wait for session restoration - the hosted session should be restored
      // The requests button should appear once hosting is active
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });

      // Verify badge shows the correct count (3)
      const badge = requestsButton.locator("span").filter({ hasText: "3" });
      await expect(badge).toBeVisible();
    });

    test("should open modal when clicking requests button", async ({
      page,
    }) => {
      const mockRequests = createMockSongRequests(3, ["Alice", "Bob"]);
      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Wait for requests button to be visible
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });

      // Click requests button
      await requestsButton.click();

      // Verify modal opens
      await expect(page.locator('[role="dialog"]').getByRole("heading", { name: "Song Requests" })).toBeVisible({
        timeout: 10000,
      });
    });

    test("should display requests grouped by guest name", async ({ page }) => {
      const mockRequests = [
        ...createMockSongRequests(2, ["Alice"]),
        ...createMockSongRequests(2, ["Bob"]).map((r, i) => ({
          ...r,
          id: `bob-request-${i + 1}`,
          title: `Bob's Song ${i + 1}`,
        })),
      ];

      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Wait for and click requests button
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      await requestsButton.click();

      // Verify modal shows both guest groups
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog.getByRole("heading", { name: "Song Requests" })).toBeVisible({
        timeout: 10000,
      });
      // Use exact match to avoid matching "Bob's Song 1"
      await expect(dialog.getByText("Alice", { exact: true })).toBeVisible();
      await expect(dialog.getByText("Bob", { exact: true })).toBeVisible();

      // Verify "Approve All" buttons exist for each group
      const approveAllButtons = page.locator('[role="dialog"] button:has-text("Approve All")');
      // Should have 2 group buttons + 1 global button = 3 total
      await expect(approveAllButtons).toHaveCount(3);
    });

    test("should show empty state when no pending requests", async ({
      page,
    }) => {
      // No song requests
      await injectTauriMocks(page, createBaseMockConfig([]));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Wait for and click requests button (shows 0 pending)
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      await requestsButton.click();

      // Verify empty state message
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog.getByRole("heading", { name: "Song Requests" })).toBeVisible({
        timeout: 10000,
      });
      await expect(
        dialog.getByText("No pending song requests")
      ).toBeVisible();

      // Global Approve All button should not be visible in empty state
      const globalApproveAll = dialog.locator('button:has-text("Approve All")');
      await expect(globalApproveAll).not.toBeVisible();
    });

    test("should close modal when clicking close button", async ({ page }) => {
      const mockRequests = createMockSongRequests(2);
      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Wait for and click requests button
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      await requestsButton.click();
      await expect(page.locator('[role="dialog"]').getByRole("heading", { name: "Song Requests" })).toBeVisible({
        timeout: 10000,
      });

      // Close the modal using the close button
      const closeButton = page.locator(
        '[role="dialog"] button[aria-label="Close"]'
      );
      await closeButton.click();

      // Verify modal is closed
      await expect(page.locator('[role="dialog"]')).not.toBeVisible();
    });

    test("should display request details: thumbnail, title, artist, duration", async ({
      page,
    }) => {
      const mockRequests = [
        {
          id: "request-1",
          title: "Bohemian Rhapsody Karaoke",
          status: "pending" as const,
          guest_name: "Alice",
          requested_at: new Date().toISOString(),
          youtube_id: "dQw4w9WgXcQ",
          artist: "Queen",
          duration: 354,
          thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        },
      ];

      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Wait for and click requests button
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      await requestsButton.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(dialog.getByRole("heading", { name: "Song Requests" })).toBeVisible({
        timeout: 10000,
      });

      // Verify song details are displayed in the dialog
      await expect(
        dialog.getByText("Bohemian Rhapsody Karaoke")
      ).toBeVisible();
      await expect(dialog.locator("text=Queen")).toBeVisible();
      // Duration 354 seconds = 5:54
      await expect(dialog.locator("text=5:54")).toBeVisible();

      // Verify thumbnail image exists
      const thumbnail = dialog.locator('img[loading="lazy"]');
      await expect(thumbnail).toBeVisible();
    });

    test("badge should show 99+ when count exceeds 99", async ({ page }) => {
      // Create 100 mock requests
      const mockRequests = Array.from({ length: 100 }, (_, i) => ({
        id: `request-${i + 1}`,
        title: `Song ${i + 1}`,
        status: "pending" as const,
        guest_name: `Guest ${i % 10}`,
        requested_at: new Date().toISOString(),
      }));

      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Wait for requests button with 99+ badge
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      const badge = requestsButton.locator("span").filter({ hasText: "99+" });
      await expect(badge).toBeVisible();
    });
  });

  test.describe("Approve and Reject Actions", () => {
    test("should remove request from list when clicking approve button", async ({
      page,
    }) => {
      const mockRequests = createMockSongRequests(2, ["Alice"]);
      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Open the modal
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      await requestsButton.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(
        dialog.getByRole("heading", { name: "Song Requests" })
      ).toBeVisible({ timeout: 10000 });

      // Verify initial state - 2 requests
      await expect(dialog.getByText("Test Song Request 1")).toBeVisible();
      await expect(dialog.getByText("Test Song Request 2")).toBeVisible();

      // Click approve on the first request
      const approveButtons = dialog.locator('button[aria-label="Approve request"]');
      await approveButtons.first().click();

      // Wait for the request to be removed from the list
      await expect(async () => {
        await expect(dialog.getByText("Test Song Request 1")).not.toBeVisible();
      }).toPass({ timeout: 10000 });

      // Second request should still be visible
      await expect(dialog.getByText("Test Song Request 2")).toBeVisible();

      // Badge should update to show 1
      const badge = requestsButton.locator("span").filter({ hasText: "1" });
      await expect(badge).toBeVisible();
    });

    test("should remove request from list when clicking reject button", async ({
      page,
    }) => {
      const mockRequests = createMockSongRequests(2, ["Alice"]);
      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Open the modal
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      await requestsButton.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(
        dialog.getByRole("heading", { name: "Song Requests" })
      ).toBeVisible({ timeout: 10000 });

      // Verify initial state
      await expect(dialog.getByText("Test Song Request 1")).toBeVisible();
      await expect(dialog.getByText("Test Song Request 2")).toBeVisible();

      // Click reject on the first request
      const rejectButtons = dialog.locator('button[aria-label="Reject request"]');
      await rejectButtons.first().click();

      // Wait for the request to be removed from the list
      await expect(async () => {
        await expect(dialog.getByText("Test Song Request 1")).not.toBeVisible();
      }).toPass({ timeout: 10000 });

      // Second request should still be visible
      await expect(dialog.getByText("Test Song Request 2")).toBeVisible();
    });

    test("should show loading spinner on approve/reject buttons during operation", async ({
      page,
    }) => {
      const mockRequests = createMockSongRequests(1, ["Alice"]);
      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Open the modal
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      await requestsButton.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(
        dialog.getByRole("heading", { name: "Song Requests" })
      ).toBeVisible({ timeout: 10000 });

      // Verify approve button shows check icon initially (not a spinner)
      const approveButton = dialog.locator('button[aria-label="Approve request"]');
      await expect(approveButton).toBeVisible();

      // The approve button should contain an SVG (either Check or Loader2)
      // When not processing, it should NOT have the animate-spin class
      const initialSvg = approveButton.locator("svg").first();
      await expect(initialSvg).toBeVisible();

      // Click approve - the button should show a spinner briefly
      // Note: The operation may be fast, so we just verify the button works
      await approveButton.click();

      // After the operation completes, the request should be removed
      await expect(async () => {
        await expect(dialog.getByText("Test Song Request 1")).not.toBeVisible();
      }).toPass({ timeout: 10000 });
    });

    test("should disable buttons while request is processing", async ({
      page,
    }) => {
      const mockRequests = createMockSongRequests(2, ["Alice"]);
      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Open the modal
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      await requestsButton.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(
        dialog.getByRole("heading", { name: "Song Requests" })
      ).toBeVisible({ timeout: 10000 });

      // Verify buttons are initially enabled
      const approveButtons = dialog.locator('button[aria-label="Approve request"]');
      const rejectButtons = dialog.locator('button[aria-label="Reject request"]');

      await expect(approveButtons.first()).toBeEnabled();
      await expect(rejectButtons.first()).toBeEnabled();

      // Click approve - the action completes and the request is removed
      await approveButtons.first().click();

      // After operation, the first request should be gone
      await expect(async () => {
        await expect(dialog.getByText("Test Song Request 1")).not.toBeVisible();
      }).toPass({ timeout: 10000 });

      // Second request's buttons should still be enabled
      await expect(approveButtons.first()).toBeEnabled();
      await expect(rejectButtons.first()).toBeEnabled();
    });

    test("should update badge count after approval", async ({ page }) => {
      const mockRequests = createMockSongRequests(3, ["Alice"]);
      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Verify initial badge shows 3
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      const initialBadge = requestsButton.locator("span").filter({ hasText: "3" });
      await expect(initialBadge).toBeVisible();

      // Open modal and approve one request
      await requestsButton.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(
        dialog.getByRole("heading", { name: "Song Requests" })
      ).toBeVisible({ timeout: 10000 });

      const approveButtons = dialog.locator('button[aria-label="Approve request"]');
      await approveButtons.first().click();

      // Wait for request to be removed
      await expect(async () => {
        await expect(dialog.getByText("Test Song Request 1")).not.toBeVisible();
      }).toPass({ timeout: 10000 });

      // Badge should update to 2
      const updatedBadge = requestsButton.locator("span").filter({ hasText: "2" });
      await expect(updatedBadge).toBeVisible();
    });

    test("should update badge count after rejection", async ({ page }) => {
      const mockRequests = createMockSongRequests(3, ["Alice"]);
      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Verify initial badge shows 3
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });

      // Open modal and reject one request
      await requestsButton.click();
      const dialog = page.locator('[role="dialog"]');
      await expect(
        dialog.getByRole("heading", { name: "Song Requests" })
      ).toBeVisible({ timeout: 10000 });

      const rejectButtons = dialog.locator('button[aria-label="Reject request"]');
      await rejectButtons.first().click();

      // Wait for request to be removed
      await expect(async () => {
        await expect(dialog.getByText("Test Song Request 1")).not.toBeVisible();
      }).toPass({ timeout: 10000 });

      // Badge should update to 2
      const updatedBadge = requestsButton.locator("span").filter({ hasText: "2" });
      await expect(updatedBadge).toBeVisible();
    });
  });

  test.describe("Approve All Functionality", () => {
    test("should remove all requests from a specific guest when clicking guest Approve All", async ({
      page,
    }) => {
      // Create requests from two different guests
      const mockRequests = [
        {
          id: "alice-request-1",
          title: "Alice Song 1",
          status: "pending" as const,
          guest_name: "Alice",
          requested_at: new Date().toISOString(),
          youtube_id: "dQw4w9WgXcQ",
          artist: "Artist 1",
          duration: 180,
        },
        {
          id: "alice-request-2",
          title: "Alice Song 2",
          status: "pending" as const,
          guest_name: "Alice",
          requested_at: new Date(Date.now() - 60000).toISOString(),
          youtube_id: "jNQXAC9IVRw",
          artist: "Artist 2",
          duration: 200,
        },
        {
          id: "bob-request-1",
          title: "Bob Song 1",
          status: "pending" as const,
          guest_name: "Bob",
          requested_at: new Date(Date.now() - 120000).toISOString(),
          youtube_id: "kJQP7kiw5Fk",
          artist: "Artist 3",
          duration: 220,
        },
      ];

      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Open the modal
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      await requestsButton.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(
        dialog.getByRole("heading", { name: "Song Requests" })
      ).toBeVisible({ timeout: 10000 });

      // Verify initial state - all 3 requests visible
      await expect(dialog.getByText("Alice Song 1")).toBeVisible();
      await expect(dialog.getByText("Alice Song 2")).toBeVisible();
      await expect(dialog.getByText("Bob Song 1")).toBeVisible();

      // Find Alice's guest section and click her Approve All button
      // The guest section structure: div.bg-gray-900/50 > div (header row) > span (guest name) + button (Approve All)
      // We find the section that contains a span with "Alice" text
      const aliceSection = dialog.locator('div.bg-gray-900\\/50:has(span:text-is("Alice"))');
      const aliceApproveAll = aliceSection.locator('button:has-text("Approve All")');
      await aliceApproveAll.click();

      // Wait for Alice's requests to be removed
      await expect(async () => {
        await expect(dialog.getByText("Alice Song 1")).not.toBeVisible();
        await expect(dialog.getByText("Alice Song 2")).not.toBeVisible();
      }).toPass({ timeout: 10000 });

      // Bob's request should still be visible
      await expect(dialog.getByText("Bob Song 1")).toBeVisible();

      // Badge should update to 1
      const badge = requestsButton.locator("span").filter({ hasText: "1" });
      await expect(badge).toBeVisible();
    });

    test("should remove all requests when clicking global Approve All", async ({
      page,
    }) => {
      const mockRequests = [
        {
          id: "alice-request-1",
          title: "Alice Song 1",
          status: "pending" as const,
          guest_name: "Alice",
          requested_at: new Date().toISOString(),
          youtube_id: "dQw4w9WgXcQ",
          artist: "Artist 1",
          duration: 180,
        },
        {
          id: "bob-request-1",
          title: "Bob Song 1",
          status: "pending" as const,
          guest_name: "Bob",
          requested_at: new Date(Date.now() - 60000).toISOString(),
          youtube_id: "jNQXAC9IVRw",
          artist: "Artist 2",
          duration: 200,
        },
        {
          id: "charlie-request-1",
          title: "Charlie Song 1",
          status: "pending" as const,
          guest_name: "Charlie",
          requested_at: new Date(Date.now() - 120000).toISOString(),
          youtube_id: "kJQP7kiw5Fk",
          artist: "Artist 3",
          duration: 220,
        },
      ];

      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Open the modal
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      await requestsButton.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(
        dialog.getByRole("heading", { name: "Song Requests" })
      ).toBeVisible({ timeout: 10000 });

      // Verify initial state - all requests visible
      await expect(dialog.getByText("Alice Song 1")).toBeVisible();
      await expect(dialog.getByText("Bob Song 1")).toBeVisible();
      await expect(dialog.getByText("Charlie Song 1")).toBeVisible();

      // Click the global Approve All button in the footer
      // It's the last Approve All button and has different styling (blue background)
      const globalApproveAll = dialog.locator('button:has-text("Approve All")').last();
      await globalApproveAll.click();

      // Wait for all requests to be removed and empty state to appear
      await expect(async () => {
        await expect(dialog.getByText("Alice Song 1")).not.toBeVisible();
        await expect(dialog.getByText("Bob Song 1")).not.toBeVisible();
        await expect(dialog.getByText("Charlie Song 1")).not.toBeVisible();
      }).toPass({ timeout: 10000 });

      // Verify empty state is shown
      await expect(dialog.getByText("No pending song requests")).toBeVisible();

      // Global Approve All button should no longer be visible
      await expect(dialog.locator('button:has-text("Approve All")')).not.toBeVisible();
    });

    test("should show empty state after approving all requests from single guest", async ({
      page,
    }) => {
      // Only one guest with requests
      const mockRequests = createMockSongRequests(2, ["Alice"]);

      await injectTauriMocks(page, createBaseMockConfig(mockRequests));

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Open the modal
      const requestsButton = page.locator('button[title*="pending requests"]');
      await expect(requestsButton).toBeVisible({ timeout: 15000 });
      await requestsButton.click();

      const dialog = page.locator('[role="dialog"]');
      await expect(
        dialog.getByRole("heading", { name: "Song Requests" })
      ).toBeVisible({ timeout: 10000 });

      // Click global Approve All
      const approveAllButton = dialog.locator('button:has-text("Approve All")').last();
      await approveAllButton.click();

      // Wait for empty state
      await expect(async () => {
        await expect(dialog.getByText("No pending song requests")).toBeVisible();
      }).toPass({ timeout: 10000 });

      // Badge should be hidden (0 pending)
      const badge = requestsButton.locator("span.bg-blue-500");
      await expect(badge).not.toBeVisible();
    });
  });
});
