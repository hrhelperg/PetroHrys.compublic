export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  const slug = slugify(base)
  if (!(await exists(slug))) return slug

  for (let i = 2; i < 100; i++) {
    const candidate = `${slug}-${i}`
    if (!(await exists(candidate))) return candidate
  }

  return `${slug}-${Date.now()}`
}
