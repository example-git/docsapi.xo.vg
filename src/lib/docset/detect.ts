import type { DocsetType } from "./types"

const generatorRegex = /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["'][^>]*>/i

function getGenerator(html: string): string {
  const match = html.match(generatorRegex)
  return match?.[1]?.toLowerCase() ?? ""
}

function hasAny(html: string, needles: string[]): boolean {
  return needles.some((needle) => html.includes(needle))
}

function isAppleHost(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.hostname.endsWith("developer.apple.com") || parsed.hostname === "sosumi.ai"
  } catch {
    return false
  }
}

export function detectDocsetType(html: string, url: string): DocsetType {
  const generator = getGenerator(html)
  const lowerUrl = url.toLowerCase()

  if (isAppleHost(url)) {
    return "apple"
  }

  if (generator.includes("docusaurus") || hasAny(html, ['id="__docusaurus"', "data-docusaurus"])) {
    return "docusaurus"
  }

  if (generator.includes("mkdocs") || hasAny(html, ["md-content", "data-md-color-scheme"])) {
    return "mkdocs"
  }

  if (generator.includes("sphinx") || hasAny(html, ["sphinxsidebar", "wy-nav-side"])) {
    return "sphinx"
  }

  if (generator.includes("typedoc") || hasAny(html, ["tsd-kind", "tsd-page-title"])) {
    return "typedoc"
  }

  if (generator.includes("jsdoc") || hasAny(html, ["jsdoc", "class=\"page\" id=\"main\""])) {
    return "jsdoc"
  }

  if (generator.includes("rustdoc") || hasAny(html, ["rustdoc", "rustdoc-search"])) {
    return "rustdoc"
  }

  if (lowerUrl.includes("pkg.go.dev") || lowerUrl.includes("godoc.org") || hasAny(html, ["pkg-overview"])) {
    return "godoc"
  }

  if (generator.includes("pdoc") || hasAny(html, ["pdoc", "module-list"])) {
    return "pdoc"
  }

  return "generic"
}
