import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f7f7f5",
        ink: "#1a1a1a",
        accent: "#d32f2f",
        muted: "#6b7280",
        card: "#ffffff",
      },
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}

export default config
