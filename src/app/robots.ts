import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/*/app", "/*/admin", "/*/c/", "/*/login", "/*/activar", "/*/restablecer"] },
    sitemap: `${base}/sitemap.xml`,
  };
}
