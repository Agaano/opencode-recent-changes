import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const file = path.join(os.tmpdir(), "recent-changes.log")

export function log(...args: unknown[]): void {
  try {
    const line = args
      .map((value) => {
        if (typeof value === "string") return value
        try {
          return JSON.stringify(value)
        } catch {
          return String(value)
        }
      })
      .join(" ")
    fs.appendFileSync(file, `${new Date().toISOString()} ${line}\n`)
  } catch {
    // Debug logging must never break the plugin.
  }
}

export function logPath(): string {
  return file
}
