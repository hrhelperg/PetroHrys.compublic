"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { Category, Tag } from "@prisma/client"

const INPUT = "w-full px-3 py-2.5 rounded-lg border border-black/10 bg-white text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors text-sm"

interface Props {
  categories: Category[]
  tags: Tag[]
}

const FUNDING_STAGES = [
  { value: "IDEA", label: "Idea Stage" },
  { value: "MVP", label: "MVP" },
  { value: "REVENUE", label: "Revenue Stage" },
  { value: "SCALING", label: "Scaling" },
]

export function SubmitStartupForm({ categories, tags }: Props) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [charCount, setCharCount] = useState(0)
  const [lookingForInvestment, setLookingForInvestment] = useState(false)
  const [pitchCount, setPitchCount] = useState(0)

  const [form, setForm] = useState({
    title: "",
    description: "",
    websiteUrl: "",
    categoryId: "",
    founderName: "",
    contactEmail: "",
    fundingStage: "",
    shortPitch: "",
  })

  function set(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (field === "description") setCharCount(value.length)
    if (field === "shortPitch") setPitchCount(value.length)
  }

  function toggleTag(id: string) {
    setSelectedTags((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    )
  }

  async function uploadLogo(): Promise<string | null> {
    if (!logoFile) return null
    const fd = new FormData()
    fd.append("file", logoFile)
    const res = await fetch("/api/upload", { method: "POST", body: fd })
    if (!res.ok) throw new Error("Logo upload failed")
    return (await res.json()).url as string
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError("")

    try {
      const logoUrl = await uploadLogo()
      const res = await fetch("/api/startups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          tagIds: selectedTags,
          logoUrl,
          lookingForInvestment,
          fundingStage: lookingForInvestment ? form.fundingStage : undefined,
          shortPitch: lookingForInvestment ? form.shortPitch : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Submission failed")
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="bg-white rounded-2xl border border-black/5 p-8 text-center">
        <div className="text-4xl mb-3">🚀</div>
        <h2 className="text-xl font-semibold text-ink mb-2">Submitted for review!</h2>
        <p className="text-muted text-sm mb-6">
          Your startup will appear in the directory once approved (usually within 48 hours).
        </p>
        <button
          onClick={() => router.push("/startups")}
          className="text-accent hover:underline text-sm font-medium"
        >
          Browse the directory →
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Field label="Startup Name *">
        <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} required placeholder="e.g. Acme Analytics" className={INPUT} />
      </Field>

      <Field label="Website URL *">
        <input type="url" value={form.websiteUrl} onChange={(e) => set("websiteUrl", e.target.value)} required placeholder="https://example.com" className={INPUT} />
      </Field>

      <Field label={`Description * (${charCount}/1000 — min 200 chars)`}>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value)}
          required rows={5}
          placeholder="What does your startup do? Who is it for? What problem does it solve?"
          className={`${INPUT} resize-none`}
        />
        {charCount > 0 && charCount < 200 && (
          <p className="text-xs text-accent mt-1">{200 - charCount} more characters needed</p>
        )}
      </Field>

      <Field label="Category *">
        <select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)} required className={INPUT}>
          <option value="">Select a category…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </Field>

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

      <Field label="Logo (optional — JPEG/PNG/WebP/SVG, max 2 MB)">
        <input
          type="file" accept="image/jpeg,image/png,image/webp,image/svg+xml"
          onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-black/5 file:text-ink file:font-medium hover:file:bg-black/10 transition-colors"
        />
      </Field>

      <Field label="Founder Name (optional)">
        <input type="text" value={form.founderName} onChange={(e) => set("founderName", e.target.value)} placeholder="Jane Doe" className={INPUT} />
      </Field>

      <Field label="Contact Email (optional — not published)">
        <input type="email" value={form.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="jane@example.com" className={INPUT} />
      </Field>

      {/* Investment section */}
      <div className="border border-black/8 rounded-xl p-4 bg-white space-y-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={lookingForInvestment}
            onChange={(e) => setLookingForInvestment(e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
          <span className="text-sm font-medium text-ink">Looking for investment</span>
          <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">🚀 Raising badge</span>
        </label>

        {lookingForInvestment && (
          <>
            <Field label="Funding Stage *">
              <select value={form.fundingStage} onChange={(e) => set("fundingStage", e.target.value)} required={lookingForInvestment} className={INPUT}>
                <option value="">Select stage…</option>
                {FUNDING_STAGES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Field>

            <Field label={`Short Pitch * (${pitchCount}/300 chars)`}>
              <textarea
                value={form.shortPitch}
                onChange={(e) => set("shortPitch", e.target.value)}
                required={lookingForInvestment}
                maxLength={300}
                rows={3}
                placeholder="In one or two sentences, describe what makes your startup compelling to investors."
                className={`${INPUT} resize-none`}
              />
            </Field>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 text-accent text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      <button
        type="submit" disabled={submitting}
        className="w-full bg-accent text-white py-3 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 text-sm"
      >
        {submitting ? "Submitting…" : "Submit startup for review"}
      </button>

      <p className="text-xs text-center text-muted">
        All submissions are reviewed within 48 hours. No spam, ever.
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
