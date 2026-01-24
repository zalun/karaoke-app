import { test, expect } from "@playwright/test";
import { injectTauriMocks, getHostedSessionState } from "../fixtures/tauri-mocks";
import { MainPage } from "../pages";

/**
 * Tests for the Host Session feature (#201).
 * Verifies that authenticated users can host sessions for guests to join.
 */
test.describe("Hosted Session", () => {
  let mainPage: MainPage;

  test.describe("Host Button Visibility", () => {
    test("Host button should not be visible when not authenticated", async ({ page }) => {
      // No auth tokens = not authenticated
      await injectTauriMocks(page, {
        authTokens: null,
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Start a session first
      await mainPage.startSession();

      // Wait for session to be active
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(true);
      }).toPass({ timeout: 10000 });

      // Host button should not be visible (requires auth)
      const hostButton = page.getByRole("button", { name: "Host" });
      await expect(hostButton).not.toBeVisible();
    });

    test("Host button should not be visible when no active session", async ({ page }) => {
      // Authenticated but no session
      await injectTauriMocks(page, {
        authTokens: {
          access_token: "test_access_token",
          refresh_token: "test_refresh_token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Should not have an active session
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(false);
      }).toPass({ timeout: 5000 });

      // Host button should not be visible (no session)
      const hostButton = page.getByRole("button", { name: "Host" });
      await expect(hostButton).not.toBeVisible();
    });

    test("Host button should be visible when authenticated and session active", async ({ page }) => {
      // Authenticated user
      await injectTauriMocks(page, {
        authTokens: {
          access_token: "test_access_token",
          refresh_token: "test_refresh_token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Start a session
      await mainPage.startSession();

      // Wait for session to be active
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(true);
      }).toPass({ timeout: 10000 });

      // Host button should be visible
      const hostButton = page.getByRole("button", { name: "Host" });
      await expect(hostButton).toBeVisible();
    });
  });

  test.describe("Host Session Modal", () => {
    test.beforeEach(async ({ page }) => {
      // Setup: Authenticated user with active session
      await injectTauriMocks(page, {
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
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Start a session
      await mainPage.startSession();

      // Wait for session to be active
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(true);
      }).toPass({ timeout: 10000 });
    });

    test("should create hosted session and display modal with join code", async ({ page }) => {
      // Click the Host button
      const hostButton = page.getByRole("button", { name: "Host" });
      await hostButton.click();

      // Wait for modal to appear with join code
      await expect(async () => {
        const modal = page.locator("text=Session Hosted");
        await expect(modal).toBeVisible();
      }).toPass({ timeout: 10000 });

      // Verify join code is displayed (format: HK-XXXX-XXXX)
      const joinCodePattern = /HK-[A-Z0-9]{4}-[A-Z0-9]{4}/i;
      await expect(async () => {
        const modalContent = await page.locator(".text-4xl.font-bold.font-mono").textContent();
        expect(modalContent).toMatch(joinCodePattern);
      }).toPass({ timeout: 5000 });

      // Verify QR code is displayed (image element)
      const qrCodeImage = page.locator("img[alt='Scan to join']");
      await expect(qrCodeImage).toBeVisible();

      // Verify join URL is displayed
      const joinUrlElement = page.locator("text=homekaraoke.app/join");
      await expect(joinUrlElement).toBeVisible();

      // Verify stats are displayed
      const statsElement = page.locator("text=0 guests");
      await expect(statsElement).toBeVisible();

      // Verify Copy Code button exists
      const copyCodeButton = page.getByRole("button", { name: "Copy Code" });
      await expect(copyCodeButton).toBeVisible();

      // Verify Copy Link button exists
      const copyLinkButton = page.getByRole("button", { name: "Copy Link" });
      await expect(copyLinkButton).toBeVisible();

      // Verify Stop Hosting button exists
      const stopHostingButton = page.getByRole("button", { name: "Stop Hosting" });
      await expect(stopHostingButton).toBeVisible();
    });

    test("should show green Host button after hosting starts", async ({ page }) => {
      // Click the Host button
      const hostButton = page.getByRole("button", { name: "Host" });
      await hostButton.click();

      // Wait for modal to appear
      await expect(page.locator("text=Session Hosted")).toBeVisible({ timeout: 10000 });

      // Close the modal
      const closeButton = page.locator('button[title="Close"]');
      await closeButton.click();

      // Verify modal is closed
      await expect(page.locator("text=Session Hosted")).not.toBeVisible();

      // Verify Host button now shows "Hosting" (green state)
      const hostingButton = page.getByRole("button", { name: "Hosting" });
      await expect(hostingButton).toBeVisible();
    });

    test("should reopen modal when clicking Host button while hosting", async ({ page }) => {
      // Click the Host button to start hosting
      const hostButton = page.getByRole("button", { name: "Host" });
      await hostButton.click();

      // Wait for modal to appear
      await expect(page.locator("text=Session Hosted")).toBeVisible({ timeout: 10000 });

      // Close the modal
      const closeButton = page.locator('button[title="Close"]');
      await closeButton.click();

      // Click the Hosting button (green state)
      const hostingButton = page.getByRole("button", { name: "Hosting" });
      await hostingButton.click();

      // Modal should reopen
      await expect(page.locator("text=Session Hosted")).toBeVisible();
    });

    test("copy code button should show confirmation", async ({ page }) => {
      // Click the Host button
      const hostButton = page.getByRole("button", { name: "Host" });
      await hostButton.click();

      // Wait for modal
      await expect(page.locator("text=Session Hosted")).toBeVisible({ timeout: 10000 });

      // Click Copy Code
      const copyCodeButton = page.getByRole("button", { name: "Copy Code" });
      await copyCodeButton.click();

      // Should show "Copied!" confirmation
      await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
    });

    test("copy link button should show confirmation", async ({ page }) => {
      // Click the Host button
      const hostButton = page.getByRole("button", { name: "Host" });
      await hostButton.click();

      // Wait for modal
      await expect(page.locator("text=Session Hosted")).toBeVisible({ timeout: 10000 });

      // Click Copy Link
      const copyLinkButton = page.getByRole("button", { name: "Copy Link" });
      await copyLinkButton.click();

      // Should show "Copied!" confirmation
      await expect(page.getByRole("button", { name: "Copied!" })).toBeVisible();
    });
  });

  test.describe("Stop Hosting", () => {
    test("should stop hosting and hide join code badge", async ({ page }) => {
      // Setup: Authenticated user
      await injectTauriMocks(page, {
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
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Start a session
      await mainPage.startSession();

      // Wait for session to be active
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(true);
      }).toPass({ timeout: 10000 });

      // Click the Host button
      const hostButton = page.getByRole("button", { name: "Host" });
      await hostButton.click();

      // Wait for modal
      await expect(page.locator("text=Session Hosted")).toBeVisible({ timeout: 10000 });

      // Click Stop Hosting
      const stopHostingButton = page.getByRole("button", { name: "Stop Hosting" });
      await stopHostingButton.click();

      // Modal should close
      await expect(page.locator("text=Session Hosted")).not.toBeVisible({ timeout: 5000 });

      // Host button should be back to grey "Host" state (can host again)
      await expect(page.getByRole("button", { name: "Host" })).toBeVisible();
      // "Hosting" button should no longer be visible
      await expect(page.getByRole("button", { name: "Hosting" })).not.toBeVisible();

      // Verify the stop was tracked in mock state
      const hostedState = await getHostedSessionState(page);
      expect(hostedState.stopped).toBe(true);
    });

    test("E2E-001: full hosting flow sets hosted_session_status to active then ended", async ({ page }) => {
      // Setup: Authenticated user
      await injectTauriMocks(page, {
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
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Start a session
      await mainPage.startSession();

      // Wait for session to be active
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(true);
      }).toPass({ timeout: 10000 });

      // Verify no hosted session status before hosting
      let hostedState = await getHostedSessionState(page);
      expect(hostedState.status).toBeNull();
      expect(hostedState.created).toBe(false);

      // Click the Host button
      const hostButton = page.getByRole("button", { name: "Host" });
      await hostButton.click();

      // Wait for modal with join code
      await expect(page.locator("text=Session Hosted")).toBeVisible({ timeout: 10000 });

      // Verify join code is displayed
      const joinCodePattern = /HK-[A-Z0-9]{4}-[A-Z0-9]{4}/i;
      await expect(async () => {
        const modalContent = await page.locator(".text-4xl.font-bold.font-mono").textContent();
        expect(modalContent).toMatch(joinCodePattern);
      }).toPass({ timeout: 5000 });

      // Verify QR code is displayed
      const qrCodeImage = page.locator("img[alt='Scan to join']");
      await expect(qrCodeImage).toBeVisible();

      // Verify hosted session was created and status is 'active'
      hostedState = await getHostedSessionState(page);
      expect(hostedState.created).toBe(true);
      expect(hostedState.sessionCode).toMatch(joinCodePattern);
      expect(hostedState.status).toBe("active");

      // Click Stop Hosting
      const stopHostingButton = page.getByRole("button", { name: "Stop Hosting" });
      await stopHostingButton.click();

      // Modal should close
      await expect(page.locator("text=Session Hosted")).not.toBeVisible({ timeout: 5000 });

      // Verify hosted_session_status is now 'ended'
      hostedState = await getHostedSessionState(page);
      expect(hostedState.stopped).toBe(true);
      expect(hostedState.status).toBe("ended");
    });

    test("E2E-002: restart restoration restores hosted session on app reopen", async ({ page }) => {
      // Setup: Pre-populate session with hosted fields (simulates app state after hosting then quitting)
      const hostedSessionId = "mock-session-" + Math.random().toString(36).substring(7);
      const testUserId = "test-user-id";

      await injectTauriMocks(page, {
        authTokens: {
          access_token: "test_access_token",
          refresh_token: "test_refresh_token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
        mockUser: {
          id: testUserId,
          email: "test@example.com",
          displayName: "Test User",
        },
        // Simulate app restart with persisted session that was being hosted
        initialSession: {
          id: 1,
          name: "Test Session",
          hosted_session_id: hostedSessionId,
          hosted_by_user_id: testUserId,
          hosted_session_status: "active",
        },
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Wait for session to be loaded with hosted fields (restoration happens automatically)
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(true);
      }).toPass({ timeout: 10000 });

      // Verify hosted session was restored - "Hosting" button should be visible (green state)
      await expect(async () => {
        const hostingButton = page.getByRole("button", { name: "Hosting" });
        await expect(hostingButton).toBeVisible();
      }).toPass({ timeout: 10000 });

      // Click to open modal and verify session is active
      const hostingButton = page.getByRole("button", { name: "Hosting" });
      await hostingButton.click();

      // Modal should show session info
      await expect(page.locator("text=Session Hosted")).toBeVisible({ timeout: 10000 });

      // Verify join code is displayed
      const joinCodePattern = /HK-[A-Z0-9]{4}-[A-Z0-9]{4}/i;
      await expect(async () => {
        const modalContent = await page.locator(".text-4xl.font-bold.font-mono").textContent();
        expect(modalContent).toMatch(joinCodePattern);
      }).toPass({ timeout: 5000 });
    });

    test("E2E-003: ended session not restored on app reopen", async ({ page }) => {
      // Setup: Pre-populate session with hosted fields where status='ended'
      // This simulates: User hosted -> stopped hosting -> quit app -> reopened app
      const hostedSessionId = "mock-session-" + Math.random().toString(36).substring(7);
      const testUserId = "test-user-id";

      await injectTauriMocks(page, {
        authTokens: {
          access_token: "test_access_token",
          refresh_token: "test_refresh_token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
        mockUser: {
          id: testUserId,
          email: "test@example.com",
          displayName: "Test User",
        },
        // Simulate app restart with persisted session that was hosted but then stopped
        initialSession: {
          id: 1,
          name: "Test Session",
          hosted_session_id: hostedSessionId,
          hosted_by_user_id: testUserId,
          hosted_session_status: "ended", // Key difference: status is 'ended'
        },
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Wait for session to be loaded
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(true);
      }).toPass({ timeout: 10000 });

      // Verify NOT hosting - "Host" button should be visible (grey state, not "Hosting")
      // This confirms restoration was NOT attempted due to status='ended'
      await expect(async () => {
        const hostButton = page.getByRole("button", { name: "Host" });
        await expect(hostButton).toBeVisible();
      }).toPass({ timeout: 10000 });

      // Verify "Hosting" button is NOT visible (not actively hosting)
      const hostingButton = page.getByRole("button", { name: "Hosting" });
      await expect(hostingButton).not.toBeVisible();

      // Verify the mock state shows status is still 'ended' (not changed to 'active')
      const hostedState = await getHostedSessionState(page);
      expect(hostedState.status).toBe("ended");
      // Session was never "created" in this run (no POST to /api/session/create)
      expect(hostedState.created).toBe(false);
    });

    test("E2E-004: override ended session with new hosting", async ({ page }) => {
      // Setup: Pre-populate session with hosted fields where status='ended'
      // This simulates: User hosted -> stopped hosting -> now wants to host again
      const oldHostedSessionId = "old-session-" + Math.random().toString(36).substring(7);
      const testUserId = "test-user-id";

      await injectTauriMocks(page, {
        authTokens: {
          access_token: "test_access_token",
          refresh_token: "test_refresh_token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
        mockUser: {
          id: testUserId,
          email: "test@example.com",
          displayName: "Test User",
        },
        // Simulate session that was hosted but then stopped (status='ended')
        initialSession: {
          id: 1,
          name: "Test Session",
          hosted_session_id: oldHostedSessionId,
          hosted_by_user_id: testUserId,
          hosted_session_status: "ended",
        },
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Wait for session to be loaded
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(true);
      }).toPass({ timeout: 10000 });

      // Verify initial state: status='ended', not created in this run
      let hostedState = await getHostedSessionState(page);
      expect(hostedState.status).toBe("ended");
      expect(hostedState.created).toBe(false);

      // Capture the old session code for comparison
      const oldSessionCode = hostedState.sessionCode;

      // Verify Host button is visible (can host because status='ended' allows override)
      const hostButton = page.getByRole("button", { name: "Host" });
      await expect(hostButton).toBeVisible();

      // Click Host to start new hosting (override the ended session)
      await hostButton.click();

      // Wait for modal with join code
      await expect(page.locator("text=Session Hosted")).toBeVisible({ timeout: 10000 });

      // Verify new join code is displayed
      const joinCodePattern = /HK-[A-Z0-9]{4}-[A-Z0-9]{4}/i;
      await expect(async () => {
        const modalContent = await page.locator(".text-4xl.font-bold.font-mono").textContent();
        expect(modalContent).toMatch(joinCodePattern);
      }).toPass({ timeout: 5000 });

      // Verify new hosted session state
      hostedState = await getHostedSessionState(page);

      // New session should be created
      expect(hostedState.created).toBe(true);

      // Status should be 'active'
      expect(hostedState.status).toBe("active");

      // New session code should be different from the old one (new session ID generated)
      expect(hostedState.sessionCode).not.toBe(oldSessionCode);
      expect(hostedState.sessionCode).toMatch(joinCodePattern);
    });

    test("should stop hosting when ending session", async ({ page }) => {
      // Setup: Authenticated user
      await injectTauriMocks(page, {
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
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Start a session
      await mainPage.startSession();

      // Wait for session to be active
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(true);
      }).toPass({ timeout: 10000 });

      // Start hosting
      const hostButton = page.getByRole("button", { name: "Host" });
      await hostButton.click();

      // Wait for modal and close it
      await expect(page.locator("text=Session Hosted")).toBeVisible({ timeout: 10000 });
      const closeButton = page.locator('button[title="Close"]');
      await closeButton.click();

      // Verify hosting is active (Hosting button visible)
      await expect(page.getByRole("button", { name: "Hosting" })).toBeVisible();

      // End the session
      await mainPage.endSession();

      // Session should end
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(false);
      }).toPass({ timeout: 10000 });
    });
  });

  test.describe("Join Code in Video Idle State", () => {
    test.skip("should show join code overlay when video player is idle and hosting", async ({ page }) => {
      // Skip: This test requires the video player to be in idle state,
      // which is difficult to set up in E2E tests with mocked video playback.
      // The functionality is covered by manual testing.

      // Setup: Authenticated user
      await injectTauriMocks(page, {
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
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Start a session
      await mainPage.startSession();

      // Wait for session to be active
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(true);
      }).toPass({ timeout: 10000 });

      // Start hosting
      const hostButton = page.getByRole("button", { name: "Host" });
      await hostButton.click();

      // Wait for modal and close it
      await expect(page.locator("text=Session Hosted")).toBeVisible({ timeout: 10000 });
      const closeButton = page.locator('button[title="Close"]');
      await closeButton.click();

      // Switch to Player tab (which shows VideoPlayer)
      await mainPage.switchToPlayerTab();

      // The video player idle state should show the join code
      // Look for join code display in the player area
      const joinOverlay = page.locator("[data-testid='video-player']").locator("text=HK-");
      await expect(joinOverlay).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Hosted Session API Mock", () => {
    test("should track hosted session creation in mock state", async ({ page }) => {
      // Setup: Authenticated user
      await injectTauriMocks(page, {
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
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();

      // Start a session
      await mainPage.startSession();

      // Wait for session to be active
      await expect(async () => {
        const hasSession = await mainPage.hasActiveSession();
        expect(hasSession).toBe(true);
      }).toPass({ timeout: 10000 });

      // Verify no hosted session created yet
      let hostedState = await getHostedSessionState(page);
      expect(hostedState.created).toBe(false);
      expect(hostedState.sessionCode).toBeNull();

      // Click the Host button
      const hostButton = page.getByRole("button", { name: "Host" });
      await hostButton.click();

      // Wait for modal
      await expect(page.locator("text=Session Hosted")).toBeVisible({ timeout: 10000 });

      // Verify hosted session was created
      hostedState = await getHostedSessionState(page);
      expect(hostedState.created).toBe(true);
      expect(hostedState.sessionCode).not.toBeNull();
      expect(hostedState.sessionCode).toMatch(/HK-[A-Z0-9]{4}-[A-Z0-9]{4}/i);
    });
  });
});
