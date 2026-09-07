import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ["@pcg/domain", "@pcg/connectors"],
  images: {
    remotePatterns: [{ hostname: "assets.tcgdex.net" }],
  },
};

export default withSerwist(nextConfig);
