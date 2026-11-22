import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from "@/lib/theme";

let osDark = false;
const listeners = new Set<() => void>();

function stubMatchMedia() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("dark") && osDark;
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }));
}

const theme = () => document.documentElement.dataset.theme;

describe("theme", () => {
  beforeEach(() => {
    osDark = false;
    listeners.clear();
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    stubMatchMedia();
  });

  it("init script follows the OS when no choice is saved", () => {
    osDark = true;
    new Function(THEME_INIT_SCRIPT)();
    expect(theme()).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("init script prefers a saved choice over the OS", () => {
    osDark = true;
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    new Function(THEME_INIT_SCRIPT)();
    expect(theme()).toBe("light");
  });

  it("toggle applies and persists the chosen theme", async () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("radio", { name: "System theme" })).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByRole("radio", { name: "Dark theme" }));
    expect(theme()).toBe("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark theme" })).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByRole("radio", { name: "Light theme" }));
    expect(theme()).toBe("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("system choice clears storage and tracks OS changes live", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);
    expect(screen.getByRole("radio", { name: "Dark theme" })).toHaveAttribute("aria-checked", "true");

    await userEvent.click(screen.getByRole("radio", { name: "System theme" }));
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(theme()).toBe("light");

    osDark = true;
    listeners.forEach((cb) => cb());
    expect(theme()).toBe("dark");
  });

  it("still switches when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    render(<ThemeToggle />);
    await userEvent.click(screen.getByRole("radio", { name: "Dark theme" }));
    expect(theme()).toBe("dark");
  });
});
