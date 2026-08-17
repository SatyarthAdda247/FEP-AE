import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Analytics } from "@vercel/analytics/next";

export const metadata: Metadata = {
  title: "EduSkill · EduSkill Program",
  description: "Adda247 — EduSkill Program Dashboard",
  applicationName: "EduSkill",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "EduSkill",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0d" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read theme from cookie server-side → no flash, no inline script.
  const store = await cookies();
  const cookieTheme = store.get("eduskill_theme")?.value;
  const theme: "light" | "dark" =
    cookieTheme === "light" || cookieTheme === "dark" ? cookieTheme : "light";

  return (
    <html
      lang="en"
      data-theme={theme}
      style={{ colorScheme: theme }}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-bg text-fg antialiased">
        <Providers initialTheme={theme}>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
