import { fetchWithRateLimit, getRandomUserAgent } from "../fetch"
import type { DocsetType } from "./types"

const searchIndexPaths = [
  "search/search_index.json",
  "searchindex.json",
  "search.json",
  "search-index.json",
  "searchindex.js",
]

function normalizeInputUrl(input: string): URL {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error("baseUrl is required")
  }
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  const parsed = new URL(withScheme)
  parsed.hash = ""
  parsed.search = ""

  if (parsed.pathname.endsWith("/index.html")) {
    parsed.pathname = parsed.pathname.slice(0, -"/index.html".length) || "/"
  }

  return parsed
}

function ensureTrailingSlash(url: URL): URL {
  const looksLikeFile = /\.[a-z0-9]+$/i.test(url.pathname)
  if (!looksLikeFile && !url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`
  }
  return url
}

function dedupePreserveOrder(values: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function guessVersionedDocsRootPath(pathname: string): string | null {
  const match = pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)\/([^/]+)\//i)
  if (!match) return null

  const lang = match[1]
  const version = match[2]
  const versionLower = version.toLowerCase()
  const knownVersions = new Set(["latest", "stable", "dev", "master", "main", "default", "current"])
  const looksLikeVersion =
    knownVersions.has(versionLower) || /^v?\d/i.test(versionLower) || /^\d+\.\d+/.test(versionLower)

  if (!looksLikeVersion) return null
  return `/${lang}/${version}/`
}

function buildSearchBaseCandidates(baseUrl: string): string[] {
  const parsed = normalizeInputUrl(baseUrl)

  const originRoot = new URL("/", parsed.origin).toString()
  const currentDir = ensureTrailingSlash(new URL(parsed.toString())).toString()

  const candidates: string[] = []

  const versionedRootPath = guessVersionedDocsRootPath(parsed.pathname)
  if (versionedRootPath) {
    candidates.push(new URL(versionedRootPath, parsed.origin).toString())
  }

  const segments = parsed.pathname.split("/").filter(Boolean)
  if (segments.length > 0) {
    candidates.push(new URL(`/${segments[0]}/`, parsed.origin).toString())
  }

  candidates.push(currentDir)
  candidates.push(originRoot)

  return dedupePreserveOrder(candidates)
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

function toAbsoluteUrl(baseUrl: string, href: string): string {
  try {
    return new URL(href, baseUrl).toString()
  } catch {
    return href
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetchWithRateLimit(url, {
    headers: {
      "User-Agent": getRandomUserAgent(),
      Accept: "application/json, text/plain, text/html",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch search index: ${response.status} ${response.statusText}`)
  }

  return await response.text()
}

function parseMkDocsIndex(raw: string, baseUrl: string, query: string) {
  const data = JSON.parse(raw) as {
    docs?: Array<{ title?: string; text?: string; location?: string }>
  }
  const docs = data.docs ?? []
  return docs
    .filter((doc) => {
      const title = doc.title?.toLowerCase() ?? ""
      const text = doc.text?.toLowerCase() ?? ""
      return title.includes(query) || text.includes(query)
    })
    .map((doc) => ({
      title: doc.title ?? "Untitled",
      url: doc.location ? toAbsoluteUrl(baseUrl, doc.location) : baseUrl,
      snippet: doc.text?.slice(0, 200) ?? "",
      source: "mkdocs",
    }))
}

function tokenizeQuery(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9_-]+/g)
    .map((token) => token.trim())
    .filter(Boolean)
}

function extractSphinxDocIds(value: unknown): number[] {
  if (typeof value === "number") return [value]
  if (!Array.isArray(value)) return []

  const ids: number[] = []
  for (const entry of value) {
    if (typeof entry === "number") {
      ids.push(entry)
      continue
    }
    if (Array.isArray(entry) && typeof entry[0] === "number") {
      ids.push(entry[0])
    }
  }
  return ids
}

function parseSphinxIndex(raw: string, baseUrl: string, query: string) {
  const match =
    raw.match(/Search\.setIndex\((\{[\s\S]*\})\);/) ?? raw.match(/var\s+index\s*=\s*(\{[\s\S]*\});/)
  if (!match) return []

  const json = match[1]
  const data = JSON.parse(json) as {
    docnames?: string[]
    titles?: string[]
    filenames?: string[]
    terms?: Record<string, unknown>
  }

  const docnames = data.docnames ?? []
  const titles = data.titles ?? []
  const filenames = data.filenames ?? []
  const terms = data.terms ?? {}

  const tokens = tokenizeQuery(query)
  const scores = new Map<number, number>()

  for (const token of tokens) {
    const value = terms[token]
    const docIds = extractSphinxDocIds(value)
    for (const docId of docIds) {
      scores.set(docId, (scores.get(docId) ?? 0) + 2)
    }
  }

  for (const [index, title] of titles.entries()) {
    const titleLower = title?.toLowerCase() ?? ""
    const docnameLower = docnames[index]?.toLowerCase() ?? ""
    if (titleLower.includes(query) || docnameLower.includes(query)) {
      scores.set(index, (scores.get(index) ?? 0) + 3)
    }
  }

  const ranked = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)

  return ranked
    .map(([index]) => {
      const filename = filenames[index] ?? (docnames[index] ? `${docnames[index]}.html` : "")
      const url = filename ? toAbsoluteUrl(baseUrl, filename) : baseUrl
      const title = titles[index] ?? docnames[index] ?? url
      return { title, url, snippet: "", source: "sphinx" }
    })
    .filter((entry) => Boolean(entry.title) && Boolean(entry.url))
}

function parseSitemap(raw: string, baseUrl: string, query: string) {
  const matches = Array.from(raw.matchAll(/<loc>([^<]+)<\/loc>/gi))
  return matches
    .map((match) => match[1])
    .filter((loc) => loc.toLowerCase().includes(query))
    .map((loc) => ({
      title: loc.split("/").pop() || loc,
      url: toAbsoluteUrl(baseUrl, loc),
      snippet: "",
      source: "sitemap",
    }))
}

export async function searchDocumentation(
  baseUrl: string,
  query: string,
  docsetType?: DocsetType,
): Promise<
  Array<{
    title: string
    url: string
    snippet: string
    source: string
  }>
> {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) {
    return []
  }

  const bases = buildSearchBaseCandidates(baseUrl)
  const pathsToTry =
    docsetType === "mkdocs"
      ? searchIndexPaths.filter((path) => path.endsWith(".json"))
      : docsetType === "sphinx"
        ? searchIndexPaths.filter((path) => path.endsWith(".js"))
        : searchIndexPaths

  for (const base of bases) {
    for (const path of pathsToTry) {
      try {
        const indexUrl = toAbsoluteUrl(base, path)
        const raw = await fetchText(indexUrl)
        if (path.endsWith(".json") && (docsetType === "mkdocs" || docsetType === undefined)) {
          const results = parseMkDocsIndex(raw, base, normalizedQuery)
          if (results.length) {
            return results
          }
        }
        if (path.endsWith(".js") && (docsetType === "sphinx" || docsetType === undefined)) {
          const results = parseSphinxIndex(raw, base, normalizedQuery)
          if (results.length) {
            return results
          }
        }
      } catch {}
    }
  }

  try {
    for (const base of bases) {
      const sitemap = await fetchText(toAbsoluteUrl(base, "sitemap.xml"))
      const results = parseSitemap(sitemap, base, normalizedQuery)
      if (results.length) {
        return results
      }
    }
  } catch {
    return []
  }

  return []
}
