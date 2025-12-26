import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { displayManagerService, createLogger } from "../services";
import { useDisplayStore } from "../stores";

const log = createLogger("useDisplayWatcher");

export function useDisplayWatcher() {
  const {
    setCurrentConfig,
    setPendingRestore,
    setShowRestoreDialog,
    saveCurrentLayout,
  } = useDisplayStore();

  useEffect(() => {
    let mounted = true;
    let unlistenConfigChange: (() => void) | null = null;
    let unlistenSaveLayout: (() => void) | null = null;

    const init = async () => {
      // Get initial display configuration
      try {
        const config = await displayManagerService.getConfiguration();
        if (mounted) {
          log.info(
            `Initial display configuration: ${config.displays.length} displays, hash=${config.config_hash.slice(0, 8)}...`
          );
          setCurrentConfig(config);
        }
      } catch (err) {
        // This will fail on non-macOS platforms, which is expected
        log.debug("Failed to get initial display configuration (expected on non-macOS)", err);
      }

      // Listen for "Save Display Layout" menu command
      try {
        unlistenSaveLayout = await listen("save-display-layout", async () => {
          if (!mounted) return;
          log.info("Save Display Layout menu triggered");
          await saveCurrentLayout();
        });
      } catch (err) {
        log.debug("Failed to set up save-display-layout listener", err);
      }

      // Listen for display configuration changes
      try {
        unlistenConfigChange =
          await displayManagerService.onConfigurationChanged(
            async (config) => {
              if (!mounted) return;

              log.info(
                `Display configuration changed: ${config.displays.length} displays, hash=${config.config_hash.slice(0, 8)}...`
              );
              setCurrentConfig(config);

              // Check if we have a saved config for this hash
              try {
                const saved = await displayManagerService.getSavedConfig(
                  config.config_hash
                );

                if (saved) {
                  log.info(
                    `Found saved config for hash ${config.config_hash.slice(0, 8)}...`
                  );

                  if (saved.auto_apply) {
                    // Auto-apply without dialog
                    log.info("Auto-applying saved window layout");
                    const states = await displayManagerService.getWindowStates(
                      saved.id
                    );
                    // TODO: Actually apply window states via windowManager
                    log.debug(`Would restore ${states.length} window states`);
                  } else {
                    // Show restore dialog
                    const states = await displayManagerService.getWindowStates(
                      saved.id
                    );
                    setPendingRestore(saved, states);
                    setShowRestoreDialog(true);
                  }
                } else {
                  log.debug(
                    `No saved config for hash ${config.config_hash.slice(0, 8)}...`
                  );
                }
              } catch (err) {
                log.error("Failed to check for saved config", err);
              }
            }
          );
      } catch (err) {
        // Listener setup may fail on non-macOS
        log.debug(
          "Failed to set up display configuration listener (expected on non-macOS)",
          err
        );
      }
    };

    init();

    return () => {
      mounted = false;
      if (unlistenConfigChange) {
        unlistenConfigChange();
      }
      if (unlistenSaveLayout) {
        unlistenSaveLayout();
      }
    };
  }, [setCurrentConfig, setPendingRestore, setShowRestoreDialog, saveCurrentLayout]);
}
