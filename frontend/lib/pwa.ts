export const OFFLINE_HEADER = "X-Spendlyzer-Offline";
export const CACHED_AT_HEADER = "X-Spendlyzer-Cached-At";
export const STALE_EVENT = "spendlyzer:stale-data";
export const FRESH_EVENT = "spendlyzer:fresh-data";

/** Deletes every per-user API cache. Called on sign-out so saved data never outlives the session. */
export async function clearApiCaches(): Promise<void> {
  if (typeof caches === "undefined") return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("api-")).map((k) => caches.delete(k)));
  } catch {
    // Cache storage unavailable; nothing to clear.
  }
}

export function isIOS(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __spendlyzerInstallPrompt?: BeforeInstallPromptEvent | null;
  }
}

/** Captures the install prompt before React mounts, since the browser may fire it early. */
export const PWA_INIT_SCRIPT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__spendlyzerInstallPrompt=e;window.dispatchEvent(new Event("spendlyzer:installable"));});`;
