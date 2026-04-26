import type { MetadataRoute } from "next"

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://petrohrys.com"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/api/", "/publish/"],
    },
    sitemap: `${BASE}/sitemap.xml`,
  }
}
