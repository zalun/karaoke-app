import { updateService, createLogger } from "../services";
import { notify } from "./notificationStore";

const log = createLogger("UpdateCheck");

// LocalStorage key for dismissed version
const DISMISSED_VERSION_KEY = "karaoke:dismissed-update-version";

/**
 * Check for app updates and show a notification if one is available.
 * Remembers dismissed versions to avoid showing the same notification again.
 */
export async function checkForUpdate(): Promise<void> {
  log.debug("Checking for updates...");

  try {
    const info = await updateService.checkForUpdate();

    if (!info.update_available) {
      log.debug("Already on latest version");
      return;
    }

    // Check if user already dismissed this version
    const dismissedVersion = localStorage.getItem(DISMISSED_VERSION_KEY);
    if (dismissedVersion === info.latest_version) {
      log.debug(`Update ${info.latest_version} was previously dismissed`);
      return;
    }

    log.info(
      `Update available: ${info.current_version} -> ${info.latest_version}`
    );

    // Show notification with download link
    // latest_version already includes "v" prefix from GitHub tag_name
    const message = `Update available: ${info.latest_version}`;
    notify("info", message, {
      label: "Download",
      url: info.download_url,
    });

    // Mark this version as notified so we don't show it again
    localStorage.setItem(DISMISSED_VERSION_KEY, info.latest_version);
  } catch (err) {
    // Silently handle errors - update check should never block the user
    log.debug("Update check failed (expected if offline)", err);
  }
}
