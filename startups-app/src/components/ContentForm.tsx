"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Category, Tag } from "@prisma/client"
import { CONTENT_TYPE_LABEL, CONTENT_TYPE_ROUTE } from "@/lib/contentUtils"

const INPUT = "w-full px-3 py-2.5 rounded-lg border border-black/10 bg-white text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors text-sm"

const CONTENT_TYPES = ["ARTICLE", "CASE_STUDY", "GUIDE", "TEMPLATE"] as const

interface Props {
  categories: Category[]
  tags: Tag[]
  startups: { id: string; title: string }[]
}

export function ContentForm({ categories, tags, startups }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<{ slug: string; type: string } | null>(null)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const [form, setForm] = useState({
    title: "",
    body: "",
    excerpt: "",
    contentType: "ARTICLE" as typeof CONTENT_TYPES[number],
    categoryId: "",
    startupId: "",
  })

  function set<K extends keyof typeof form>(field: K, value: typeof form[K]) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function toggleTag(id: string) {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  const wordCount = form.body.trim().split(/\s+/).filter(Boolean).length

  async function uploadCover(): Promise<string | null> {
    if (!coverFile) return null
    const fd = new FormData()
    fd.append("file", coverFile)
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    if (!res.ok) throw new Error("Cover upload failed")
    return (await res.json()).url as string
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError("")

    try {
      const coverImageUrl = await uploadCover()
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tagIds: selectedTags,
          coverImageUrl,
          categoryId: form.categoryId || undefined,
          startupId: form.startupId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Submission failed")
      setSuccess({ slug: data.data.slug, type: data.data.contentType })
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    const route = CONTENT_TYPE_ROUTE[success.type as keyof typeof CONTENT_TYPE_ROUTE]
    return (
      <div className="bg-white rounded-2xl border border-black/5 p-8 text-center">
        <div className="text-4xl mb-3">✅</div>
        <h2 className="text-xl font-semibold text-ink mb-2">Submitted for review!</h2>
        <p className="text-muted text-sm mb-6">
          Your content will be published once approved. Usually within 48 hours.
        </p>
        <button
          onClick={() => router.push(route)}
          className="text-accent hover:underline text-sm font-medium"
        >
          Browse {CONTENT_TYPE_LABEL[success.type as keyof typeof CONTENT_TYPE_LABEL]}s →
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Content Type *">
        <div className="flex gap-2 flex-wrap">
          {CONTENT_TYPES.map((type) => (
            <button
              key={type} type="button"
              onClick={() => set("contentType", type)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                form.contentType === type
                  ? "bg-ink text-white border-ink"
                  : "bg-white text-ink border-black/10 hover:border-black/20"
              }`}
            >
              {CONTENT_TYPE_LABEL[type]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Title *">
        <input
          type="text" value={form.title}
          onChange={(e) => set("title", e.target.value)}
          required minLength={5}
          placeholder={
            form.contentType === "TEMPLATE"
              ? "e.g. SaaS Pricing Page Template"
              : "e.g. How We Got Our First 100 Customers"
          }
          className={INPUT}
        />
      </Field>

      <Field label="Excerpt * (50–300 chars — shown in cards and meta description)">
        <textarea
          value={form.excerpt}
          onChange={(e) => set("excerpt", e.target.value)}
          required rows={2}
          placeholder="A one or two sentence summary of what this content covers."
          className={`${INPUT} resize-none`}
          maxLength={300}
        />
        {form.excerpt.length > 0 && form.excerpt.length < 50 && (
          <p className="text-xs text-accent mt-1">{50 - form.excerpt.length} more characters needed</p>
        )}
      </Field>

      <Field label={`Body * (minimum 150 words — currently ${wordCount})`}>
        <textarea
          value={form.body}
          onChange={(e) => set("body", e.target.value)}
          required rows={14}
          placeholder={
            form.contentType === "TEMPLATE"
              ? "Provide the full template content. Use ## for headings, - for bullets."
              : "Write your article. Use ## for headings, ### for subheadings, - for bullet points."
          }
          className={`${INPUT} resize-y font-mono text-xs leading-relaxed`}
        />
        {form.body.length > 0 && wordCount < 150 && (
          <p className="text-xs text-accent mt-1">{150 - wordCount} more words needed</p>
        )}
        <p className="text-xs text-muted mt-1">
          Supports basic formatting: ## Heading, ### Subheading, - bullet point
        </p>
      </Field>

      <Field label="Category (optional)">
        <select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} className={INPUT}>
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>

      {startups.length > 0 && (
        <Field label="Related Startup (optional — links this content to a startup page)">
          <select value={form.startupId} onChange={(e) => set("startupId", e.target.value)} className={INPUT}>
            <option value="">No startup</option>
            {startups.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Tags (select all that apply)">
        <div className="flex flex-wrap gap-2 p-3 bg-white rounded-lg border border-black/10">
          {tags.map((tag) => (
            <button
              key={tag.id} type="button" onClick={() => toggleTag(tag.id)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                selectedTags.includes(tag.id) ? "bg-ink text-white" : "bg-black/5 text-ink hover:bg-black/10"
              }`}
            >
              {tag.name}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Cover Image (optional — JPEG/PNG/WebP/SVG, max 2 MB)">
        <input
          type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml"
          onChange={(e) => setCoverFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-black/5 file:text-ink file:font-medium hover:file:bg-black/10 transition-colors"
        />
      </Field>

      {error && (
        <div className="bg-red-50 border border-red-100 text-accent text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <button
        type="submit" disabled={submitting}
        className="w-full bg-accent text-white py-3 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
      >
        {submitting ? "Submitting…" : `Submit ${CONTENT_TYPE_LABEL[form.contentType]} for review`}
      </button>

      <p className="text-xs text-center text-muted">
        Reviewed within 48 hours. External links are automatically marked nofollow.
      </p>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1.5">{label}</label>
      {children}
    </div>
  )
}
