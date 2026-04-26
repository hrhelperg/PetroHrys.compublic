import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  // Categories
  const categories = [
    { name: "SaaS", slug: "saas" },
    { name: "Mobile App", slug: "mobile-app" },
    { name: "Developer Tools", slug: "developer-tools" },
    { name: "AI / ML", slug: "ai-ml" },
    { name: "E-commerce", slug: "e-commerce" },
    { name: "Productivity", slug: "productivity" },
    { name: "Finance", slug: "finance" },
    { name: "Health & Wellness", slug: "health-wellness" },
    { name: "Education", slug: "education" },
    { name: "Marketing", slug: "marketing" },
    { name: "Other", slug: "other" },
  ]

  for (const cat of categories) {
    await prisma.category.upsert({
      where: { slug: cat.slug },
      update: {},
      create: cat,
    })
  }

  // Tags
  const tags = [
    "open-source", "freemium", "free", "paid",
    "b2b", "b2c", "mobile", "web", "desktop",
    "no-code", "api", "automation", "analytics",
    "design", "writing", "security", "privacy",
  ]

  for (const name of tags) {
    await prisma.tag.upsert({
      where: { slug: name },
      update: {},
      create: { name, slug: name },
    })
  }

  // Admin user
  const adminPassword = await bcrypt.hash("admin123!", 12)
  await prisma.user.upsert({
    where: { email: "admin@petrohrys.com" },
    update: {},
    create: {
      email: "admin@petrohrys.com",
      password: adminPassword,
      role: "ADMIN",
    },
  })

  console.log("✅ Seed complete — admin: admin@petrohrys.com / admin123!")
  console.log("⚠️  Change the admin password immediately in production!")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
