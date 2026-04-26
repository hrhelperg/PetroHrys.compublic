import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { headers } from "next/headers"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rateLimit"
import { uniqueSlug } from "@/lib/slugify"
import type { FundingStage } from "@prisma/client"

const VALID_STAGES: FundingStage[] = ["IDEA", "MVP", "REVENUE", "SCALING"]

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = 12
  const category = searchParams.get("category")
  const tag = searchParams.get("tag")
  const raising = searchParams.get("raising") === "true"

  const where = {
    status: "APPROVED" as const,
    ...(category ? { category: { slug: category } } : {}),
    ...(tag ? { tags: { some: { tag: { slug: tag } } } } : {}),
    ...(raising ? { lookingForInvestment: true } : {}),
  }

  const [items, total] = await Promise.all([
    prisma.startup.findMany({
      where,
      include: {
        category: true,
        tags: { include: { tag: true } },
        createdBy: { select: { id: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.startup.count({ where }),
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const ip = (await headers()).get("x-forwarded-for") ?? "unknown"
  const { allowed, retryAfter } = rateLimit(`startup:${ip}`)
  if (!allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${retryAfter}s` },
      { status: 429 }
    )
  }

  try {
    const body = await req.json()
    const {
      title, description, websiteUrl, categoryId, tagIds,
      logoUrl, screenshots, founderName, contactEmail,
      lookingForInvestment, fundingStage, shortPitch,
    } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: "Title required" }, { status: 400 })
    }
    if (!description?.trim() || description.length < 200 || description.length > 1000) {
      return NextResponse.json({ error: "Description must be 200–1000 characters" }, { status: 400 })
    }
    if (!categoryId) {
      return NextResponse.json({ error: "Category required" }, { status: 400 })
    }

    if (lookingForInvestment) {
      if (!fundingStage || !VALID_STAGES.includes(fundingStage)) {
        return NextResponse.json({ error: "Funding stage required when looking for investment" }, { status: 400 })
      }
      if (!shortPitch?.trim() || shortPitch.trim().length > 300) {
        return NextResponse.json({ error: "Short pitch required (max 300 chars)" }, { status: 400 })
      }
    }

    let normalizedUrl: string
    try {
      normalizedUrl = new URL(websiteUrl).href
    } catch {
      return NextResponse.json({ error: "Invalid website URL" }, { status: 400 })
    }

    const existing = await prisma.startup.findFirst({ where: { websiteUrl: normalizedUrl } })
    if (existing) {
      return NextResponse.json({ error: "This domain has already been submitted" }, { status: 409 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const slug = await uniqueSlug(title, async (s) => {
      const found = await prisma.startup.findUnique({ where: { slug: s } })
      return !!found
    })

    const startup = await prisma.startup.create({
      data: {
        slug,
        title: title.trim(),
        description: description.trim(),
        websiteUrl: normalizedUrl,
        categoryId,
        logoUrl: logoUrl ?? null,
        screenshots: screenshots ?? [],
        founderName: founderName?.trim() ?? null,
        contactEmail: contactEmail?.trim() ?? null,
        status: "PENDING",
        createdById: user.id,
        lookingForInvestment: !!lookingForInvestment,
        fundingStage: lookingForInvestment ? fundingStage : null,
        shortPitch: lookingForInvestment ? shortPitch?.trim() ?? null : null,
        tags: tagIds?.length
          ? { create: (tagIds as string[]).map((tagId) => ({ tagId })) }
          : undefined,
      },
    })

    return NextResponse.json({ data: startup }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Submission failed" }, { status: 500 })
  }
}
