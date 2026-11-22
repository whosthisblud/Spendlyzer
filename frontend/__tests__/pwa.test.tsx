import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const state = {
  canInstall: false,
  showIOSInstallHint: false,
  install: vi.fn(),
  updateReady: false,
  applyUpdate: vi.fn(),
  online: true,
  staleSince: null as string | null,
};
vi.mock("@/hooks/usePwa", () => ({ usePwa: () => state }));

const getSession = vi.fn(async () => ({ data: { session: { access_token: "t" } } }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: { getSession } }) }));

import { InstallButton, IOSInstallHint, OfflineBanner, UpdateToast } from "@/components/PwaBanners";
import { api } from "@/lib/api";
import { clearApiCaches, STALE_EVENT } from "@/lib/pwa";

describe("PWA UI", () => {
  it("hides the banner when online with fresh data", () => {
    Object.assign(state, { online: true, staleSince: null });
    const { container } = render(<OfflineBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains offline mode with the saved-data timestamp", () => {
    Object.assign(state, { online: false, staleSince: "2026-11-20T09:15:00.000Z" });
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent(/You're offline\. Showing saved data from 20 Nov.*Changes need a connection\./);
  });

  it("distinguishes a server outage from being offline", () => {
    Object.assign(state, { online: true, staleSince: "unknown" });
    render(<OfflineBanner />);
    expect(screen.getByRole("status")).toHaveTextContent("Can't reach the server. Showing saved data.");
  });

  it("offers to reload when an update is ready", async () => {
    Object.assign(state, { updateReady: true });
    render(<UpdateToast />);
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(state.applyUpdate).toHaveBeenCalledOnce();
  });

  it("shows install controls only when the platform supports them", async () => {
    Object.assign(state, { canInstall: false, showIOSInstallHint: false });
    const { container, rerender } = render(
      <>
        <InstallButton />
        <IOSInstallHint />
      </>,
    );
    expect(container).toBeEmptyDOMElement();

    Object.assign(state, { canInstall: true, showIOSInstallHint: true });
    rerender(
      <>
        <InstallButton />
        <IOSInstallHint />
      </>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Install app" }));
    expect(state.install).toHaveBeenCalledOnce();
    expect(screen.getByText(/tap Share, then/)).toBeInTheDocument();
  });
});

describe("offline data plumbing", () => {
  it("api() announces when a response came from the offline cache", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("[]", { status: 200, headers: { "X-Spendlyzer-Offline": "1", "X-Spendlyzer-Cached-At": "2026-11-20T09:15:00Z" } }),
    );
    const heard = vi.fn();
    window.addEventListener(STALE_EVENT, (e) => heard((e as CustomEvent).detail));
    await act(() => api("/api/transactions"));
    expect(heard).toHaveBeenCalledWith({ cachedAt: "2026-11-20T09:15:00Z" });
  });

  it("clearApiCaches deletes only per-user API caches", async () => {
    const deleted: string[] = [];
    vi.stubGlobal("caches", {
      keys: async () => ["shell-abc", "static", "api-user-1", "api-user-2", "pages-abc"],
      delete: async (k: string) => deleted.push(k),
    });
    await clearApiCaches();
    expect(deleted.sort()).toEqual(["api-user-1", "api-user-2"]);
    vi.unstubAllGlobals();
  });
});
