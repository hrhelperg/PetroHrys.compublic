import Link from "next/link"
import { CONTENT_TYPE_LABEL, CONTENT_TYPE_ROUTE } from "@/lib/contentUtils"
import type { ContentType } from "@prisma/client"

type ContentCardProps = {
  content: {
    id: string
    slug: string
    title: string
    excerpt: string
    contentType: ContentType
    coverImageUrl?: string | null
    createdAt: Date | string
    category?: { name: string; slug: string } | null
    tags?: { tag: { name: string; slug: string } }[]
    author?: { email: string }
  }
}

export function ContentCard({ content }: ContentCardProps) {
  const href = `${CONTENT_TYPE_ROUTE[content.contentType]}/${content.slug}`

  return (
    <Link
      href={href}
      className="group block bg-white rounded-2xl border border-black/5 hover:border-black/10 hover:shadow-sm transition-all overflow-hidden"
    >
      {content.coverImageUrl && (
        <img
          src={content.coverImageUrl}
          alt={content.title}
          className="w-full h-36 object-cover"
        />
      )}
      <div className="p-5">
        <span className="text-xs font-medium bg-black/5 px-2 py-0.5 rounded text-muted">
          {CONTENT_TYPE_LABEL[content.contentType]}
        </span>
        <p className="font-semibold text-ink text-sm mt-2 group-hover:text-accent transition-colors line-clamp-2 leading-snug">
          {content.title}
        </p>
        <p className="text-xs text-muted mt-2 line-clamp-2 leading-relaxed">{content.excerpt}</p>

        {content.tags && content.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {content.tags.slice(0, 3).map(({ tag }) => (
              <span key={tag.slug} className="px-2 py-0.5 bg-black/5 rounded text-xs text-muted">
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}
