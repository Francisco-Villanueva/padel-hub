import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  return routing.locales.map((l) => ({
    url: `${base}/${l}`,
    changeFrequency: "monthly",
    priority: l === routing.defaultLocale ? 1 : 0.8,
    alternates: { languages: Object.fromEntries(routing.locales.map((x) => [x, `${base}/${x}`])) },
  }));
}
