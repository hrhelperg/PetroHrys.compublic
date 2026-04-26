import type { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { CONTENT_TYPE_LABEL } from "@/lib/contentUtils"

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const content = await prisma.content.findUnique({
    where: { slug: params.slug },
    select: { title: true, excerpt: true, coverImageUrl: true, status: true, contentType: true },
  })
  if (!content) return { title: "Not Found" }

  if (content.status !== "APPROVED") {
    return { title: content.title, robots: { index: false, follow: false } }
  }

  return {
    title: content.title,
    description: content.excerpt,
    alternates: { canonical: `/articles/${params.slug}` },
    openGraph: {
      title: content.title,
      description: content.excerpt,
      images: content.coverImageUrl ? [{ url: content.coverImageUrl }] : [],
      type: "article",
    },
    twitter: { card: "summary_large_image", title: content.title, description: content.excerpt },
  }
}

export const revalidate = 300

export default async function ArticleDetailPage({ params }: Props) {
  const content = await prisma.content.findUnique({
    where: { slug: params.slug },
    include: {
      author: { select: { id: true, email: true } },
      category: true,
      tags: { include: { tag: true } },
      startup: {
        select: { id: true, slug: true, title: true, logoUrl: true, description: true, websiteUrl: true },
      },
    },
  })

  if (!content) notFound()

  // Prevent public render of non-approved content
  if (content.status !== "APPROVED") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center text-muted">
        <p>This content is pending review.</p>
      </div>
    )
  }

  const related = await prisma.content.findMany({
    where: {
      status: "APPROVED",
      contentType: { in: ["ARTICLE", "CASE_STUDY", "GUIDE"] },
      slug: { not: content.slug },
      ...(content.categoryId ? { categoryId: content.categoryId } : {}),
    },
    select: { id: true, slug: true, title: true, excerpt: true, contentType: true, coverImageUrl: true, createdAt: true },
    take: 3,
    orderBy: { createdAt: "desc" },
  })

  const isArticleLike = ["ARTICLE", "CASE_STUDY", "GUIDE"].includes(content.contentType)
  const structuredData = {
    "@context": "https://schema.org",
    "@type": isArticleLike ? "Article" : "CreativeWork",
    headline: content.title,
    description: content.excerpt,
    datePublished: content.createdAt.toISOString(),
    dateModified: content.updatedAt.toISOString(),
    author: { "@type": "Person", name: content.author.email },
    ...(content.coverImageUrl ? { image: content.coverImageUrl } : {}),
  }

  // Simple body renderer: paragraphs separated by double newlines, headers by # prefix
  function renderBody(body: string) {
    return body.split("\n").map((line, i) => {
      if (line.startsWith("## ")) return <h2 key={i}>{line.slice(3)}</h2>
      if (line.startsWith("### ")) return <h3 key={i}>{line.slice(4)}</h3>
      if (line.startsWith("- ")) return <li key={i}>{line.slice(2)}</li>
      if (line.trim() === "") return <br key={i} />
      return <p key={i}>{line}</p>
    })
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <div className="max-w-3xl mx-auto px-4 py-12">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted mb-6 flex items-center gap-1.5 flex-wrap">
          <Link href="/articles" className="hover:text-ink transition-colors">Articles</Link>
          <span>/</span>
          <span className="text-ink">{CONTENT_TYPE_LABEL[content.contentType]}</span>
        </nav>

        {/* Cover */}
        {content.coverImageUrl && (
          <img
            src={content.coverImageUrl}
            alt={content.title}
            className="w-full rounded-2xl mb-8 border border-black/5"
          />
        )}

        {/* Header */}
        <div className="mb-8">
          <span className="inline-block text-xs font-medium bg-black/5 px-2 py-1 rounded mb-3">
            {CONTENT_TYPE_LABEL[content.contentType]}
          </span>
          <h1 className="text-3xl font-semibold text-ink leading-tight mb-3">{content.title}</h1>
          <p className="text-muted text-sm">
            {new Date(content.createdAt).toLocaleDateString("en-US", {
              year: "numeric", month: "long", day: "numeric",
            })}
            {content.category && (
              <>
                {" · "}
                <Link href={`/articles?category=${content.category.slug}`} className="hover:text-ink transition-colors">
                  {content.category.name}
                </Link>
              </>
            )}
          </p>

          <div className="flex flex-wrap gap-1.5 mt-3">
            {content.tags.map(({ tag }) => (
              <span key={tag.slug} className="px-2 py-0.5 bg-black/5 rounded text-xs">
                {tag.name}
              </span>
            ))}
          </div>
        </div>

        {/* Excerpt */}
        <p className="text-ink/70 text-lg leading-relaxed border-l-4 border-accent pl-4 mb-8 italic">
          {content.excerpt}
        </p>

        {/* Body */}
        <div className="prose-content text-ink/85 mb-10">
          {renderBody(content.body)}
        </div>

        {/* Related startup */}
        {content.startup && (
          <div className="bg-white rounded-2xl border border-black/5 p-5 mb-10 flex items-start gap-4">
            {content.startup.logoUrl ? (
              <img
                src={content.startup.logoUrl}
                alt={content.startup.title}
                className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-ink flex items-center justify-center text-white font-bold flex-shrink-0">
                {content.startup.title[0]}
              </div>
            )}
            <div>
              <p className="text-xs text-muted mb-0.5">About the startup</p>
              <Link href={`/startups/${content.startup.slug}`} className="font-semibold text-ink hover:text-accent transition-colors">
                {content.startup.title}
              </Link>
              <p className="text-sm text-muted mt-1 line-clamp-2">{content.startup.description}</p>
              <a
                href={content.startup.websiteUrl}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className="text-xs text-accent hover:underline mt-1 inline-block"
              >
                Visit website ↗
              </a>
            </div>
          </div>
        )}

        {/* Related content */}
        {related.length > 0 && (
          <div className="mt-12">
            <h2 className="font-semibold text-ink mb-4">Related articles</h2>
            <div className="space-y-3">
              {related.map((r) => (
                <Link
                  key={r.id}
                  href={`/articles/${r.slug}`}
                  className="block bg-white rounded-xl border border-black/5 p-4 hover:border-black/15 transition-colors"
                >
                  <p className="font-medium text-ink text-sm">{r.title}</p>
                  <p className="text-xs text-muted mt-1 line-clamp-2">{r.excerpt}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="mt-16 bg-ink rounded-2xl p-8 text-center">
          <p className="text-white font-semibold text-lg mb-2">Have something to share?</p>
          <p className="text-white/60 text-sm mb-5">Publish your article, guide, or case study for free.</p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link href="/publish" className="bg-accent text-white px-5 py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors text-sm">
              Write an article →
            </Link>
            <Link href="/submit-startup" className="bg-white/10 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-white/20 transition-colors text-sm">
              Submit a startup →
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
