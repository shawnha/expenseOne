import type { NextConfig } from "next";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Shared build timestamp for SW cache busting + build version tracking
const buildTs = Date.now().toString(36);

// Generate sw.js from template with build timestamp for cache busting
const swTemplatePath = join(process.cwd(), "public", "sw-template.js");
const swOutputPath = join(process.cwd(), "public", "sw.js");
if (existsSync(swTemplatePath)) {
  const template = readFileSync(swTemplatePath, "utf-8");
  writeFileSync(swOutputPath, template.replace(/__BUILD_TIMESTAMP__/g, buildTs));
}

// Write build hash to a public JSON file for client-side version checking
writeFileSync(
  join(process.cwd(), "public", "build-info.json"),
  JSON.stringify({ hash: buildTs, ts: Date.now() })
);

const nextConfig: NextConfig = {
  // 이 페이지가 **어느 빌드에서 나왔는지**를 클라이언트에 심는다.
  // 배포 스큐(열려 있는 PWA가 옛 빌드를 붙들고 있는 상태)를 화면에서 바로
  // 확인하려면 서버가 지금 서비스하는 빌드와 비교할 수 있어야 한다.
  env: { NEXT_PUBLIC_BUILD_HASH: buildTs },
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "react-day-picker",
      "@supabase/supabase-js",
    ],
  },
};

export default nextConfig;
