import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(
  _req: Request,
  { params }: { params: { slug: string } }
) {
  const content = await prisma.content.findUnique({
    where: { slug: params.slug, status: "APPROVED" },
    include: {
      author: { select: { id: true, email: true } },
      category: true,
      tags: { include: { tag: true } },
      startup: { select: { id: true, slug: true, title: true, logoUrl: true, description: true } },
    },
  })

  if (!content) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({ data: content })
}
