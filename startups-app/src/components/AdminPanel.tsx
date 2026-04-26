"use client"

import { useState, useEffect, useCallback } from "react"
import { CONTENT_TYPE_LABEL } from "@/lib/contentUtils"

type StartupRow = {
  id: string
  title: string
  websiteUrl: string
  status: string
  lookingForInvestment: boolean
  fundingStage: string | null
  createdAt: string
  category: { name: string }
  createdBy: { email: string }
}

type ContentRow = {
  id: string
  title: string
  contentType: string
  status: string
  createdAt: string
  category: { name: string } | null
  author: { email: string }
}

type Tab = "startups" | "content"
type StatusFilter = "PENDING" | "APPROVED" | "REJECTED"

export function AdminPanel() {
  const [tab, setTab] = useState<Tab>("startups")
  const [filter, setFilter] = useState<StatusFilter>("PENDING")
  const [startups, setStartups] = useState<StartupRow[]>([])
  const [content, setContent] = useState<ContentRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    if (tab === "startups") {
      const res = await fetch(`/api/admin/moderate?status=${filter}`)
      const data = await res.json()
      setStartups(data.data ?? [])
    } else {
      const res = await fetch(`/api/admin/content?status=${filter}`)
      const data = await res.json()
      setContent(data.data ?? [])
    }
    setLoading(false)
  }, [tab, filter])

  useEffect(() => { load() }, [load])

  async function moderateStartup(id: string, status: "APPROVED" | "REJECTED") {
    await fetch("/api/admin/moderate", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    })
    load()
  }

  async function moderateContent(id: string, status: "APPROVED" | "REJECTED") {
    await fetch("/api/admin/content", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    })
    load()
  }

  const ModerationButtons = ({
    id,
    onApprove,
    onReject,
  }: {
    id: string
    onApprove: (id: string) => void
    onReject: (id: string) => void
  }) =>
    filter === "PENDING" ? (
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={() => onApprove(id)}
          className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 transition-colors font-medium"
        >
          Approve
        </button>
        <button
          onClick={() => onReject(id)}
          className="px-3 py-1.5 bg-red-100 text-accent text-xs rounded-lg hover:bg-red-200 transition-colors font-medium"
        >
          Reject
        </button>
      </div>
    ) : null

  return (
    <div>
      {/* Tab switcher */}
      <div className="flex gap-3 mb-6 border-b border-black/5 pb-4">
        {(["startups", "content"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setFilter("PENDING") }}
            className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
              tab === t ? "bg-ink text-white" : "bg-white border border-black/10 hover:border-black/20"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-6">
        {(["PENDING", "APPROVED", "REJECTED"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === s ? "bg-ink text-white" : "bg-white border border-black/10 hover:border-black/20"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted text-sm">Loading…</p>
      ) : tab === "startups" ? (
        startups.length === 0 ? (
          <p className="text-muted text-sm">No {filter.toLowerCase()} startups.</p>
        ) : (
          <div className="space-y-3">
            {startups.map((s) => (
              <div key={s.id} className="bg-white rounded-xl border border-black/5 p-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-ink">{s.title}</p>
                    {s.lookingForInvestment && (
                      <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">
                        🚀 Raising{s.fundingStage ? ` – ${s.fundingStage}` : ""}
                      </span>
                    )}
                  </div>
                  <a href={s.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline break-all">
                    {s.websiteUrl}
                  </a>
                  <p className="text-xs text-muted mt-1">
                    {s.category.name} · {s.createdBy.email} · {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <ModerationButtons
                  id={s.id}
                  onApprove={(id) => moderateStartup(id, "APPROVED")}
                  onReject={(id) => moderateStartup(id, "REJECTED")}
                />
              </div>
            ))}
          </div>
        )
      ) : content.length === 0 ? (
        <p className="text-muted text-sm">No {filter.toLowerCase()} content.</p>
      ) : (
        <div className="space-y-3">
          {content.map((c) => (
            <div key={c.id} className="bg-white rounded-xl border border-black/5 p-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs bg-black/5 px-1.5 py-0.5 rounded text-muted">
                    {CONTENT_TYPE_LABEL[c.contentType as keyof typeof CONTENT_TYPE_LABEL] ?? c.contentType}
                  </span>
                </div>
                <p className="font-semibold text-ink">{c.title}</p>
                <p className="text-xs text-muted mt-1">
                  {c.category?.name ?? "Uncategorized"} · {c.author.email} · {new Date(c.createdAt).toLocaleDateString()}
                </p>
              </div>
              <ModerationButtons
                id={c.id}
                onApprove={(id) => moderateContent(id, "APPROVED")}
                onReject={(id) => moderateContent(id, "REJECTED")}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
