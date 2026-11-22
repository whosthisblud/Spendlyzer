"use client";

import type { Category } from "@/lib/types";
import { useApi } from "./useApi";

export function useCategories() {
  const { data, ...rest } = useApi<Category[]>("/api/categories");
  return { categories: data ?? [], ...rest };
}
