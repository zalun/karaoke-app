import { useEffect } from "react";
import { keepAwakeService } from "../services";

export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (enabled) {
      keepAwakeService.enable();
    } else {
      keepAwakeService.disable();
    }

    return () => {
      if (enabled) {
        keepAwakeService.disable();
      }
    };
  }, [enabled]);
}
