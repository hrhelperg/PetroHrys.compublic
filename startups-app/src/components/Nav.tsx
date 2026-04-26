"use client"

import Link from "next/link"
import { useSession, signOut } from "next-auth/react"
import { usePathname } from "next/navigation"

export function Nav() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const role = (session?.user as { role?: string })?.role

  const link = (href: string, label: string) => (
    <Link
      href={href}
      className={`text-sm transition-colors ${
        pathname.startsWith(href) ? "text-ink font-medium" : "text-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  )

  return (
    <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-md bg-bg/80 border-b border-black/5 px-4 h-16 flex items-center justify-between">
      <Link href="/startups" className="font-semibold text-ink text-base">
        petrohrys<span className="text-accent">.com</span>
      </Link>

      <div className="flex items-center gap-5">
        {link("/startups", "Startups")}
        {link("/articles", "Articles")}
        {link("/templates", "Templates")}
      </div>

      <div className="flex items-center gap-3">
        {session ? (
          <>
            {role === "ADMIN" && (
              <Link href="/admin" className="text-sm text-muted hover:text-ink transition-colors">
                Admin
              </Link>
            )}
            <Link
              href="/publish"
              className="text-sm text-muted hover:text-ink transition-colors hidden sm:block"
            >
              Publish
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: "/startups" })}
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              Sign out
            </button>
          </>
        ) : (
          <Link href="/login" className="text-sm text-muted hover:text-ink transition-colors">
            Sign in
          </Link>
        )}
        <Link
          href="/submit-startup"
          className="bg-accent text-white px-4 py-1.5 rounded-lg text-sm hover:bg-red-700 transition-colors font-medium"
        >
          Submit
        </Link>
      </div>
    </nav>
  )
}
