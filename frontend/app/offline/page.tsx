"use client";

import { Button } from "@/components/ui";

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <h1 className="text-xl font-semibold">
        Spend<span className="text-emerald-600">lyzer</span>
      </h1>
      <p className="mt-3 max-w-sm text-sm text-zinc-600 dark:text-zinc-400">
        You&apos;re offline and this page hasn&apos;t been saved yet. Pages you&apos;ve opened before work offline with your last synced data.
      </p>
      <Button className="mt-5" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </main>
  );
}
