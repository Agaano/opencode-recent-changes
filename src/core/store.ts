import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { sha256 } from "./paths.ts"
import type { SessionTimeline } from "./timeline.ts"

export function defaultCacheRoot(): string {
  const local = process.env.LOCALAPPDATA
  if (local) return path.join(local, "opencode", "cache", "recent-changes")
  return path.join(os.homedir(), ".cache", "opencode", "recent-changes")
}

export class BlobStore {
  private readonly blobsDir: string
  private readonly tmpDir: string
  private readonly maxFileSize: number

  constructor(root: string, maxFileSize: number) {
    this.blobsDir = path.join(root, "blobs")
    this.tmpDir = path.join(root, "tmp")
    this.maxFileSize = maxFileSize
  }

  async init(): Promise<void> {
    await fs.mkdir(this.blobsDir, { recursive: true })
    await fs.mkdir(this.tmpDir, { recursive: true })
  }

  async put(content: Buffer): Promise<{ hash: string; stored: boolean }> {
    const hash = sha256(content)
    if (content.length > this.maxFileSize) return { hash, stored: false }

    const target = path.join(this.blobsDir, hash)
    try {
      await fs.access(target)
      return { hash, stored: true }
    } catch {
      // Not stored yet.
    }

    const temporary = path.join(this.tmpDir, `${hash}-${process.pid}-${Date.now()}`)
    await fs.writeFile(temporary, content)
    await fs.rename(temporary, target)
    return { hash, stored: true }
  }

  async get(hash: string | undefined): Promise<Buffer | undefined> {
    if (!hash) return undefined
    try {
      return await fs.readFile(path.join(this.blobsDir, hash))
    } catch {
      return undefined
    }
  }

  async has(hash: string | undefined): Promise<boolean> {
    if (!hash) return false
    try {
      await fs.access(path.join(this.blobsDir, hash))
      return true
    } catch {
      return false
    }
  }

  async remove(hash: string | undefined): Promise<void> {
    if (!hash) return
    try {
      await fs.unlink(path.join(this.blobsDir, hash))
    } catch {
      // Already gone.
    }
  }
}

export class TimelineStore {
  private readonly ctx: any
  private readonly blobs: BlobStore

  constructor(ctx: any, blobs: BlobStore) {
    this.ctx = ctx
    this.blobs = blobs
  }

  get blobStore(): BlobStore {
    return this.blobs
  }

  private key(sessionID: string): string {
    return `timeline/${sessionID}`
  }

  async load(sessionID: string): Promise<SessionTimeline | undefined> {
    const value = await this.ctx.storage.get(this.key(sessionID))
    if (!value || typeof value !== "object") return undefined
    return value as SessionTimeline
  }

  async save(timeline: SessionTimeline): Promise<void> {
    await this.ctx.storage.set(this.key(timeline.sessionID), timeline)
  }

  async remove(sessionID: string): Promise<void> {
    await this.ctx.storage.remove(this.key(sessionID))
  }
}

/** Serializes async work per key, so two tool calls never race on one timeline. */
export class KeyedQueue {
  private readonly chains = new Map<string, Promise<unknown>>()

  run<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.chains.get(key) ?? Promise.resolve()
    const next = previous.then(work, work)
    this.chains.set(
      key,
      next.then(
        () => undefined,
        () => undefined,
      ),
    )
    return next
  }
}
