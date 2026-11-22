import type { Metadata, Viewport } from "next";
import { UpdateToast } from "@/components/PwaBanners";
import { AuthProvider } from "@/hooks/useAuth";
import { PwaProvider } from "@/hooks/usePwa";
import { PWA_INIT_SCRIPT } from "@/lib/pwa";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spendlyzer",
  description: "Personal finance tracker with categorization, analytics, anomaly detection and forecasting.",
  applicationName: "Spendlyzer",
  appleWebApp: { capable: true, title: "Spendlyzer", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Single theme-color tag, kept in sync with the chosen theme by lib/theme.ts. */}
        <meta name="theme-color" content="#ffffff" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: PWA_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen font-sans text-zinc-900 antialiased dark:text-zinc-100">
        <PwaProvider>
          <AuthProvider>{children}</AuthProvider>
          <UpdateToast />
        </PwaProvider>
      </body>
    </html>
  );
}
