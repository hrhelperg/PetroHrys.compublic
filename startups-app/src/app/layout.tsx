import type { Metadata } from "next"
import "./globals.css"
import { Nav } from "@/components/Nav"
import { Providers } from "@/components/Providers"

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? "https://petrohrys.com"),
  title: {
    default: "Startup Directory & Articles – petrohrys.com",
    template: "%s | petrohrys.com",
  },
  description:
    "Discover indie startups, read founder articles, guides, and case studies. Submit your startup for free.",
  openGraph: {
    siteName: "petrohrys.com",
    type: "website",
    locale: "en_US",
  },
  twitter: { card: "summary_large_image", site: "@petrohrys" },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans bg-bg text-ink min-h-screen flex flex-col">
        <Providers>
          <Nav />
          <main className="flex-1 pt-16">{children}</main>
          <footer className="border-t border-black/5 py-8 text-center text-sm text-muted mt-auto">
            <p>
              © {new Date().getFullYear()} petrohrys.com ·{" "}
              <a
                href="https://petrohrys.com"
                className="hover:text-ink transition-colors"
              >
                Back to main site
              </a>
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  )
}
