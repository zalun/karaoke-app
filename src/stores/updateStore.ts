import { updateService, createLogger } from "../services";
import type { UpdateInfo } from "../services/update";
import { notify, useNotificationStore, type NotificationAction } from "./notificationStore";

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

    // latest_version already includes "v" prefix from GitHub tag_name
    notify("info", `Update available: ${info.latest_version}`, updateAction(info));

    // Mark this version as notified so we don't show it again
    localStorage.setItem(DISMISSED_VERSION_KEY, info.latest_version);
  } catch (err) {
    // Silently handle errors - update check should never block the user
    log.debug("Update check failed (expected if offline)", err);
  }
}

// Set while an install runs, so a second click does not start another download
let isInstalling = false;

/**
 * Notification action for an available update: install in-app where the
 * platform supports it (macOS), otherwise open the release page.
 */
export function updateAction(info: UpdateInfo): NotificationAction {
  if (info.can_install) {
    return { label: "Install & restart", onClick: () => void installUpdate(info) };
  }
  return { label: "Download", url: info.download_url };
}

/**
 * Download and install the update, then restart into it. On failure the user
 * keeps the current version and gets the release page link instead.
 */
export async function installUpdate(info: UpdateInfo): Promise<void> {
  if (isInstalling) {
    log.debug("Update install already in progress");
    return;
  }
  isInstalling = true;

  // Replace the "Update available" bar; notify() only queues while one is visible
  useNotificationStore.getState().dismiss();
  notify("info", `Downloading update ${info.latest_version}…`);

  try {
    await updateService.install();
  } catch (err) {
    log.error("Update install failed", err);
    notify("error", "Could not install the update", {
      label: "Download",
      url: info.download_url,
    });
    isInstalling = false;
    return;
  }

  log.info(`Update ${info.latest_version} installed, restarting`);
  try {
    await updateService.restart();
  } catch (err) {
    log.error("Restart after update failed", err);
    notify("warning", "Update installed. Restart HomeKaraoke to use it.");
    isInstalling = false;
  }
}
