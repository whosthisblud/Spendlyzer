"use client";

import { useCallback, useEffect, useState } from "react";
import { applyTheme, readPreference, savePreference, type ThemePreference } from "@/lib/theme";

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    setPreference(readPreference());
  }, []);

  // While on "system", follow OS changes live.
  useEffect(() => {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const setTheme = useCallback((pref: ThemePreference) => {
    savePreference(pref);
    applyTheme(pref);
    setPreference(pref);
  }, []);

  return { preference, setTheme };
}
