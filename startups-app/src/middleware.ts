import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token
    const path = req.nextUrl.pathname

    if (path.startsWith("/admin") && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/login", req.url))
    }

    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname
        if (path.startsWith("/admin")) return token?.role === "ADMIN"
        // /submit-startup and /publish require login
        if (path.startsWith("/submit-startup") || path.startsWith("/publish")) return !!token
        return true
      },
    },
  }
)

export const config = {
  matcher: ["/admin/:path*", "/submit-startup", "/publish/:path*"],
}
