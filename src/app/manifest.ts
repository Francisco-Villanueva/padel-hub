import type { MetadataRoute } from "next";

// start_url apunta al panel: sin sesión, el proxy renueva con el refresh o manda al login.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "PadelHub",
    short_name: "PadelHub",
    description: "Encontrá al jugador justo para completar tu turno.",
    lang: "es-AR",
    start_url: "/es/app",
    scope: "/",
    display: "standalone",
    background_color: "#f5f7f4",
    theme_color: "#0b6b4f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
