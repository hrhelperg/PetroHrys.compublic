const store = new Map<string, { count: number; resetAt: number }>()

const WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_SUBMISSIONS = 5

export function rateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now()
  const entry = store.get(ip)

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true }
  }

  if (entry.count >= MAX_SUBMISSIONS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  entry.count++
  return { allowed: true }
}
