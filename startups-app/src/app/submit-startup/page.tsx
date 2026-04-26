import type { Metadata } from "next"
import { prisma } from "@/lib/prisma"
import { SubmitStartupForm } from "@/components/SubmitStartupForm"

export const metadata: Metadata = {
  title: "Submit Your Startup",
  description:
    "Get a free SEO-optimized listing on petrohrys.com. Reach developers, founders, and early adopters.",
  alternates: { canonical: "/submit-startup" },
  openGraph: { title: "Submit Your Startup – Free Listing on petrohrys.com", type: "website" },
}

export default async function SubmitStartupPage() {
  const [categories, tags] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
  ])

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold text-ink">Submit Your Startup</h1>
        <p className="text-muted mt-2 text-sm leading-relaxed">
          Free listing · SEO-optimized page · Reviewed within 48 hours.
          Your startup gets its own page with structured data, internal links, and sitemap inclusion.
        </p>
      </div>
      <SubmitStartupForm categories={categories} tags={tags} />
    </div>
  )
}
