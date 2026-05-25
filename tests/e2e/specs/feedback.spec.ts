import { test, expect } from "@playwright/test";
import { injectTauriMocks, emitTauriEvent, type TauriMockConfig } from "../fixtures/tauri-mocks";
import { MainPage } from "../pages";

/**
 * Tests for the in-app feedback flow (#225).
 *
 * The native `Feedback` menu emits an `open-feedback` event carrying the chosen
 * type; the frontend opens <FeedbackDialog> in response. These tests fake that
 * event and mock the POST /api/feedback backend to exercise the dialog flow.
 */
test.describe("Feedback Dialog", () => {
  let mainPage: MainPage;

  async function setup(page: import("@playwright/test").Page, config: TauriMockConfig = {}) {
    await injectTauriMocks(page, config);
    mainPage = new MainPage(page);
    await mainPage.goto();
    await mainPage.waitForAppReady();
  }

  async function openFeedback(page: import("@playwright/test").Page, type: "bug" | "feature" | "other") {
    await emitTauriEvent(page, "open-feedback", { type });
    await expect(page.getByTestId("feedback-dialog")).toBeVisible();
  }

  async function fillValidForm(page: import("@playwright/test").Page) {
    await page.getByTestId("feedback-title").fill("Playback freezes");
    await page.getByTestId("feedback-body").fill("Video freezes after a few seconds.");
  }

  test("opens with the bug type pre-selected", async ({ page }) => {
    await setup(page);
    await openFeedback(page, "bug");
    await expect(page.getByText("Report a Bug")).toBeVisible();
  });

  test("opens with the feature type pre-selected", async ({ page }) => {
    await setup(page);
    await openFeedback(page, "feature");
    await expect(page.getByText("Suggest a Feature")).toBeVisible();
  });

  test("opens with the other type pre-selected", async ({ page }) => {
    await setup(page);
    await openFeedback(page, "other");
    await expect(page.getByText("Send Feedback")).toBeVisible();
  });

  test("renders the non-dismissable privacy banner", async ({ page }) => {
    await setup(page);
    await openFeedback(page, "bug");
    await expect(page.getByTestId("feedback-banner")).toContainText(
      "Tytuł i opis pojawią się publicznie na GitHubie. Email i logi zostaną tylko u nas (prywatnie)."
    );
    // There is no control to dismiss the banner.
    await expect(page.getByTestId("feedback-banner")).toBeVisible();
  });

  test("blocks submission and shows errors when title and body are empty", async ({ page }) => {
    await setup(page);
    await openFeedback(page, "bug");
    await page.getByTestId("feedback-submit").click();
    await expect(page.getByTestId("feedback-title-error")).toBeVisible();
    await expect(page.getByTestId("feedback-body-error")).toBeVisible();
    // Still on the form, no success state.
    await expect(page.getByTestId("feedback-success")).toHaveCount(0);
  });

  test("shows the GitHub issue link on a successful submission", async ({ page }) => {
    await setup(page, {
      feedbackResponse: {
        status: 200,
        ok: true,
        githubIssueUrl: "https://github.com/zalun/karaoke-app/issues/123",
      },
    });
    await openFeedback(page, "bug");
    await fillValidForm(page);
    await page.getByTestId("feedback-submit").click();

    await expect(page.getByTestId("feedback-issue-url")).toContainText(
      "https://github.com/zalun/karaoke-app/issues/123"
    );
    await expect(page.getByTestId("feedback-open-issue")).toBeVisible();
    await expect(page.getByTestId("feedback-copy-link")).toBeVisible();
  });

  test("shows a follow-up message when no GitHub URL is returned", async ({ page }) => {
    await setup(page, {
      feedbackResponse: { status: 200, ok: true },
    });
    await openFeedback(page, "other");
    await fillValidForm(page);
    await page.getByTestId("feedback-submit").click();

    await expect(page.getByTestId("feedback-success")).toBeVisible();
    await expect(page.getByTestId("feedback-issue-url")).toHaveCount(0);
    await expect(page.getByText(/odezwiemy się wkrótce/)).toBeVisible();
  });

  test("keeps the form intact when rate limited (429)", async ({ page }) => {
    await setup(page, {
      feedbackResponse: { status: 429, ok: false, error: "rate limited" },
    });
    await openFeedback(page, "bug");
    await fillValidForm(page);
    await page.getByTestId("feedback-submit").click();

    // Dialog stays open on the form with the entered title preserved.
    await expect(page.getByTestId("feedback-submit")).toBeVisible();
    await expect(page.getByTestId("feedback-title")).toHaveValue("Playback freezes");
    await expect(page.getByTestId("feedback-success")).toHaveCount(0);
  });
});
