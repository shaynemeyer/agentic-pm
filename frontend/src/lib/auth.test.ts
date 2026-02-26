import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/lib/auth";

describe("auth store", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null, userId: null, username: null });
  });

  it("starts with no token", () => {
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("sets a session", () => {
    useAuthStore.getState().setSession("abc-123", "user-1", "user");
    expect(useAuthStore.getState().token).toBe("abc-123");
    expect(useAuthStore.getState().userId).toBe("user-1");
    expect(useAuthStore.getState().username).toBe("user");
  });

  it("clears a token", () => {
    useAuthStore.getState().setSession("abc-123", "user-1", "user");
    useAuthStore.getState().clearToken();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().userId).toBeNull();
    expect(useAuthStore.getState().username).toBeNull();
  });
});
