import { describe, it, expect } from "vitest";
import { SETTINGS_KEYS, SETTINGS_DEFAULTS } from "./settingsStore";

describe("settingsStore", () => {
  describe("SETTINGS_KEYS", () => {
    it("should have FAIR_QUEUE_ENABLED key", () => {
      expect(SETTINGS_KEYS.FAIR_QUEUE_ENABLED).toBe("fair_queue_enabled");
    });

    it("should have AUTO_ACCEPT_GUEST_REQUESTS key", () => {
      expect(SETTINGS_KEYS.AUTO_ACCEPT_GUEST_REQUESTS).toBe("auto_accept_guest_requests");
    });
  });

  describe("SETTINGS_DEFAULTS", () => {
    it("should have FAIR_QUEUE_ENABLED default set to 'false'", () => {
      expect(SETTINGS_DEFAULTS[SETTINGS_KEYS.FAIR_QUEUE_ENABLED]).toBe("false");
    });

    it("should have AUTO_ACCEPT_GUEST_REQUESTS default set to 'true' (opt-out)", () => {
      expect(SETTINGS_DEFAULTS[SETTINGS_KEYS.AUTO_ACCEPT_GUEST_REQUESTS]).toBe("true");
    });
  });
});
