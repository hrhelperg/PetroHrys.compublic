import type { ContentType } from "@prisma/client"

export const CONTENT_TYPE_LABEL: Record<ContentType, string> = {
  ARTICLE: "Article",
  CASE_STUDY: "Case Study",
  GUIDE: "Guide",
  TEMPLATE: "Template",
}

export const CONTENT_TYPE_ROUTE: Record<ContentType, string> = {
  ARTICLE: "/articles",
  CASE_STUDY: "/articles",
  GUIDE: "/articles",
  TEMPLATE: "/templates",
}
