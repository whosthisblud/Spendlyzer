"use client";

import { usePwa } from "@/hooks/usePwa";
import { Button } from "./ui";

function savedAt(iso: string | null): string {
  if (!iso || iso === "unknown") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return ` from ${d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;
}

/** Offline / saved-data notice, shown under the nav. */
export function OfflineBanner() {
  const { online, staleSince } = usePwa();
  if (online && !staleSince) return null;
  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
      {online ? "Can't reach the server." : "You're offline."}{" "}
      {staleSince ? `Showing saved data${savedAt(staleSince)}.` : "Saved pages are still available."} Changes need a connection.
    </div>
  );
}

/** Floating prompt when a new version has been downloaded. */
export function UpdateToast() {
  const { updateReady, applyUpdate } = usePwa();
  if (!updateReady) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      <span>A new version of Spendlyzer is available.</span>
      <Button onClick={applyUpdate} className="shrink-0 px-3 py-1.5">
        Reload
      </Button>
    </div>
  );
}

export function InstallButton({ className }: { className?: string }) {
  const { canInstall, install } = usePwa();
  if (!canInstall) return null;
  return (
    <Button variant="secondary" onClick={install} className={className}>
      Install app
    </Button>
  );
}

export function IOSInstallHint() {
  const { showIOSInstallHint } = usePwa();
  if (!showIOSInstallHint) return null;
  return <p className="px-2 py-2 text-xs text-zinc-500">Install: tap Share, then &ldquo;Add to Home Screen&rdquo;.</p>;
}
