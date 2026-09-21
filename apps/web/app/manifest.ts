import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return { name: "PCG Markets", short_name: "PCG Markets", start_url: "/", display: "standalone", background_color: "#F4F6F8", theme_color: "#16212D",
    icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }] };
}
