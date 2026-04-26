import type { Metadata } from "next"
import { AdminPanel } from "@/components/AdminPanel"

export const metadata: Metadata = {
  title: "Admin – Moderation",
  robots: { index: false, follow: false },
}

export default function AdminPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold text-ink mb-8">Moderation Dashboard</h1>
      <AdminPanel />
    </div>
  )
}
