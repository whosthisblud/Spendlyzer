import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Spendlyzer",
    short_name: "Spendlyzer",
    description: "Track spending, budgets and forecasts with ML-powered insights.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fafafa",
    theme_color: "#059669",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      { name: "Add transaction", short_name: "Add", url: "/transactions?new=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Insights", url: "/insights", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
