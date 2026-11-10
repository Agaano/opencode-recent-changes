import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { Capture } from "../src/core/capture.ts"

function fakeContext(
  directory: string,
  options: { parents?: Record<string, string> } = {},
) {
  const storage = new Map<string, unknown>()

  return {
    storage,
    ctx: {
      location: { directory },
      options: {},
      app: { version: "test" },
      storage: {
        get: async (key: string) => storage.get(key),
        set: async (key: string, value: unknown) => {
          storage.set(key, value)
        },
        remove: async (key: string) => {
          storage.delete(key)
        },
      },
      session: {
        get: async ({ sessionID }: { sessionID: string }) => ({
          id: sessionID,
          parentID: options.parents?.[sessionID],
          location: { directory },
        }),
        hook: async () => ({ dispose: async () => {} }),
      },
      tool: {
        list: async () => [],
        hook: async () => ({ dispose: async () => {} }),
      },
      event: {
        subscribe: async function* () {
          // No server events in this matrix test.
        },
      },
    },
  }
}

function toolEvent(sessionID: string, file: string, id: string) {
  return {
    tool: "write",
    sessionID,
    agent: "build",
    messageID: "msg_1",
    id,
    input: { filePath: file },
    status: "completed" as const,
  }
}

async function makeCapture(
  directory: string,
  options: { maxFileSize?: number; parents?: Record<string, string> } = {},
) {
  const { ctx } = fakeContext(directory, options)
  const capture = new Capture(ctx, () => {}, {
    maxFileSize: options.maxFileSize,
    debug: false,
  })
  await (capture as any).blobs.init()
  return { capture, ctx }
}

async function writeViaTool(
  capture: Capture,
  sessionID: string,
  file: string,
  content: string | Buffer,
  id: string,
) {
  await (capture as any).onBefore(toolEvent(sessionID, file, id))
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, content)
  await (capture as any).onAfter(toolEvent(sessionID, file, id))
}

async function prompt(capture: Capture, text: string, sessionID = "ses_root") {
  await (capture as any).onPrompt({ sessionID, prompt: { text } })
}

test("non-git folder, Cyrillic path/content, and CRLF", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rc-matrix-cyr-"))
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  const { capture } = await makeCapture(directory)
  const file = path.join(directory, "папка", "привет.txt")

  await prompt(capture, "создать")
  await writeViaTool(capture, "ses_root", file, "привет\r\nмир\r\n", "c1")

  await prompt(capture, "изменить")
  await writeViaTool(capture, "ses_root", file, "привет\r\nМИР\r\n", "c2")

  const step = await capture.step("ses_root", 2)
  assert.equal(step.files[0].status, "modified")

  const diff = await capture.file("ses_root", 2, "папка/привет.txt")
  assert.match(diff.patch, /\r\n/)
  assert.match(diff.patch, /-мир/)
  assert.match(diff.patch, /\+МИР/)

  const reverted = await capture.revert("ses_root", 1)
  assert.equal(reverted.ok, true)
  assert.equal(await fs.readFile(file, "utf8"), "привет\r\nмир\r\n")
  await assert.rejects(fs.access(path.join(directory, ".git")))
})

test("binary files are captured, diffed, and restored", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rc-matrix-bin-"))
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  const { capture } = await makeCapture(directory)
  const file = path.join(directory, "blob.bin")
  const before = Buffer.from([0, 1, 2, 3])
  const after = Buffer.from([0, 4, 5, 6])

  await prompt(capture, "binary")
  await writeViaTool(capture, "ses_root", file, before, "b1")
  await prompt(capture, "binary edit")
  await writeViaTool(capture, "ses_root", file, after, "b2")

  const diff = await capture.file("ses_root", 2, "blob.bin")
  assert.equal(diff.binary, true)
  assert.match(diff.patch, /Binary files/)

  const reverted = await capture.revert("ses_root", 1)
  assert.equal(reverted.ok, true)
  assert.deepEqual(await fs.readFile(file), before)
})

test("oversized files report truncation and missing blobs", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rc-matrix-large-"))
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  const { capture } = await makeCapture(directory, { maxFileSize: 1024 })
  const file = path.join(directory, "large.txt")
  const before = "a".repeat(2048)
  const after = "b".repeat(3072)

  await fs.writeFile(file, before)
  await prompt(capture, "large")
  await writeViaTool(capture, "ses_root", file, after, "l1")

  const diff = await capture.file("ses_root", 1, "large.txt")
  assert.equal(diff.truncated, true)

  const reverted = await capture.revert("ses_root", 0)
  assert.equal(reverted.ok, false)
  assert.equal(reverted.error, "missing_blob")
})

test("fifty files in one step and a full revert", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rc-matrix-50-"))
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  const { capture } = await makeCapture(directory)
  await prompt(capture, "fifty files")

  for (let index = 0; index < 50; index++) {
    const file = path.join(directory, `file-${index}.txt`)
    await writeViaTool(capture, "ses_root", file, `content ${index}\n`, `c${index}`)
  }

  const step = await capture.step("ses_root", 1)
  assert.equal(step.files.length, 50)

  const reverted = await capture.revert("ses_root", 0)
  assert.equal(reverted.ok, true)
  assert.equal(reverted.restored.length, 50)

  for (let index = 0; index < 50; index++) {
    await assert.rejects(fs.access(path.join(directory, `file-${index}.txt`)))
  }
})

test("twenty steps and revert to the fifth", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rc-matrix-steps-"))
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  const { capture } = await makeCapture(directory)
  const file = path.join(directory, "counter.txt")

  for (let index = 1; index <= 20; index++) {
    await prompt(capture, `step ${index}`)
    await writeViaTool(capture, "ses_root", file, `value ${index}\n`, `s${index}`)
  }

  const reverted = await capture.revert("ses_root", 5)
  assert.equal(reverted.ok, true)
  assert.equal(reverted.step?.kind, "restore")
  assert.equal(reverted.step?.restoreTo, 5)
  assert.equal(await fs.readFile(file, "utf8"), "value 5\n")

  const timeline = await capture.timeline("ses_root")
  assert.ok(timeline.steps.some((step) => step.kind === "restore"))
})

test("subagent changes aggregate into the root timeline and survive reload", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rc-matrix-sub-"))
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  const { capture, ctx } = await makeCapture(directory, {
    parents: { ses_child: "ses_root" },
  })
  const file = path.join(directory, "child.txt")

  await prompt(capture, "root request")
  await writeViaTool(capture, "ses_child", file, "from child\n", "child-1")

  const timeline = await capture.timeline("ses_root")
  assert.equal(timeline.steps.length, 1)
  assert.equal(timeline.steps[0].files, 1)

  const reloaded = new Capture(ctx, () => {})
  await (reloaded as any).blobs.init()
  const afterReload = await reloaded.timeline("ses_root")
  assert.equal(afterReload.steps.length, 1)
  assert.equal(afterReload.steps[0].files, 1)
})
