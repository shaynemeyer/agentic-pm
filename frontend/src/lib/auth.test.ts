import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/lib/auth";

describe("auth store", () => {
  beforeEach(() => {
    useAuthStore.setState({ token: null });
  });

  it("starts with no token", () => {
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("sets a token", () => {
    useAuthStore.getState().setToken("abc-123");
    expect(useAuthStore.getState().token).toBe("abc-123");
  });

  it("clears a token", () => {
    useAuthStore.getState().setToken("abc-123");
    useAuthStore.getState().clearToken();
    expect(useAuthStore.getState().token).toBeNull();
  });
});
