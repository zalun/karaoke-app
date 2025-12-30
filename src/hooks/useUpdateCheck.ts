import { useEffect } from "react";
import { useUpdateStore } from "../stores";

/**
 * Hook to check for updates on app startup.
 * The check is non-blocking and runs after a short delay to avoid
 * impacting initial render performance.
 */
export function useUpdateCheck() {
  const checkForUpdate = useUpdateStore((state) => state.checkForUpdate);

  useEffect(() => {
    // Delay the check slightly to not impact startup performance
    const timer = setTimeout(() => {
      checkForUpdate();
    }, 3000); // 3 second delay

    return () => clearTimeout(timer);
  }, [checkForUpdate]);
}
