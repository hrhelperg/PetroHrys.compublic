import type { Metadata } from "next"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { StartupCard } from "@/components/StartupCard"

export const metadata: Metadata = {
  title: "Startups Looking for Investment",
  description:
    "Discover bootstrapped and early-stage startups actively seeking investment. Browse by funding stage: idea, MVP, revenue, and scaling.",
  alternates: { canonical: "/startups/raising" },
  openGraph: {
    title: "Startups Raising – petrohrys.com",
    description: "Early-stage startups actively seeking investment.",
    type: "website",
  },
}

export const revalidate = 60

const STAGE_LABEL: Record<string, string> = {
  IDEA: "Idea Stage",
  MVP: "MVP",
  REVENUE: "Revenue Stage",
  SCALING: "Scaling",
}

interface Props {
  searchParams: { page?: string; stage?: string }
}

export default async function RaisingPage({ searchParams }: Props) {
  const page = Math.max(1, parseInt(searchParams.page ?? "1"))
  const limit = 12
  const stageFilter = searchParams.stage

  const where = {
    status: "APPROVED" as const,
    lookingForInvestment: true,
    ...(stageFilter && Object.keys(STAGE_LABEL).includes(stageFilter)
      ? { fundingStage: stageFilter as "IDEA" | "MVP" | "REVENUE" | "SCALING" }
      : {}),
  }

  const [startups, total] = await Promise.all([
    prisma.startup.findMany({
      where,
      include: { category: true, tags: { include: { tag: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.startup.count({ where }),
  ])

  const pages = Math.ceil(total / limit)

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Breadcrumb */}
      <nav className="text-sm text-muted mb-6 flex items-center gap-1.5">
        <Link href="/startups" className="hover:text-ink transition-colors">Directory</Link>
        <span>/</span>
        <span className="text-ink">Raising</span>
      </nav>

      <div className="flex items-start justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold text-ink">
            Startups Raising{" "}
            <span className="inline-block bg-green-100 text-green-800 text-sm px-2 py-0.5 rounded-full align-middle font-medium ml-1">
              🚀 {total} seeking investment
            </span>
          </h1>
          <p className="text-muted mt-2 text-sm">
            Early-stage and growth-stage startups actively looking for investors and advisors.
          </p>
        </div>
        <Link
          href="/submit-startup"
          className="bg-accent text-white px-5 py-2.5 rounded-lg font-medium hover:bg-red-700 transition-colors text-sm"
        >
          List your startup →
        </Link>
      </div>

      {/* Stage filter */}
      <div className="flex flex-wrap gap-2 mb-8">
        <Link
          href="/startups/raising"
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            !stageFilter ? "bg-ink text-white" : "bg-white border border-black/10 hover:border-black/20"
          }`}
        >
          All stages
        </Link>
        {Object.entries(STAGE_LABEL).map(([value, label]) => (
          <Link
            key={value}
            href={`/startups/raising?stage=${value}`}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              stageFilter === value
                ? "bg-ink text-white"
                : "bg-white border border-black/10 hover:border-black/20"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {startups.length === 0 ? (
        <div className="text-center py-20 text-muted">
          <p className="text-lg">No startups found for this filter.</p>
          <Link href="/submit-startup" className="text-accent hover:underline mt-2 inline-block text-sm">
            Submit yours →
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
              href={`/startups/raising?page=${page - 1}${stageFilter ? `&stage=${stageFilter}` : ""}`}
              className="px-4 py-2 rounded-lg bg-white border border-black/10 text-sm"
            >
              ← Previous
            </Link>
          )}
          <span className="px-4 py-2 text-sm text-muted">Page {page} of {pages}</span>
          {page < pages && (
            <Link
              href={`/startups/raising?page=${page + 1}${stageFilter ? `&stage=${stageFilter}` : ""}`}
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
