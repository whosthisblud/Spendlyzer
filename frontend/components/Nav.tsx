"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { InstallButton, IOSInstallHint, OfflineBanner } from "./PwaBanners";
import { ThemeToggle } from "./ThemeToggle";
import { cx } from "./ui";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
  { href: "/budgets", label: "Budgets" },
  { href: "/insights", label: "Insights" },
];

export function Nav() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b pt-[env(safe-area-inset-top)] border-zinc-200 bg-white/90 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/dashboard" className="text-base font-bold tracking-tight">
          Spend<span className="text-emerald-600">lyzer</span>
        </Link>
        <nav className="hidden gap-1 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cx(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                pathname.startsWith(l.href)
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white",
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <InstallButton className="px-3 py-1.5 text-xs" />
          <ThemeToggle />
          <span className="max-w-48 truncate text-xs text-zinc-500">{user?.email}</span>
          <button onClick={signOut} className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white">
            Sign out
          </button>
        </div>
        <button className="rounded p-2 md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          <span className="block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
          <span className="mt-1 block h-0.5 w-5 bg-current" />
        </button>
      </div>
      {open && (
        <nav className="border-t border-zinc-200 px-4 py-2 dark:border-zinc-800 md:hidden">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="block rounded px-2 py-2 text-sm font-medium">
              {l.label}
            </Link>
          ))}
          <InstallButton className="my-1 w-full" />
          <IOSInstallHint />
          <div className="flex items-center justify-between px-2 py-2">
            <span className="text-sm text-zinc-500">Theme</span>
            <ThemeToggle />
          </div>
          <button onClick={signOut} className="block w-full rounded px-2 py-2 text-left text-sm text-zinc-500">
            Sign out ({user?.email})
          </button>
        </nav>
      )}
      <OfflineBanner />
    </header>
  );
}
