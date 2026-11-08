import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@polivo/ui", "@polivo/contracts", "@polivo/db-cloud"],
};

export default nextConfig;
