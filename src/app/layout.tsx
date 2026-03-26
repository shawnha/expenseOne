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
            __html: `(function(){
try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}
if('serviceWorker'in navigator){navigator.serviceWorker.register('/sw.js').catch(function(){})}
var css=document.createElement('style');
css.textContent=[
'#app-splash{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--apple-bg,#f2f2f7);transition:opacity .4s ease}',
'#app-splash.hide{opacity:0;pointer-events:none}',
'.sp-logo{width:80px;height:80px;border-radius:20px;background:#007AFF;display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(.6);animation:sp-pop .5s cubic-bezier(.34,1.56,.64,1) .1s forwards}',
'.sp-l1{opacity:0;animation:sp-fade .3s ease .5s forwards}',
'.sp-l2{opacity:0;animation:sp-fade-dim .3s ease .65s forwards}',
'.sp-l3{opacity:0;animation:sp-fade .3s ease .8s forwards}',
'.sp-name{margin-top:16px;font-size:22px;font-weight:700;letter-spacing:-.02em;color:var(--apple-label,#000);opacity:0;animation:sp-fade .5s ease 1s forwards}',
'.sp-plug{margin-top:12px;opacity:0;display:flex;justify-content:center;animation:sp-fade .4s ease 1.5s forwards}',
'.sp-plug svg{color:#34C759;filter:drop-shadow(0 0 8px rgba(52,199,89,.3))}',
'.sp-plug-slide{animation:sp-slide .6s cubic-bezier(.25,.46,.45,.94) 1.8s forwards}',
'.sp-spark{opacity:0;animation:sp-spark .4s ease 2.2s forwards}',
'.sp-status{position:absolute;bottom:max(60px,env(safe-area-inset-bottom,20px));display:flex;flex-direction:column;align-items:center;gap:8px;opacity:0;animation:sp-fade .3s ease 3s forwards}',
'.sp-status span{font-size:13px;color:var(--apple-secondary-label,#8e8e93)}',
'.sp-bar{width:160px;height:3px;border-radius:2px;background:rgba(0,122,255,.15);overflow:hidden}',
'.sp-bar-fill{width:30%;height:100%;border-radius:2px;background:#007AFF;animation:sp-progress 2s ease-in-out 3s infinite}',
'@keyframes sp-pop{to{opacity:1;transform:scale(1)}}',
'@keyframes sp-fade{to{opacity:1}}',
'@keyframes sp-fade-dim{to{opacity:.3}}',
'@keyframes sp-slide{from{transform:translateX(8px)}to{transform:translateX(0)}}',
'@keyframes sp-spark{0%{opacity:0;transform:scale(0)}50%{opacity:1;transform:scale(1.5)}100%{opacity:0;transform:scale(0)}}',
'@keyframes sp-progress{0%{width:30%;margin-left:0}50%{width:60%;margin-left:20%}100%{width:30%;margin-left:70%}}',
'.dark #app-splash{background:#1c1c1e}'
].join('');
document.head.appendChild(css);
var d=document.createElement('div');d.id='app-splash';
d.innerHTML=[
'<div class="sp-logo"><svg viewBox="0 0 32 32" fill="none" width="48" height="48">',
'<rect class="sp-l1" x="8" y="10" width="16" height="2.5" rx="1.25" fill="white"/>',
'<rect class="sp-l2" x="8" y="14.75" width="12" height="2.5" rx="1.25" fill="white" opacity="0.3"/>',
'<rect class="sp-l3" x="8" y="19.5" width="16" height="2.5" rx="1.25" fill="white"/>',
'</svg></div>',
'<div class="sp-name">ExpenseOne</div>',
'<div class="sp-plug"><svg width="56" height="18" viewBox="-1 -1 20 14" fill="none">',
'<rect x="0" y="2" width="10" height="8" rx="1.5" stroke="currentColor" stroke-width="1.2" fill="none"/>',
'<rect x="3" y="4" width="1.5" height="4" rx=".5" fill="currentColor" opacity=".3"/>',
'<rect x="6" y="4" width="1.5" height="4" rx=".5" fill="currentColor" opacity=".3"/>',
'<g class="sp-plug-slide">',
'<rect x="3" y="4" width="1.5" height="4" rx=".5" fill="currentColor"/>',
'<rect x="6" y="4" width="1.5" height="4" rx=".5" fill="currentColor"/>',
'<rect x="10.5" y="3" width="4" height="6" rx="1" stroke="currentColor" stroke-width="1.2" fill="none"/>',
'<line x1="14.5" y1="6" x2="18" y2="6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
'</g>',
'<circle class="sp-spark" cx="5" cy="0" r="1.2" fill="currentColor"/>',
'</svg></div>',
'<div class="sp-status"><div class="sp-bar"><div class="sp-bar-fill"></div></div><span>정보를 가져오고 있습니다</span></div>'
].join('');
(document.body||document.documentElement).appendChild(d);
window.__splashStart=Date.now();
window.__splashMinMs=2500;
window.__splashDismiss=function(){var s=document.getElementById('app-splash');if(!s)return;var elapsed=Date.now()-window.__splashStart;var wait=Math.max(0,window.__splashMinMs-elapsed);setTimeout(function(){s.classList.add('hide');setTimeout(function(){if(s.parentNode)s.parentNode.removeChild(s)},400)},wait)};
setTimeout(function(){window.__splashDismiss&&window.__splashDismiss()},6000);
})();`,
          }}
        />
      </head>
      <body
        className={`${inter.variable} antialiased overflow-x-hidden`}
        style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', 'Inter', system-ui, sans-serif" }}
      >
        {children}
      </body>
    </html>
  );
}
