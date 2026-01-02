export const docsetTypes = [
  "apple",
  "docusaurus",
  "mkdocs",
  "sphinx",
  "typedoc",
  "jsdoc",
  "rustdoc",
  "godoc",
  "pdoc",
  "generic",
] as const

export type DocsetType = (typeof docsetTypes)[number]

export interface DocsetRequest {
  baseUrl: string
  path?: string
  docsetType?: DocsetType
}
