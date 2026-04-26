import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  const startup = await prisma.startup.findUnique({
    where: { slug: params.slug, status: "APPROVED" },
    include: {
      category: true,
      tags: { include: { tag: true } },
      createdBy: { select: { id: true, email: true } },
      content: {
        where: { status: "APPROVED" },
        select: { id: true, slug: true, title: true, excerpt: true, contentType: true, coverImageUrl: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  })

  if (!startup) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ data: startup })
}
