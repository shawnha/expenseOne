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
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2F2F7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
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
    statusBarStyle: "black-translucent",
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
/* 스트리밍 리빌 워치독.
   React는 늦게 도착한 Suspense 경계의 첫 리빌을 requestAnimationFrame으로
   예약한다($RC가 $RB에 쌓고 $RV가 드러냄). 창이 가려지거나 백그라운드인
   상태로 로드되면 그 rAF 콜백이 발화하지 않아, 서버가 내용을 다 보냈는데도
   화면이 로딩 스켈레톤에 그대로 갇힌다(실제 내용은 div[hidden] 안에 있다).

   1초 간격으로 보다가 **3회 연속** 대기 중이면 React 자신의 리빌 함수를 부른다.
   React가 스스로 미루는 최대치가 약 2.3초라 그보다 뒤에서만 개입한다.
   화면이 보이는지는 따지지 않는다 — 안 보이는 동안 드러내도 해가 없고,
   오히려 사용자가 창을 볼 때 이미 그려져 있어야 한다.
   이미 드러났으면 $RB가 비어 있어 아무 일도 하지 않는다. */
(function(){var streak=0,n=0,iv=setInterval(function(){try{
  var q=window.$RB;if(!q||typeof window.$RV!=="function"){return}
  if(q.length>0){if(++streak>=3){window.$RV(q);streak=0}}else{streak=0}
}catch(e){}finally{if(++n>30){clearInterval(iv)}}},1000);
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState!=="visible"){return}
  setTimeout(function(){try{var q=window.$RB;
    if(q&&q.length>0&&typeof window.$RV==="function"){window.$RV(q)}}catch(e){}},300)})})();
try{var t=localStorage.getItem('theme');if(t==='dark')document.documentElement.classList.add('dark');else if(t!=='light'&&window.matchMedia('(prefers-color-scheme:dark)').matches)document.documentElement.classList.add('dark')}catch(e){}
if('serviceWorker'in navigator){navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).then(function(reg){if(reg)reg.update()}).catch(function(){})}
if(sessionStorage.getItem('splash-shown')){return}
sessionStorage.setItem('splash-shown','1');
var css=document.createElement('style');
css.textContent=[
'#app-splash{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--apple-bg,#f2f2f7);transition:opacity .4s ease}',
'#app-splash.hide{opacity:0;pointer-events:none}',
'.sp-logo{width:80px;height:80px;border-radius:20px;background:linear-gradient(135deg,#007AFF,#5856D6);display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(.6);animation:sp-pop .5s cubic-bezier(.34,1.56,.64,1) .1s forwards}',
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
'<div class="sp-name">Expense<span style="color:#007AFF">One</span></div>',
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
window.__splashMinMs=0;
window.__splashDismiss=function(){var s=document.getElementById('app-splash');if(!s)return;var elapsed=Date.now()-window.__splashStart;var wait=Math.max(0,window.__splashMinMs-elapsed);setTimeout(function(){s.classList.add('hide');setTimeout(function(){if(s.parentNode)s.parentNode.removeChild(s)},400)},wait)};
setTimeout(function(){window.__splashDismiss&&window.__splashDismiss()},3000);
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
