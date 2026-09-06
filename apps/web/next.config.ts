import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ["@pcg/domain", "@pcg/connectors"],
};

export default nextConfig;
