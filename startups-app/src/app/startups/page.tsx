import type { Metadata } from "next"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { StartupCard } from "@/components/StartupCard"

export const metadata: Metadata = {
  title: "Startup Directory",
  description:
    "Discover indie startups across SaaS, mobile apps, developer tools, AI, and more. Free listings, curated by humans.",
  alternates: { canonical: "/startups" },
  openGraph: { title: "Startup Directory – petrohrys.com", type: "website" },
}

export const revalidate = 60

interface Props {
  searchParams: { page?: string; category?: string; tag?: string }
}

export default async function StartupsPage({ searchParams }: Props) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1"))
  const limit = 12
  const categorySlug = searchParams.category
  const tagSlug = searchParams.tag

  const where = {
    status: "APPROVED" as const,
    ...(categorySlug ? { category: { slug: categorySlug } } : {}),
    ...(tagSlug ? { tags: { some: { tag: { slug: tagSlug } } } } : {}),
  }

  const [startups, total, categories] = await Promise.all([
    prisma.startup.findMany({
      where,
      include: { category: true, tags: { include: { tag: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.startup.count({ where }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ])

  const pages = Math.ceil(total / limit)

  const buildHref = (p: number) => {
    const params = new URLSearchParams()
    if (p > 1) params.set("page", String(p))
    if (categorySlug) params.set("category", categorySlug)
    if (tagSlug) params.set("tag", tagSlug)
    const q = params.toString()
    return `/startups${q ? `?${q}` : ""}`
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Startup Directory</h1>
          <p className="text-muted mt-1">{total} startups listed</p>
        </div>
        <Link
          href="/submit-startup"
          className="bg-accent text-white px-5 py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors text-sm"
        >
          Submit your startup →
        </Link>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/startups"
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !categorySlug ? "bg-ink text-white" : "bg-white border border-black/10 hover:border-black/20"
          }`}
        >
          All
        </Link>
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/startups?category=${cat.slug}`}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              categorySlug === cat.slug
                ? "bg-ink text-white"
                : "bg-white border border-black/10 hover:border-black/20"
            }`}
          >
            {cat.name}
          </Link>
        ))}
      </div>

      {startups.length === 0 ? (
        <div className="text-center py-20 text-muted">
          <p className="text-lg">No startups found.</p>
          <Link href="/submit-startup" className="text-accent hover:underline mt-2 inline-block text-sm">
            Be the first to submit →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {startups.map((s) => (
            <StartupCard key={s.id} startup={s as Parameters<typeof StartupCard>[0]["startup"]} />
          ))}
        </div>
      )}

      {pages > 1 && (
        <div className="flex justify-center gap-2 mt-12">
          {page > 1 && (
            <Link
              href={buildHref(page - 1)}
              className="px-4 py-2 rounded-lg bg-white border border-black/10 hover:border-black/20 text-sm"
            >
              ← Previous
            </Link>
          )}
          <span className="px-4 py-2 text-sm text-muted">
            Page {page} of {pages}
          </span>
          {page < pages && (
            <Link
              href={buildHref(page + 1)}
              className="px-4 py-2 rounded-lg bg-white border border-black/10 hover:border-black/20 text-sm"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
