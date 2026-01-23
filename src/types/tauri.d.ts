/**
 * Tauri-specific type declarations for React JSX attributes.
 */

import "react";

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface HTMLAttributes<T> {
    /**
     * Marks an element as a window drag region.
     * Clicking and dragging on this element will move the window.
     * Requires `core:window:allow-start-dragging` permission.
     */
    "data-tauri-drag-region"?: boolean;
  }
}
