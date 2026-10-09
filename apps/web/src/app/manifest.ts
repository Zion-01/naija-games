import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Naija Games: Whot & Ayo",
    short_name: "Naija Games",
    description: "Play Whot and Ayo against the computer or with your guys. Works offline.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fbf4e6",
    theme_color: "#8a1c2b",
    categories: ["games"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
    shortcuts: [
      { name: "Play Whot", url: "/whot" },
      { name: "Play Ayo", url: "/ayo" },
    ],
  };
}
