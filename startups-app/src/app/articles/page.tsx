import type { Metadata } from "next"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { ContentCard } from "@/components/ContentCard"
import { CONTENT_TYPE_LABEL } from "@/lib/contentUtils"

export const metadata: Metadata = {
  title: "Articles, Guides & Case Studies",
  description:
    "Founder articles, growth guides, and case studies from indie startup builders. Real stories, practical advice.",
  alternates: { canonical: "/articles" },
  openGraph: { title: "Founder Articles & Guides – petrohrys.com", type: "website" },
}

export const revalidate = 60

interface Props {
  searchParams: { page?: string; type?: string; category?: string }
}

export default async function ArticlesPage({ searchParams }: Props) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1"))
  const limit = 12
  const typeFilter = searchParams.type
  const categoryFilter = searchParams.category

  const where = {
    status: "APPROVED" as const,
    contentType: { in: ["ARTICLE", "CASE_STUDY", "GUIDE"] as const },
    ...(typeFilter && ["ARTICLE", "CASE_STUDY", "GUIDE"].includes(typeFilter)
      ? { contentType: typeFilter as "ARTICLE" | "CASE_STUDY" | "GUIDE" }
      : {}),
    ...(categoryFilter ? { category: { slug: categoryFilter } } : {}),
  }

  const [items, total, categories] = await Promise.all([
    prisma.content.findMany({
      where,
      include: {
        author: { select: { email: true } },
        category: true,
        tags: { include: { tag: true } },
        startup: { select: { id: true, slug: true, title: true, logoUrl: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.content.count({ where }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ])

  const pages = Math.ceil(total / limit)

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Articles & Guides</h1>
          <p className="text-muted mt-1">{total} posts from founders and builders</p>
        </div>
        <Link
          href="/publish"
          className="bg-accent text-white px-5 py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors text-sm"
        >
          Write an article →
        </Link>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {[
          { label: "All", value: "" },
          { label: "Articles", value: "ARTICLE" },
          { label: "Case Studies", value: "CASE_STUDY" },
          { label: "Guides", value: "GUIDE" },
        ].map(({ label, value }) => (
          <Link
            key={value}
            href={value ? `/articles?type=${value}` : "/articles"}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              typeFilter === value || (!typeFilter && value === "")
                ? "bg-ink text-white"
                : "bg-white border border-black/10 hover:border-black/20"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href={typeFilter ? `/articles?type=${typeFilter}` : "/articles"}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !categoryFilter ? "bg-ink text-white" : "bg-white border border-black/10 hover:border-black/20"
          }`}
        >
          All categories
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/articles?${typeFilter ? `type=${typeFilter}&` : ""}category=${cat.slug}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              categoryFilter === cat.slug
                ? "bg-ink text-white"
                : "bg-white border border-black/10 hover:border-black/20"
            }`}
          >
            {cat.name}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-20 text-muted">
          <p className="text-lg">No articles yet.</p>
          <Link href="/publish" className="text-accent hover:underline mt-2 inline-block text-sm">
            Be the first to publish →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map((item) => (
            <ContentCard
              key={item.id}
              content={item as Parameters<typeof ContentCard>[0]["content"]}
            />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex justify-center gap-2 mt-12">
          {page > 1 && (
            <Link
              href={`/articles?page=${page - 1}${typeFilter ? `&type=${typeFilter}` : ""}`}
              className="px-4 py-2 rounded-lg bg-white border border-black/10 text-sm"
            >
              ← Previous
            </Link>
          )}
          <span className="px-4 py-2 text-sm text-muted">Page {page} of {pages}</span>
          {page < pages && (
            <Link
              href={`/articles?page=${page + 1}${typeFilter ? `&type=${typeFilter}` : ""}`}
              className="px-4 py-2 rounded-lg bg-white border border-black/10 text-sm"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
