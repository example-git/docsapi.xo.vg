import { parseHTML } from "linkedom"
import TurndownService from "turndown"
import { gfm } from "turndown-plugin-gfm"

const turndownService = new TurndownService({
  codeBlockStyle: "fenced",
  headingStyle: "atx",
})

turndownService.use(gfm)

turndownService.addRule("stripEmptyLinks", {
  filter: (node) => node.nodeName === "A" && !(node as HTMLAnchorElement).textContent?.trim(),
  replacement: () => "",
})

export function htmlToMarkdown(html: string): string {
  const cleaned = html.replace(/\u00a0/g, " ").trim()
  if (!cleaned) {
    return ""
  }

  const { document } = parseHTML("<!doctype html><html><body></body></html>")
  const container = document.createElement("div")
  container.innerHTML = cleaned
  return turndownService.turndown(container).trim()
}
