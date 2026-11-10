import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"
import { Capture } from "../src/core/capture.ts"

function fakeContext(directory: string) {
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
          // No server events in this unit test.
        },
      },
    },
  }
}

function event(file: string, id: string) {
  return {
    tool: "write",
    sessionID: "ses_root",
    agent: "build",
    messageID: "msg_1",
    id,
    input: { filePath: file },
    status: "completed" as const,
  }
}

test("revert restores earlier steps, deletes new files, and keeps history", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rc-revert-"))
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  const { ctx } = fakeContext(directory)
  const capture = new Capture(ctx, () => {})
  await (capture as any).blobs.init()

  const file = path.join(directory, "a.txt")
  const added = path.join(directory, "b.txt")

  const write = async (value: string, id: string) => {
    await (capture as any).onBefore(event(file, id))
    await fs.writeFile(file, value)
    await (capture as any).onAfter(event(file, id))
  }

  await (capture as any).onPrompt({ sessionID: "ses_root", prompt: { text: "one" } })
  await write("one\n", "call_1")

  await (capture as any).onPrompt({ sessionID: "ses_root", prompt: { text: "two" } })
  await write("two\n", "call_2")

  await (capture as any).onPrompt({ sessionID: "ses_root", prompt: { text: "three" } })
  await write("three\n", "call_3")

  await (capture as any).onPrompt({ sessionID: "ses_root", prompt: { text: "four" } })
  await (capture as any).onBefore(event(added, "call_4"))
  await fs.writeFile(added, "new file\n")
  await (capture as any).onAfter(event(added, "call_4"))

  let result = await capture.revert("ses_root", 1)
  assert.equal(result.ok, true)
  assert.deepEqual(result.restored.sort(), ["a.txt", "b.txt"])
  assert.equal(result.step?.kind, "restore")
  assert.equal(result.step?.restoreTo, 1)
  assert.equal(await fs.readFile(file, "utf8"), "one\n")
  await assert.rejects(fs.readFile(added, "utf8"), /ENOENT/)

  result = await capture.revert("ses_root", 0)
  assert.equal(result.ok, true)
  await assert.rejects(fs.readFile(file, "utf8"), /ENOENT/)
  await assert.rejects(fs.readFile(added, "utf8"), /ENOENT/)

  result = await capture.revert("ses_root", 3)
  assert.equal(result.ok, true)
  assert.equal(await fs.readFile(file, "utf8"), "three\n")
  await assert.rejects(fs.readFile(added, "utf8"), /ENOENT/)

  await fs.writeFile(file, "external\n")
  result = await capture.revert("ses_root", 3)
  assert.equal(result.ok, false)
  assert.deepEqual(result.conflicts, ["a.txt"])
  assert.equal(await fs.readFile(file, "utf8"), "external\n")

  result = await capture.revert("ses_root", 3, true)
  assert.equal(result.ok, true)
  assert.equal(await fs.readFile(file, "utf8"), "three\n")

  result = await capture.revert("ses_root", 3)
  assert.equal(result.ok, true)
  assert.deepEqual(result.restored, [])

  const accepted = await capture.accept("ses_root", 2)
  assert.equal(accepted.acceptedStep, 2)
  const timeline = await capture.timeline("ses_root")
  assert.equal(timeline.acceptedStep, 2)
  assert.ok(timeline.steps.some((step) => step.kind === "restore"))
})

test("per-file accept and revert touch only the selected file", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "rc-file-actions-"))
  t.after(async () => {
    await fs.rm(directory, { recursive: true, force: true })
  })

  const { ctx } = fakeContext(directory)
  const capture = new Capture(ctx, () => {})
  await (capture as any).blobs.init()

  const a = path.join(directory, "a.txt")
  const b = path.join(directory, "b.txt")

  await (capture as any).onPrompt({ sessionID: "ses_root", prompt: { text: "one" } })
  await (capture as any).onBefore(event(a, "call_a1"))
  await fs.writeFile(a, "one\n")
  await (capture as any).onAfter(event(a, "call_a1"))

  await (capture as any).onPrompt({ sessionID: "ses_root", prompt: { text: "two" } })
  await (capture as any).onBefore(event(b, "call_b1"))
  await fs.writeFile(b, "bee\n")
  await (capture as any).onAfter(event(b, "call_b1"))

  await (capture as any).onPrompt({ sessionID: "ses_root", prompt: { text: "three" } })
  await (capture as any).onBefore(event(a, "call_a2"))
  await fs.writeFile(a, "two\n")
  await (capture as any).onAfter(event(a, "call_a2"))

  let result = await capture.revert("ses_root", 1, false, "a.txt")
  assert.equal(result.ok, true)
  assert.deepEqual(result.restored, ["a.txt"])
  assert.equal(await fs.readFile(a, "utf8"), "one\n")
  assert.equal(await fs.readFile(b, "utf8"), "bee\n")

  let step = await capture.step("ses_root", 1)
  assert.equal(step.files.find((file) => file.file === "a.txt")?.reviewed, false)

  await capture.accept("ses_root", 1, "a.txt")
  step = await capture.step("ses_root", 1)
  assert.equal(step.files.find((file) => file.file === "a.txt")?.reviewed, true)

  result = await capture.revert("ses_root", 1, false, "b.txt")
  assert.equal(result.ok, true)
  assert.deepEqual(result.restored, ["b.txt"])
  await assert.rejects(fs.readFile(b, "utf8"), /ENOENT/)
  assert.equal(await fs.readFile(a, "utf8"), "one\n")
})
