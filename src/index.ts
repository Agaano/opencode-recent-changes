import { Plugin } from "@opencode/plugin"
import { Capture } from "./core/capture.ts"
import { log } from "./core/log.ts"
import { RecentChanges } from "./rpc.ts"

export default Plugin.define({
  id: "recent-changes",
  async setup(ctx) {
    const options = (ctx.options ?? {}) as Record<string, unknown>

    let emit: (sessionID: string) => void = () => {}

    const capture = new Capture(
      ctx,
      (sessionID) => emit(sessionID),
      {
        maxFileSize:
          typeof options.maxFileSize === "number" ? options.maxFileSize : undefined,
        contextLines:
          typeof options.contextLines === "number" ? options.contextLines : undefined,
        debug: options.debug === true,
      },
    )

    const registration = await ctx.rpc.register(RecentChanges, {
      timeline: async (input) =>
        capture.timeline((input as { sessionID: string }).sessionID),
      step: async (input) => {
        const { sessionID, step } = input as { sessionID: string; step: number }
        return capture.step(sessionID, step)
      },
      file: async (input) => {
        const { sessionID, step, file } = input as {
          sessionID: string
          step: number
          file: string
        }
        return capture.file(sessionID, step, file)
      },
      revert: async (input) => {
        const { sessionID, step, force, file } = input as {
          sessionID: string
          step: number
          force?: boolean
          file?: string
        }
        return capture.revert(sessionID, step, force === true, file)
      },
      accept: async (input) => {
        const { sessionID, step, file } = input as {
          sessionID: string
          step?: number
          file?: string
        }
        return capture.accept(sessionID, step, file)
      },
      reset: async (input) =>
        capture.reset((input as { sessionID: string }).sessionID),
    })

    emit = (sessionID) => {
      void registration.events.emit("updated", { sessionID })
    }

    await capture.start()

    log("setup", ctx.app.version, ctx.location.directory)

    return async () => {
      await capture.stop()
      await registration.dispose()
    }
  },
})
