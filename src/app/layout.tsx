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
        {/* Native-style brand splash — visible before React hydrates */}
        <div id="app-splash">
          <div className="app-splash-logo">
            <svg viewBox="0 0 32 32" fill="none" width="48" height="48">
              <rect className="app-splash-line1" x="8" y="10" width="16" height="2.5" rx="1.25" fill="white" />
              <rect className="app-splash-line2" x="8" y="14.75" width="12" height="2.5" rx="1.25" fill="white" />
              <rect className="app-splash-line3" x="8" y="19.5" width="16" height="2.5" rx="1.25" fill="white" />
            </svg>
          </div>
          <div className="app-splash-name">ExpenseOne</div>
          <div className="app-splash-status" id="splash-status">
            <div className="app-splash-bar"><div className="app-splash-bar-fill" /></div>
            <span>정보를 가져오고 있습니다</span>
          </div>
        </div>
        <style dangerouslySetInnerHTML={{ __html: `
          #app-splash{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--apple-bg,#f2f2f7);transition:opacity .4s ease}
          #app-splash.hide{opacity:0;pointer-events:none}
          .app-splash-logo{width:80px;height:80px;border-radius:20px;background:#007AFF;display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(.6);animation:splash-pop .5s cubic-bezier(.34,1.56,.64,1) .1s forwards}
          .app-splash-line1{opacity:0;animation:splash-line .3s ease .5s forwards}
          .app-splash-line2{opacity:0;animation:splash-line .3s ease .65s forwards}
          .app-splash-line3{opacity:0;animation:splash-line .3s ease .8s forwards}
          .app-splash-name{margin-top:16px;font-size:22px;font-weight:700;letter-spacing:-.02em;color:var(--apple-label,#000);opacity:0;overflow:hidden;white-space:nowrap;border-right:2px solid var(--apple-label,#000);width:0;animation:splash-typing 0.6s steps(10) 1s forwards,splash-blink .6s step-end 1s 3}
          .app-splash-status{position:absolute;bottom:max(60px,env(safe-area-inset-bottom,20px));display:flex;flex-direction:column;align-items:center;gap:8px;opacity:0;animation:splash-fade .3s ease 2.5s forwards}
          .app-splash-status span{font-size:13px;color:var(--apple-secondary-label,#8e8e93)}
          .app-splash-bar{width:160px;height:3px;border-radius:2px;background:rgba(0,122,255,.15);overflow:hidden}
          .app-splash-bar-fill{width:30%;height:100%;border-radius:2px;background:#007AFF;animation:splash-progress 2s ease-in-out 2.5s infinite}
          @keyframes splash-pop{to{opacity:1;transform:scale(1)}}
          @keyframes splash-line{to{opacity:1}}
          @keyframes splash-typing{to{width:10ch;opacity:1}}
          @keyframes splash-blink{50%{border-color:transparent}}
          @keyframes splash-fade{to{opacity:1}}
          @keyframes splash-progress{0%{width:30%;margin-left:0}50%{width:60%;margin-left:20%}100%{width:30%;margin-left:70%}}
          .dark #app-splash{background:#1c1c1e}
        ` }} />
        <script dangerouslySetInnerHTML={{ __html: `
          window.__splashDismiss=function(){var s=document.getElementById('app-splash');if(s){s.classList.add('hide');setTimeout(function(){s.remove()},400)}};
          window.__splashReady=false;
          window.addEventListener('load',function(){window.__splashReady=true});
        ` }} />
        {children}
      </body>
    </html>
  );
}
