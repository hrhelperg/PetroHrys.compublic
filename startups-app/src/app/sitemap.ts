import type { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"

const BASE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://petrohrys.com"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [startups, content] = await Promise.all([
    prisma.startup.findMany({
      where: { status: "APPROVED" },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.content.findMany({
      where: { status: "APPROVED" },
      select: { slug: true, contentType: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
  ])

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/startups`, lastModified: new Date(), priority: 0.9 },
    { url: `${BASE}/articles`, lastModified: new Date(), priority: 0.85 },
    { url: `${BASE}/templates`, lastModified: new Date(), priority: 0.8 },
    { url: `${BASE}/submit-startup`, lastModified: new Date(), priority: 0.7 },
    { url: `${BASE}/publish`, lastModified: new Date(), priority: 0.7 },
  ]

  const startupRoutes: MetadataRoute.Sitemap = startups.map((s) => ({
    url: `${BASE}/startups/${s.slug}`,
    lastModified: s.updatedAt,
    priority: 0.8,
  }))

  const articleRoutes: MetadataRoute.Sitemap = content
    .filter((c) => c.contentType !== "TEMPLATE")
    .map((c) => ({
      url: `${BASE}/articles/${c.slug}`,
      lastModified: c.updatedAt,
      priority: 0.75,
    }))

  const templateRoutes: MetadataRoute.Sitemap = content
    .filter((c) => c.contentType === "TEMPLATE")
    .map((c) => ({
      url: `${BASE}/templates/${c.slug}`,
      lastModified: c.updatedAt,
      priority: 0.75,
    }))

  return [...staticRoutes, ...startupRoutes, ...articleRoutes, ...templateRoutes]
}
