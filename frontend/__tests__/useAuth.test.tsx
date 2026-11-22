import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const signOut = vi.fn();
const signInWithPassword = vi.fn();
const signUp = vi.fn();
const session = { access_token: "t", user: { id: "u1", email: "a@b.co" } };

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut,
      signInWithPassword,
      signUp,
    },
  }),
}));

import { AuthProvider, useAuth } from "@/hooks/useAuth";

const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe("useAuth", () => {
  it("loads the persisted session", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.email).toBe("a@b.co");
  });

  it("falls back to a local sign-out when the logout request fails", async () => {
    signOut.mockResolvedValueOnce({ error: new Error("Failed to fetch") }).mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(() => result.current.signOut());
    expect(signOut).toHaveBeenNthCalledWith(1);
    expect(signOut).toHaveBeenNthCalledWith(2, { scope: "local" });
  });

  it("reports when sign-up needs email confirmation", async () => {
    signUp.mockResolvedValueOnce({ data: { session: null }, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await expect(result.current.signUp("n@b.co", "longpassword")).resolves.toEqual({ needsConfirmation: true });
  });

  it("throws Supabase sign-in errors", async () => {
    signInWithPassword.mockResolvedValueOnce({ error: new Error("Invalid login credentials") });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await expect(result.current.signIn("a@b.co", "x")).rejects.toThrow("Invalid login credentials");
  });

  it("must be used inside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow("useAuth must be used inside AuthProvider");
  });
});
