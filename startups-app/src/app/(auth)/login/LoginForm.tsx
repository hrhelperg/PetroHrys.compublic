"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"

const INPUT = "w-full px-3 py-2.5 rounded-lg border border-black/10 bg-white text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-colors text-sm"

export function LoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get("next") ?? "/startups"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError("")

    const result = await signIn("credentials", { email, password, redirect: false })

    if (result?.error) {
      setError("Invalid email or password")
      setLoading(false)
    } else {
      router.push(next)
      router.refresh()
    }
  }

  return (
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
          autoComplete="current-password"
          className={INPUT}
        />
      </div>

      {error && <p className="text-accent text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-ink text-white py-2.5 rounded-lg font-medium hover:bg-black transition-colors disabled:opacity-50 text-sm"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>

      <p className="text-center text-sm text-muted">
        No account?{" "}
        <Link href="/register" className="text-accent hover:underline">
          Create one →
        </Link>
      </p>
    </form>
  )
}
