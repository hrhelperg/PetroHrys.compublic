import { Suspense } from "react"
import type { Metadata } from "next"
import { LoginForm } from "./LoginForm"

export const metadata: Metadata = {
  title: "Sign In",
  robots: { index: false },
}

export default function LoginPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-20">
      <h1 className="text-2xl font-semibold text-ink mb-8">Sign in</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  )
}
