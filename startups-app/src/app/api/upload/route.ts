import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { randomUUID } from "crypto"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]
const MAX_SIZE = 2 * 1024 * 1024 // 2 MB

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get("file") as File | null

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Invalid file type. Use JPEG, PNG, WebP, or SVG" },
      { status: 400 }
    )
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "File too large. Max 2 MB" }, { status: 400 })
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png"
  const filename = `${randomUUID()}.${ext}`
  const uploadDir = join(process.cwd(), "public", "uploads")

  await mkdir(uploadDir, { recursive: true })
  await writeFile(join(uploadDir, filename), Buffer.from(await file.arrayBuffer()))

  return NextResponse.json({ url: `/uploads/${filename}` })
}
