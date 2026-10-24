import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// CSP acotada a lo que no depende de scripts inline (clickjacking, <base>, formularios, plugins).
// Una CSP completa con nonce obligaría a renderizar todo dinámico y rompería el shell estático de cacheComponents.
const CSP = "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: CSP },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    }];
  },
  // Habilita forbidden() (403 con pantalla propia). Es experimental en Next 16.
  // serverActions.bodySizeLimit: el logo del club (hasta 1 MB) viaja como archivo en un formulario; el tope por defecto (1 MB) lo cortaría.
  experimental: { authInterrupts: true, serverActions: { bodySizeLimit: "2mb" } },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
