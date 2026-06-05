import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OKSP Pipeline Radar",
  description: "공공기관 조달 공고 자동 매핑 대시보드",
};

/*
  hydration 직전에 동기적으로 .dark 클래스를 붙여두는 inline script.
  - 첫 페인트에서 라이트→다크로 깜빡이는 FOUC 방지
  - 사용자가 직접 선택한 값(localStorage 의 oksp-theme) 이 가장 우선
  - 저장값이 없을 때만 prefers-color-scheme: dark 를 따른다.
    (사용자가 명시적으로 선택한 값이 없으면 시스템 다크 모드 사용자 경험을 존중)
  - 기본 (저장값 없음 + prefers light) 은 light.
*/
const themeInitScript = `(() => {
  try {
    var theme = localStorage.getItem('oksp-theme');
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
      // suppressHydrationWarning: inline script 가 SSR HTML 에 없는 .dark 를 붙일 수 있으므로
      // <html> 한 곳에서만 hydration 경고를 무시한다.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
