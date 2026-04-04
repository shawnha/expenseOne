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
