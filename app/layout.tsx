import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import PipelineBrandingSync from "@/components/PipelineBrandingSync";
import ThemeToggle from "@/components/ThemeToggle";
import {
  APP_DESCRIPTION,
  APP_FULL_NAME,
  APP_NAME,
  APP_TITLE,
  APP_URL,
} from "@/lib/appConfig";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: `${APP_NAME} · ${APP_TITLE}`,
  description: `${APP_DESCRIPTION} · ${APP_FULL_NAME}`,
  applicationName: APP_NAME,
  openGraph: {
    title: `${APP_NAME} · ${APP_TITLE}`,
    description: APP_DESCRIPTION,
    siteName: APP_FULL_NAME,
    locale: "ko_KR",
    type: "website",
  },
};

const themeInitScript = `(() => {
  try {
    var theme = localStorage.getItem('cs-g2b-theme') || localStorage.getItem('oksp-theme');
    var prefersDark = false;
    try {
      prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch (_) {}
    if (theme === 'dark' || (theme !== 'light' && prefersDark)) {
      document.documentElement.classList.add('dark');
    }
  } catch (_) {}
})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <PipelineBrandingSync />
        <div className="fixed right-3 top-2 z-[100] sm:right-5 sm:top-4">
          <ThemeToggle />
        </div>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
