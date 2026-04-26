import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { headers } from "next/headers"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rateLimit"
import { uniqueSlug } from "@/lib/slugify"
import type { ContentType } from "@prisma/client"

const VALID_TYPES: ContentType[] = ["ARTICLE", "CASE_STUDY", "GUIDE", "TEMPLATE"]
const MIN_WORDS = 150

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit = 12
  const type = searchParams.get("type") as ContentType | null
  const category = searchParams.get("category")
  const tag = searchParams.get("tag")

  const where = {
    status: "APPROVED" as const,
    ...(type && VALID_TYPES.includes(type) ? { contentType: type } : {}),
    ...(category ? { category: { slug: category } } : {}),
    ...(tag ? { tags: { some: { tag: { slug: tag } } } } : {}),
  }

  const [items, total] = await Promise.all([
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
  ])

  return NextResponse.json({ items, total, page, pages: Math.ceil(total / limit) })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const ip = (await headers()).get("x-forwarded-for") ?? "unknown"
  const { allowed, retryAfter } = rateLimit(`content:${ip}`)
  if (!allowed) {
    return NextResponse.json(
      { error: `Rate limit exceeded. Try again in ${retryAfter}s` },
      { status: 429 }
    )
  }

  try {
    const body = await req.json()
    const { title, body: contentBody, excerpt, contentType, categoryId, tagIds, coverImageUrl, startupId } = body

    if (!title?.trim() || title.trim().length < 5) {
      return NextResponse.json({ error: "Title must be at least 5 characters" }, { status: 400 })
    }
    if (!contentBody?.trim() || countWords(contentBody) < MIN_WORDS) {
      return NextResponse.json(
        { error: `Content body must be at least ${MIN_WORDS} words` },
        { status: 400 }
      )
    }
    if (!excerpt?.trim() || excerpt.trim().length < 50 || excerpt.trim().length > 300) {
      return NextResponse.json({ error: "Excerpt must be 50–300 characters" }, { status: 400 })
    }
    if (!VALID_TYPES.includes(contentType)) {
      return NextResponse.json({ error: "Invalid content type" }, { status: 400 })
    }

    // Duplicate title guard
    const dupTitle = await prisma.content.findFirst({
      where: { title: { equals: title.trim(), mode: "insensitive" } },
    })
    if (dupTitle) {
      return NextResponse.json({ error: "A post with this title already exists" }, { status: 409 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const slug = await uniqueSlug(title, async (s) => {
      const found = await prisma.content.findUnique({ where: { slug: s } })
      return !!found
    })

    const content = await prisma.content.create({
      data: {
        slug,
        title: title.trim(),
        body: contentBody.trim(),
        excerpt: excerpt.trim(),
        contentType,
        coverImageUrl: coverImageUrl ?? null,
        status: "PENDING",
        authorId: user.id,
        categoryId: categoryId || null,
        startupId: startupId || null,
        tags: tagIds?.length
          ? { create: (tagIds as string[]).map((tagId) => ({ tagId })) }
          : undefined,
      },
    })

    return NextResponse.json({ data: content }, { status: 201 })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: "Submission failed" }, { status: 500 })
  }
}
