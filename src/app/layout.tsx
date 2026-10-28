import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { AppShell } from "@/components/shell/app-shell";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["600"] });

const SITE_URL = "https://calender-app-design.vercel.app";
const DESCRIPTION =
  "A calm people-ops workspace: plan time off, track leave requests and balances, and manage your work calendar. A Kargul Studio design prototype.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Time off · Kargul Workspace", template: "%s · Kargul Workspace" },
  description: DESCRIPTION,
  applicationName: "Kargul Workspace",
  authors: [{ name: "Kargul Studio", url: "https://kargul.studio" }],
  creator: "Kargul Studio",
  publisher: "Kargul Studio",
  keywords: ["time off", "leave management", "calendar", "HR", "people ops", "design prototype", "Kargul Studio"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Kargul Calender Design Prototype",
    title: "Kargul Workspace — Time off & calendar",
    description: DESCRIPTION,
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Kargul Workspace — Time off & calendar",
    description: DESCRIPTION,
  },
  appleWebApp: { capable: true, title: "Kargul", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8f8f8" },
    { media: "(prefers-color-scheme: dark)", color: "#121212" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      data-palette="gallery-stark"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} h-full`}
    >
      <body className="h-full overflow-hidden">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
