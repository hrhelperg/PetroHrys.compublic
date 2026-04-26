import "next-auth"
import type { Role } from "@prisma/client"

declare module "next-auth" {
  interface User {
    role: Role
  }
  interface Session {
    user: {
      id: string
      email: string
      role: Role
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role: Role
  }
}
