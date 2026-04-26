import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { ContentForm } from "@/components/ContentForm"

export const metadata: Metadata = {
  title: "Publish Content",
  description:
    "Publish an article, guide, case study, or template on petrohrys.com. Free. SEO-indexed. Reach thousands of founders.",
  alternates: { canonical: "/publish" },
}

export default async function PublishPage() {
  const [categories, tags, startups] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.startup.findMany({
      where: { status: "APPROVED" },
      select: { id: true, title: true },
      orderBy: { title: "asc" },
    }),
  ])

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-ink">Publish Content</h1>
        <p className="text-muted mt-2 text-sm leading-relaxed">
          Share an article, case study, guide, or template. Free SEO-optimized page, reviewed within 48 hours.
          Link your content to a startup for cross-promotion.
        </p>
      </div>
      <ContentForm categories={categories} tags={tags} startups={startups} />
    </div>
  )
}
