import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

function isAdmin(session: Awaited<ReturnType<typeof getServerSession>>) {
  return (session?.user as { role?: string })?.role === "ADMIN"
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const status = (searchParams.get("status") ?? "PENDING") as "PENDING" | "APPROVED" | "REJECTED"

  const startups = await prisma.startup.findMany({
    where: { status },
    include: {
      category: { select: { name: true } },
      createdBy: { select: { email: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ data: startups })
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id, status } = await req.json()
  if (!id || !["APPROVED", "REJECTED"].includes(status)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const updated = await prisma.startup.update({
    where: { id },
    data: { status },
    select: { id: true, status: true, slug: true },
  })

  return NextResponse.json({ data: updated })
}
