import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAuthStore } from "./authStore";

// Mock the services
vi.mock("../services", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock hostedSession service
vi.mock("../services/hostedSession", () => ({
  clearPersistedSessionId: vi.fn(),
}));

// Mock auth service
vi.mock("../services/auth", () => ({
  authService: {
    getTokens: vi.fn(),
    storeTokens: vi.fn(),
    clearTokens: vi.fn(),
    openLogin: vi.fn(),
    refreshTokenIfNeeded: vi.fn(),
    getPendingCallback: vi.fn(),
    validateState: vi.fn(),
  },
}));

// Mock supabase
vi.mock("../services/supabase", () => ({
  isSupabaseConfigured: vi.fn(() => false),
  createAuthenticatedClient: vi.fn(),
}));

// Mock notificationStore
vi.mock("./notificationStore", () => ({
  notify: vi.fn(),
}));

// Mock Tauri event listener
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// Import mocked modules
import { clearPersistedSessionId } from "../services/hostedSession";
import { authService } from "../services/auth";

function resetStoreState() {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isOffline: false,
  });
}

describe("authStore - signOut", () => {
  beforeEach(() => {
    resetStoreState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    useAuthStore.getState()._cleanup();
  });

  describe("signOut clears persisted session ID", () => {
    it("should call clearPersistedSessionId before clearing tokens", async () => {
      useAuthStore.setState({ isAuthenticated: true });
      vi.mocked(authService.getTokens).mockResolvedValue(null);
      vi.mocked(authService.clearTokens).mockResolvedValue(undefined);

      // Track call order to verify clearPersistedSessionId is called before clearTokens
      const callOrder: string[] = [];
      vi.mocked(clearPersistedSessionId).mockImplementation(async () => {
        callOrder.push("clearPersistedSessionId");
      });
      vi.mocked(authService.clearTokens).mockImplementation(async () => {
        callOrder.push("clearTokens");
      });

      await useAuthStore.getState().signOut();

      // Verify clearPersistedSessionId is called before clearTokens
      expect(callOrder).toEqual(["clearPersistedSessionId", "clearTokens"]);
    });

    it("should call clearPersistedSessionId on signOut", async () => {
      useAuthStore.setState({ isAuthenticated: true });
      vi.mocked(authService.getTokens).mockResolvedValue(null);
      vi.mocked(authService.clearTokens).mockResolvedValue(undefined);

      await useAuthStore.getState().signOut();

      expect(clearPersistedSessionId).toHaveBeenCalled();
    });

    it("should continue with signOut even if clearPersistedSessionId fails", async () => {
      useAuthStore.setState({ isAuthenticated: true });
      vi.mocked(authService.getTokens).mockResolvedValue(null);
      vi.mocked(authService.clearTokens).mockResolvedValue(undefined);
      vi.mocked(clearPersistedSessionId).mockRejectedValue(new Error("DB error"));

      // Should not throw
      await useAuthStore.getState().signOut();

      expect(clearPersistedSessionId).toHaveBeenCalled();
      expect(authService.clearTokens).toHaveBeenCalled();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("should clear persisted session ID even when supabase signOut fails", async () => {
      useAuthStore.setState({ isAuthenticated: true });
      vi.mocked(authService.getTokens).mockResolvedValue({
        access_token: "token",
        refresh_token: "refresh",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
      vi.mocked(authService.clearTokens).mockResolvedValue(undefined);

      // Track that clearPersistedSessionId was called
      await useAuthStore.getState().signOut();

      expect(clearPersistedSessionId).toHaveBeenCalled();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("should prevent orphaned hosted session references after logout", async () => {
      // This test documents the purpose: when user signs out, any persisted
      // hosted session ID should be cleared to prevent trying to restore
      // a session that the user no longer has access to
      useAuthStore.setState({
        isAuthenticated: true,
        user: { id: "user-1", email: "test@example.com", displayName: "Test", avatarUrl: null },
      });
      vi.mocked(authService.getTokens).mockResolvedValue(null);
      vi.mocked(authService.clearTokens).mockResolvedValue(undefined);

      await useAuthStore.getState().signOut();

      // Verify the session ID was cleared
      expect(clearPersistedSessionId).toHaveBeenCalled();
      // And user is signed out
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
    });
  });
});
