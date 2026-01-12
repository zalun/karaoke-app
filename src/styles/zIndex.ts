/**
 * Named z-index constants for consistent stacking order across the app.
 * Higher numbers appear on top of lower numbers.
 */

/** Base layer for video content */
export const Z_INDEX_VIDEO = 0;

/** Detach button overlay on hover */
export const Z_INDEX_DETACH_BUTTON = 10;

/** Singer overlay that appears when video starts */
export const Z_INDEX_SINGER_OVERLAY = 20;

/** Next song overlay countdown */
export const Z_INDEX_NEXT_SONG_OVERLAY = 30;

/** Drag overlay for window dragging - below play overlay so clicks work */
export const Z_INDEX_DRAG_OVERLAY = 40;

/** Click to play / autoplay blocked overlay - must be above singer overlay and drag overlay */
export const Z_INDEX_PLAY_OVERLAY = 50;

/** Click to start / priming overlay - must be above everything */
export const Z_INDEX_PRIMING_OVERLAY = 50;
