import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { ContentCard } from "@/components/ContentCard"

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const startup = await prisma.startup.findUnique({
    where: { slug: params.slug },
    select: { title: true, description: true, logoUrl: true, status: true },
  })
  if (!startup) return { title: "Not Found" }

  if (startup.status !== "APPROVED") {
    return { title: startup.title, robots: { index: false, follow: false } }
  }

  const desc = startup.description.slice(0, 155) + (startup.description.length > 155 ? "…" : "")
  return {
    title: startup.title,
    description: desc,
    alternates: { canonical: `/startups/${params.slug}` },
    openGraph: {
      title: startup.title,
      description: desc,
      images: startup.logoUrl ? [{ url: startup.logoUrl }] : [],
      type: "website",
    },
    twitter: { card: "summary", title: startup.title, description: desc },
  }
}

export const revalidate = 300

export default async function StartupPage({ params }: Props) {
  const startup = await prisma.startup.findUnique({
    where: { slug: params.slug },
    include: {
      category: true,
      tags: { include: { tag: true } },
      createdBy: { select: { id: true, email: true } },
      content: {
        where: { status: "APPROVED" },
        select: { id: true, slug: true, title: true, excerpt: true, contentType: true, coverImageUrl: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 4,
      },
    },
  })

  if (!startup) notFound()

  const similar = await prisma.startup.findMany({
    where: { status: "APPROVED", categoryId: startup.categoryId, slug: { not: startup.slug } },
    include: { category: true, tags: { include: { tag: true } } },
    take: 3,
    orderBy: { createdAt: "desc" },
  })

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: startup.title,
    description: startup.description,
    url: startup.websiteUrl,
    applicationCategory: startup.category.name,
    ...(startup.logoUrl ? { image: startup.logoUrl } : {}),
    ...(startup.founderName ? { author: { "@type": "Person", name: startup.founderName } } : {}),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {startup.status !== "APPROVED" && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-sm text-yellow-800 text-center">
          This startup is pending review and is not publicly indexed.
        </div>
      )}

      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted mb-6 flex items-center gap-1.5">
          <Link href="/startups" className="hover:text-ink transition-colors">Directory</Link>
          <span>/</span>
          <Link href={`/startups?category=${startup.category.slug}`} className="hover:text-ink transition-colors">{startup.category.name}</Link>
          <span>/</span>
          <span className="text-ink">{startup.title}</span>
        </nav>

        {/* Header */}
        <div className="flex items-start gap-5 mb-6">
          {startup.logoUrl ? (
            <img
              src={startup.logoUrl}
              alt={`${startup.title} logo`}
              className="w-20 h-20 rounded-2xl object-cover border border-black/5 flex-shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-ink flex items-center justify-center text-white text-3xl font-bold flex-shrink-0">
              {startup.title[0]}
            </div>
          )}
          <div>
            <h1 className="text-3xl font-semibold text-ink">{startup.title}</h1>
            <Link
              href={`/startups?category=${startup.category.slug}`}
              className="text-sm text-muted hover:text-ink transition-colors mt-1 inline-block"
            >
              {startup.category.name}
            </Link>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {startup.tags.map(({ tag }) => (
                <Link
                  key={tag.slug}
                  href={`/startups?tag=${tag.slug}`}
                  className="px-2 py-0.5 bg-black/5 rounded text-xs hover:bg-black/10 transition-colors"
                >
                  {tag.name}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <a
          href={startup.websiteUrl}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="inline-flex items-center gap-2 bg-accent text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors mb-8"
        >
          Visit {startup.title} ↗
        </a>

        {/* Description */}
        <div className="bg-white rounded-2xl border border-black/5 p-6 mb-6">
          <h2 className="font-semibold text-ink mb-3">About</h2>
          <p className="text-ink/80 leading-relaxed whitespace-pre-line">{startup.description}</p>
        </div>

        {/* Screenshots */}
        {startup.screenshots.length > 0 && (
          <div className="mb-8">
            <h2 className="font-semibold text-ink mb-3">Screenshots</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {startup.screenshots.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt={`${startup.title} screenshot ${i + 1}`}
                  className="rounded-xl border border-black/5 w-full"
                />
              ))}
            </div>
          </div>
        )}

        {startup.founderName && (
          <div className="bg-white rounded-2xl border border-black/5 p-6 mb-6">
            <h2 className="font-semibold text-ink mb-1">Founder</h2>
            <p className="text-ink/80">{startup.founderName}</p>
          </div>
        )}

        {/* Related articles/guides */}
        {startup.content.length > 0 && (
          <div className="mt-10">
            <h2 className="font-semibold text-ink mb-4">Content from this startup</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {startup.content.map((c) => (
                <ContentCard key={c.id} content={c as Parameters<typeof ContentCard>[0]["content"]} />
              ))}
            </div>
          </div>
        )}

        {/* Similar startups */}
        {similar.length > 0 && (
          <div className="mt-12">
            <h2 className="font-semibold text-ink mb-4">Similar Startups</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {similar.map((s) => (
                <Link
                  key={s.id}
                  href={`/startups/${s.slug}`}
                  className="bg-white rounded-xl border border-black/5 p-4 hover:border-black/15 transition-colors"
                >
                  <p className="font-medium text-ink text-sm">{s.title}</p>
                  <p className="text-xs text-muted mt-1">{s.category.name}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-16 bg-ink rounded-2xl p-8 text-center">
          <p className="text-white font-semibold text-lg mb-2">Have a startup?</p>
          <p className="text-white/60 text-sm mb-5">Submit it for free. Get discovered. No account required to browse.</p>
          <Link
            href="/submit-startup"
            className="inline-block bg-accent text-white px-6 py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors"
          >
            Submit your startup →
          </Link>
        </div>
      </div>
    </>
  )
}
