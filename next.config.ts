import type { NextConfig } from "next";

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
