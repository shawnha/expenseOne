import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
});


export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#007AFF",
};

export const metadata: Metadata = {
  title: "ExpenseOne",
  description: "팀 비용을 효율적으로 관리하세요",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ExpenseOne",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}})();if('serviceWorker'in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){})}`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} antialiased`}
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Inter', system-ui, sans-serif" }}
      >
        {/* Instant loading indicator — shown until React hydrates and replaces it */}
        <div id="pwa-splash" style={{
          position: "fixed", inset: 0, zIndex: 99999,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          backgroundColor: "var(--apple-bg, #f2f2f7)",
          transition: "opacity 0.3s",
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            border: "3px solid rgba(0,122,255,0.2)",
            borderTopColor: "#007AFF",
            animation: "pwa-spin 0.8s linear infinite",
          }} />
          <style dangerouslySetInnerHTML={{ __html: `@keyframes pwa-spin{to{transform:rotate(360deg)}}` }} />
        </div>
        <script dangerouslySetInnerHTML={{ __html: `setTimeout(function(){var s=document.getElementById('pwa-splash');if(s)s.style.opacity='0';setTimeout(function(){if(s)s.remove()},300)},300)` }} />
        {children}
      </body>
    </html>
  );
}
