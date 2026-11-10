import crypto from "node:crypto"
import path from "node:path"

const IGNORED_SEGMENTS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".turbo",
  ".cache",
  "coverage",
])

export function toPosix(value: string): string {
  return value.replace(/\\/g, "/")
}

export function sha256(value: Buffer | string): string {
  return crypto.createHash("sha256").update(value).digest("hex")
}

/** Absolute path if `value` resolves inside `root`, otherwise undefined. */
export function resolveInside(root: string, value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed || trimmed.includes("\n")) return undefined
  if (/^(https?:|data:|file:)/i.test(trimmed)) return undefined

  const absolute = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(root, trimmed)

  const relative = path.relative(root, absolute)
  if (relative === "") return absolute
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined
  return absolute
}

export function relPosix(root: string, absolute: string): string | undefined {
  const relative = path.relative(root, absolute)
  if (relative === "") return undefined
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined
  return toPosix(relative)
}

export function isIgnored(relative: string): boolean {
  const parts = relative.split("/")
  if (parts.some((part) => IGNORED_SEGMENTS.has(part))) return true
  if (relative.endsWith(".lock")) return true
  if (relative.endsWith(".log")) return true
  return false
}

export function looksLikePath(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 4096) return false
  if (trimmed.includes("\n") || trimmed.includes("\0")) return false
  if (/^(https?:|data:|file:|mailto:)/i.test(trimmed)) return false
  if (trimmed.startsWith("-")) return false
  return true
}
