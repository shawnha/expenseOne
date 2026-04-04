import type { NextConfig } from "next";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Generate sw.js from template with build timestamp for cache busting
const swTemplatePath = join(process.cwd(), "public", "sw-template.js");
const swOutputPath = join(process.cwd(), "public", "sw.js");
if (existsSync(swTemplatePath)) {
  const template = readFileSync(swTemplatePath, "utf-8");
  const buildTs = Date.now().toString(36);
  writeFileSync(swOutputPath, template.replace(/__BUILD_TIMESTAMP__/g, buildTs));
}

const buildHash = Date.now().toString(36);

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BUILD_HASH: buildHash,
  },
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
