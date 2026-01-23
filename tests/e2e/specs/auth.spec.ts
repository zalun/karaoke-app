import { test, expect } from "@playwright/test";
import { injectTauriMocks, emitTauriEvent } from "../fixtures/tauri-mocks";
import { MainPage } from "../pages";

/** Type-safe interface for mock window properties injected by tauri-mocks */
interface MockWindow {
  __AUTH_PENDING_STATE__?: string;
  __AUTH_LOGIN_OPENED__?: boolean;
  __TAURI_INTERNALS__?: {
    invoke: (cmd: string) => Promise<unknown>;
  };
}

test.describe("Authentication", () => {
  let mainPage: MainPage;

  test.describe("Sign In Button", () => {
    test.beforeEach(async ({ page }) => {
      // Inject mocks with no auth tokens (not signed in)
      await injectTauriMocks(page, {
        authTokens: null,
        trackAuthLoginOpened: true,
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();
    });

    test("should display Sign In button when not authenticated", async ({ page }) => {
      const signInButton = page.getByRole("button", { name: "Sign In" });
      await expect(signInButton).toBeVisible();
    });

    test("should open browser for login when Sign In button is clicked", async ({ page }) => {
      const signInButton = page.getByRole("button", { name: "Sign In" });
      await signInButton.click();

      // Verify the auth_open_login command was called
      await expect(async () => {
        const loginOpened = await page.evaluate(() => {
          return (window as unknown as MockWindow).__AUTH_LOGIN_OPENED__;
        });
        expect(loginOpened).toBe(true);
      }).toPass({ timeout: 5000 });
    });
  });

  test.describe("Auth Callback", () => {
    test.beforeEach(async ({ page }) => {
      // Start with no auth tokens
      await injectTauriMocks(page, {
        authTokens: null,
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();
    });

    test("should store tokens on successful auth callback", async ({ page }) => {
      // Verify Sign In button is initially visible
      const signInButton = page.getByRole("button", { name: "Sign In" });
      await expect(signInButton).toBeVisible();

      // Click sign in to initiate OAuth flow (sets pending state for CSRF protection)
      await signInButton.click();

      // Get the CSRF state that was generated when sign in was clicked
      const pendingState = await page.evaluate(() => {
        return (window as unknown as MockWindow).__AUTH_PENDING_STATE__;
      });
      expect(pendingState).toBeTruthy();

      // Simulate auth callback event (as if user completed OAuth in browser)
      const mockTokens = {
        access_token: "mock_access_token_123",
        refresh_token: "mock_refresh_token_456",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        state: pendingState, // Use the actual CSRF state
      };

      await emitTauriEvent(page, "auth:callback", mockTokens);

      // Wait for auth state to update and verify tokens were stored
      await expect(async () => {
        const storedTokens = await page.evaluate(async () => {
          const internals = (window as unknown as MockWindow).__TAURI_INTERNALS__;
          if (!internals) return null;
          return internals.invoke("auth_get_tokens");
        });

        expect(storedTokens).toEqual(
          expect.objectContaining({
            access_token: "mock_access_token_123",
            refresh_token: "mock_refresh_token_456",
          })
        );
      }).toPass({ timeout: 5000 });
    });
  });

  test.describe("Sign Out", () => {
    test.beforeEach(async ({ page }) => {
      // Start with existing auth tokens (signed in state)
      await injectTauriMocks(page, {
        authTokens: {
          access_token: "existing_access_token",
          refresh_token: "existing_refresh_token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        },
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();
    });

    test("should clear tokens on sign out", async ({ page }) => {
      // Since user menu requires a real user profile (from Supabase),
      // and Supabase isn't configured in tests, we test the command directly
      await page.evaluate(async () => {
        const internals = (window as unknown as MockWindow).__TAURI_INTERNALS__;
        if (!internals) return;
        await internals.invoke("auth_clear_tokens");
      });

      // Verify tokens were cleared
      const storedTokens = await page.evaluate(async () => {
        const internals = (window as unknown as MockWindow).__TAURI_INTERNALS__;
        if (!internals) return null;
        return internals.invoke("auth_get_tokens");
      });

      expect(storedTokens).toBeNull();
    });
  });

  test.describe("Offline Indicator", () => {
    test.beforeEach(async ({ page }) => {
      await injectTauriMocks(page, {
        authTokens: null,
      });

      mainPage = new MainPage(page);
      await mainPage.goto();
      await mainPage.waitForAppReady();
    });

    test("should show offline indicator when network is unavailable", async ({ page }) => {
      // Simulate going offline
      await page.evaluate(() => {
        window.dispatchEvent(new Event("offline"));
      });

      // Wait for the offline indicator to appear
      const offlineIndicator = page.locator("text=Offline");
      await expect(offlineIndicator).toBeVisible({ timeout: 5000 });
    });

    test("should hide offline indicator when network is restored", async ({ page }) => {
      // First go offline
      await page.evaluate(() => {
        window.dispatchEvent(new Event("offline"));
      });

      const offlineIndicator = page.locator("text=Offline");
      await expect(offlineIndicator).toBeVisible({ timeout: 5000 });

      // Then go back online
      await page.evaluate(() => {
        window.dispatchEvent(new Event("online"));
      });

      await expect(offlineIndicator).not.toBeVisible({ timeout: 5000 });
    });

    test("should disable Sign In button when offline", async ({ page }) => {
      // Go offline
      await page.evaluate(() => {
        window.dispatchEvent(new Event("offline"));
      });

      // Check that Sign In button is disabled
      const signInButton = page.getByRole("button", { name: "Sign In" });
      await expect(signInButton).toBeDisabled({ timeout: 5000 });
    });
  });
});
