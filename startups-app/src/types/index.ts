import type { Startup, Category, Tag, User, Content, Role, Status, ContentType } from "@prisma/client"

export type { Role, Status, ContentType }

export type StartupWithRelations = Startup & {
  category: Category
  tags: { tag: Tag }[]
  createdBy: Pick<User, "id" | "email">
  content: ContentSummary[]
}

export type StartupCardData = Pick<
  Startup,
  "id" | "slug" | "title" | "description" | "logoUrl" | "websiteUrl" | "createdAt"
> & {
  category: Pick<Category, "name" | "slug">
  tags: { tag: Pick<Tag, "name" | "slug"> }[]
}

export type ContentWithRelations = Content & {
  author: Pick<User, "id" | "email">
  category: Category | null
  tags: { tag: Tag }[]
  startup: Pick<Startup, "id" | "slug" | "title" | "logoUrl"> | null
}

export type ContentSummary = Pick<
  Content,
  "id" | "slug" | "title" | "excerpt" | "contentType" | "coverImageUrl" | "createdAt"
>

export type ContentCardData = Pick<
  Content,
  "id" | "slug" | "title" | "excerpt" | "contentType" | "coverImageUrl" | "createdAt"
> & {
  author: Pick<User, "email">
  category: Pick<Category, "name" | "slug"> | null
  tags: { tag: Pick<Tag, "name" | "slug"> }[]
}

export interface SubmitStartupPayload {
  title: string
  description: string
  websiteUrl: string
  categoryId: string
  tagIds: string[]
  logoUrl?: string
  screenshots?: string[]
  founderName?: string
  contactEmail?: string
}

export interface SubmitContentPayload {
  title: string
  body: string
  excerpt: string
  contentType: ContentType
  categoryId?: string
  tagIds: string[]
  coverImageUrl?: string
  startupId?: string
}

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
}
