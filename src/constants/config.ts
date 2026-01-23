/**
 * Application configuration constants.
 */

/**
 * HomeKaraoke API base URL.
 * Used for hosted session features (remote guest access).
 */
export const HOMEKARAOKE_API_URL = "https://homekaraoke.app";

/**
 * QR code generator service URL.
 * Used to generate QR codes for session join URLs.
 */
export const QR_CODE_SERVICE_URL = "https://api.qrserver.com/v1/create-qr-code";

/**
 * Build QR code URL for a given data string.
 */
export function buildQrCodeUrl(data: string, size = 200): string {
  return `${QR_CODE_SERVICE_URL}/?size=${size}x${size}&data=${encodeURIComponent(data)}`;
}

/**
 * Build session join URL for a given session code.
 */
export function buildJoinUrl(sessionCode: string): string {
  return `${HOMEKARAOKE_API_URL}/join/${sessionCode}`;
}
