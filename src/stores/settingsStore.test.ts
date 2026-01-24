import { describe, it, expect } from "vitest";
import { SETTINGS_KEYS, SETTINGS_DEFAULTS } from "./settingsStore";

describe("settingsStore", () => {
  describe("SETTINGS_KEYS", () => {
    it("should have FAIR_QUEUE_ENABLED key", () => {
      expect(SETTINGS_KEYS.FAIR_QUEUE_ENABLED).toBe("fair_queue_enabled");
    });
  });

  describe("SETTINGS_DEFAULTS", () => {
    it("should have FAIR_QUEUE_ENABLED default set to 'false'", () => {
      expect(SETTINGS_DEFAULTS[SETTINGS_KEYS.FAIR_QUEUE_ENABLED]).toBe("false");
    });
  });
});
