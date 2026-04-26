"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { signIn } from "next-auth/react"

const INPUT = "w-full px-3 py-2.5 rounded-lg border border-black/10 bg-white text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors text-sm"

export default function RegisterPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error ?? "Registration failed")
      setLoading(false)
      return
    }

    await signIn("credentials", { email, password, redirect: false })
    router.push("/submit-startup")
    router.refresh()
  }

  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <h1 className="text-2xl font-semibold text-ink mb-8">Create account</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1.5">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className={INPUT}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className={INPUT}
          />
          <p className="text-xs text-muted mt-1">Minimum 8 characters</p>
        </div>

        {error && <p className="text-accent text-sm">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-ink text-white py-2.5 rounded-lg font-medium hover:bg-black transition-colors disabled:opacity-50 text-sm"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p className="text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in →
          </Link>
        </p>
      </form>
    </div>
  )
}
