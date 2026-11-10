import crypto from "node:crypto"

export function gitBlobSha1(content: Buffer | string): string {
  const buffer = typeof content === "string" ? Buffer.from(content, "utf8") : content
  const header = Buffer.from(`blob ${buffer.length}\0`, "utf8")
  return crypto.createHash("sha1").update(header).update(buffer).digest("hex")
}

/** Git's C-style path quoting with core.quotePath=true. */
export function quotePath(value: string): string {
  const bytes = Buffer.from(value, "utf8")
  let needsQuotes = false

  for (const byte of bytes) {
    if (byte < 0x20 || byte > 0x7e || byte === 0x22 || byte === 0x5c) {
      needsQuotes = true
      break
    }
  }

  if (!needsQuotes) return value

  let result = '"'
  for (const byte of bytes) {
    switch (byte) {
      case 0x09:
        result += "\\t"
        break
      case 0x0a:
        result += "\\n"
        break
      case 0x0d:
        result += "\\r"
        break
      case 0x22:
        result += '\\"'
        break
      case 0x5c:
        result += "\\\\"
        break
      default:
        if (byte < 0x20 || byte > 0x7e) {
          result += `\\${byte.toString(8).padStart(3, "0")}`
        } else {
          result += String.fromCharCode(byte)
        }
    }
  }

  return `${result}"`
}

export function gitPath(prefix: "a" | "b", value: string): string {
  const quoted = quotePath(value)
  if (quoted.startsWith('"')) {
    return `"${prefix}/${quoted.slice(1)}`
  }
  return `${prefix}/${value}`
}

export function modeString(mode?: number): string {
  return mode !== undefined && (mode & 0o111) !== 0 ? "100755" : "100644"
}
