import Link from "next/link"

type StartupCardProps = {
  startup: {
    id: string
    slug: string
    title: string
    description: string
    logoUrl: string | null
    websiteUrl: string
    createdAt: Date | string
    lookingForInvestment?: boolean
    fundingStage?: string | null
    category: { name: string; slug: string }
    tags: { tag: { name: string; slug: string } }[]
  }
}

const STAGE_LABEL: Record<string, string> = {
  IDEA: "Idea Stage",
  MVP: "MVP",
  REVENUE: "Revenue",
  SCALING: "Scaling",
}

export function StartupCard({ startup }: StartupCardProps) {
  return (
    <Link
      href={`/startups/${startup.slug}`}
      className="group block bg-white rounded-2xl border border-black/5 hover:border-black/10 hover:shadow-sm transition-all p-5"
    >
      <div className="flex items-start gap-3 mb-3">
        {startup.logoUrl ? (
          <img
            src={startup.logoUrl}
            alt={startup.title}
            className="w-11 h-11 rounded-xl object-cover border border-black/5 flex-shrink-0"
          />
        ) : (
          <div className="w-11 h-11 rounded-xl bg-ink flex items-center justify-center text-white font-bold flex-shrink-0 text-lg">
            {startup.title[0]}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-ink text-sm group-hover:text-accent transition-colors truncate">
              {startup.title}
            </p>
            {startup.lookingForInvestment && (
              <span className="flex-shrink-0 text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">
                🚀 Raising
              </span>
            )}
          </div>
          <p className="text-xs text-muted mt-0.5">{startup.category.name}</p>
          {startup.lookingForInvestment && startup.fundingStage && (
            <p className="text-xs text-green-700 mt-0.5">{STAGE_LABEL[startup.fundingStage] ?? startup.fundingStage}</p>
          )}
        </div>
      </div>

      <p className="text-sm text-ink/70 line-clamp-3 leading-relaxed">
        {startup.description}
      </p>

      {startup.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {startup.tags.slice(0, 3).map(({ tag }) => (
            <span key={tag.slug} className="px-2 py-0.5 bg-black/5 rounded text-xs text-muted">
              {tag.name}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}
