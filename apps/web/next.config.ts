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
    remotePatterns: [
      { hostname: "assets.tcgdex.net" },
      { hostname: "images.pokemontcg.io" },
      { hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.supabase.co").hostname, pathname: "/storage/v1/object/public/**" },
    ],
  },
};

export default withSerwist(nextConfig);
