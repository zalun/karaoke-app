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

    // Helper to check and restore saved layout for a config
    const checkAndRestoreSavedLayout = async (
      configHash: string,
      context: "startup" | "change"
    ) => {
      try {
        const saved = await displayManagerService.getSavedConfig(configHash);

        if (saved) {
          log.info(
            `Found saved config for hash ${configHash.slice(0, 8)}... (${context})`
          );

          // Get window states
          const states = await displayManagerService.getWindowStates(saved.id);
          log.info(
            `Window states for config: ${states.map((s) => `${s.window_type}(detached=${s.is_detached})`).join(", ")}`
          );

          if (context === "startup" || saved.auto_apply) {
            // On startup: always restore saved layout silently
            // On display change with auto_apply: restore silently
            log.info(`Restoring saved window layout (${context}, auto_apply=${saved.auto_apply})`);
            setPendingRestore(saved, states);
            const { restoreLayout } = useDisplayStore.getState();
            await restoreLayout();
          } else {
            // On display change without auto_apply: show dialog
            setPendingRestore(saved, states);
            setShowRestoreDialog(true);
          }
        } else {
          log.debug(`No saved config for hash ${configHash.slice(0, 8)}...`);
        }
      } catch (err) {
        log.error("Failed to check for saved config", err);
      }
    };

    const init = async () => {
      // Get initial display configuration
      try {
        const config = await displayManagerService.getConfiguration();
        if (mounted) {
          log.info(
            `Initial display configuration: ${config.displays.length} displays, hash=${config.config_hash.slice(0, 8)}...`
          );
          setCurrentConfig(config);

          // Check for saved layout on startup
          await checkAndRestoreSavedLayout(config.config_hash, "startup");
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

              // Check for saved layout on display change
              await checkAndRestoreSavedLayout(config.config_hash, "change");
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
