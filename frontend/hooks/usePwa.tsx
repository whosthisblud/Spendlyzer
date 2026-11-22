"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { FRESH_EVENT, isIOS, isStandalone, STALE_EVENT, type BeforeInstallPromptEvent } from "@/lib/pwa";

interface PwaState {
  /** Browser offers a native install prompt (Chromium on Android/desktop). */
  canInstall: boolean;
  /** iOS Safari, not yet installed: installation is manual via the Share menu. */
  showIOSInstallHint: boolean;
  install: () => Promise<void>;
  updateReady: boolean;
  applyUpdate: () => void;
  online: boolean;
  /** Set when the data on screen came from the offline cache; ISO timestamp of when it was saved. */
  staleSince: string | null;
}

const PwaContext = createContext<PwaState | null>(null);

function apiOrigin(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").origin;
  } catch {
    return "";
  }
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [online, setOnline] = useState(true);
  const [staleSince, setStaleSince] = useState<string | null>(null);
  const updateRequested = useRef(false);
  const pathname = usePathname();

  // Ask the worker to save every page the user sees, including in-app navigations, so it opens offline.
  useEffect(() => {
    if (!pathname || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.active?.postMessage({ type: "CACHE_PAGE", path: pathname }))
      .catch(() => {});
  }, [pathname]);

  // Install prompt
  useEffect(() => {
    const sync = () => setPromptEvent(window.__spendlyzerInstallPrompt ?? null);
    sync();
    const onInstalled = () => {
      window.__spendlyzerInstallPrompt = null;
      setPromptEvent(null);
    };
    window.addEventListener("spendlyzer:installable", sync);
    window.addEventListener("appinstalled", onInstalled);
    setIosHint(isIOS() && !isStandalone());
    return () => {
      window.removeEventListener("spendlyzer:installable", sync);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Service worker registration and update detection (production builds only).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const qs = new URLSearchParams({ v: process.env.NEXT_PUBLIC_BUILD_ID || "dev", api: apiOrigin() });
    // A worker taking control for the first time also fires controllerchange; only reload
    // when the user asked to apply an update.
    let reloading = false;
    const onControllerChange = () => {
      if (reloading || !updateRequested.current) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker
      .register(`/sw.js?${qs}`, { scope: "/" })
      .then((reg) => {
        const track = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            // Only an update if a previous worker already controls the page.
            if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
          });
        };
        if (reg.waiting && navigator.serviceWorker.controller) setWaiting(reg.waiting);
        track(reg.installing);
        reg.addEventListener("updatefound", () => track(reg.installing));
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      })
      .catch(() => {
        // Registration failure only disables offline support; the app keeps working online.
      });
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  // Connectivity and stale-data signals
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const stale = (e: Event) => setStaleSince((e as CustomEvent<{ cachedAt: string | null }>).detail?.cachedAt ?? "unknown");
    const fresh = () => setStaleSince(null);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    window.addEventListener(STALE_EVENT, stale);
    window.addEventListener(FRESH_EVENT, fresh);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
      window.removeEventListener(STALE_EVENT, stale);
      window.removeEventListener(FRESH_EVENT, fresh);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice;
    window.__spendlyzerInstallPrompt = null;
    setPromptEvent(null);
  }, [promptEvent]);

  const applyUpdate = useCallback(() => {
    updateRequested.current = true;
    waiting?.postMessage({ type: "SKIP_WAITING" });
  }, [waiting]);

  const value = useMemo<PwaState>(
    () => ({
      canInstall: Boolean(promptEvent),
      showIOSInstallHint: iosHint,
      install,
      updateReady: Boolean(waiting),
      applyUpdate,
      online,
      staleSince,
    }),
    [promptEvent, iosHint, install, waiting, applyUpdate, online, staleSince],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa(): PwaState {
  const ctx = useContext(PwaContext);
  if (!ctx) throw new Error("usePwa must be used inside PwaProvider");
  return ctx;
}
