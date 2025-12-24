import { useEffect, useRef } from "react";
import { keepAwakeService } from "../services";

export function useWakeLock(enabled: boolean) {
  const isEnabled = useRef(false);

  useEffect(() => {
    console.log("[useWakeLock] enabled:", enabled);

    if (enabled && !isEnabled.current) {
      isEnabled.current = true;
      keepAwakeService.enable();
    } else if (!enabled && isEnabled.current) {
      isEnabled.current = false;
      keepAwakeService.disable();
    }

    return () => {
      if (isEnabled.current) {
        isEnabled.current = false;
        keepAwakeService.disable();
      }
    };
  }, [enabled]);
}
