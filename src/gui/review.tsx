import { Show, createEffect, createResource, createSignal, onCleanup, onMount } from "solid-js"
import { Portal } from "solid-js/web"
import { usePlugin, type MountedSession } from "@opencode/plugin/gui"
import {
  RecentChanges,
  type AcceptResult,
  type FileResult,
  type RevertResult,
  type StepResult,
  type TimelineResult,
} from "../rpc.ts"
import { DiffView } from "./diff.tsx"
import { FileList } from "./files.tsx"
import { StepTimeline } from "./steps.tsx"

type NarrowView = "steps" | "files" | "diff"

export function openReviewDialog(ctx: any, session: MountedSession) {
  ctx.dialogs.open((dialog: any) => <ReviewDialog session={session} dialog={dialog} />)
}

function ReviewDialog(props: { session: MountedSession; dialog: any }) {
  const ctx = usePlugin()
  const [expanded, setExpanded] = createSignal(false)

  return (
    <Show
      when={expanded()}
      fallback={
        <ctx.ui.Dialog
          title="Review changes"
          size="large"
          footer={
            <div class="rc-dialog-actions">
              <ctx.ui.Button
                variant="neutral"
                icon="expand"
                onClick={() => setExpanded(true)}
              >
                Expand
              </ctx.ui.Button>
              <ctx.ui.Button variant="contrast" onClick={() => props.dialog.close()}>
                Close
              </ctx.ui.Button>
            </div>
          }
        >
          <div class="rc-dialog-body">
            <ReviewPanel
              session={props.session}
              embedded
              onExpand={() => setExpanded(true)}
            />
          </div>
        </ctx.ui.Dialog>
      }
    >
      <Portal>
        <div class="rc-fullscreen">
          <div class="rc-fullscreen-header">
            <span class="rc-title">Review changes</span>
            <button
              type="button"
              class="rc-action"
              onClick={() => setExpanded(false)}
            >
              Collapse
            </button>
            <button
              type="button"
              class="rc-action"
              onClick={() => props.dialog.close()}
            >
              Close
            </button>
            <span class="rc-muted">{props.session.directory}</span>
            <span class="rc-spacer" />
          </div>
          <div class="rc-fullscreen-body">
            <ReviewPanel
              session={props.session}
              embedded
              onCollapse={() => setExpanded(false)}
            />
          </div>
        </div>
      </Portal>
    </Show>
  )
}

export function ReviewPanel(props: {
  session: MountedSession
  embedded?: boolean
  onExpand?: () => void
  onCollapse?: () => void
}) {
  const ctx = usePlugin()

  const [selectedStep, setSelectedStep] = createSignal<number | undefined>()
  const [selectedFile, setSelectedFile] = createSignal<string | undefined>()
  const [narrow, setNarrow] = createSignal(false)
  const [view, setView] = createSignal<NarrowView>("steps")

  let root: HTMLDivElement | undefined
  let refreshTimer: ReturnType<typeof setTimeout> | undefined

  const [timeline, { refetch: refetchTimeline }] = createResource(
    () => props.session.id,
    async (sessionID): Promise<TimelineResult> => {
      const result = await ctx.client.rpc(RecentChanges).timeline({ sessionID })
      return result as TimelineResult
    },
  )

  const [step, { refetch: refetchStep }] = createResource(
    () => selectedStep() ?? -1,
    async (stepIndex): Promise<StepResult | undefined> => {
      if (stepIndex < 0) return undefined
      const result = await ctx.client.rpc(RecentChanges).step({
        sessionID: props.session.id,
        step: stepIndex,
      })
      return result as StepResult
    },
  )

  const [file, { refetch: refetchFile }] = createResource(
    () => selectedFile() ?? "",
    async (path): Promise<FileResult | undefined> => {
      const stepIndex = selectedStep()
      if (!path || stepIndex === undefined) return undefined
      const result = await ctx.client.rpc(RecentChanges).file({
        sessionID: props.session.id,
        step: stepIndex,
        file: path,
      })
      return result as FileResult
    },
  )

  createEffect(() => {
    props.session.id
    setSelectedStep(undefined)
    setSelectedFile(undefined)
    setView("steps")
  })

  createEffect(() => {
    const data = timeline()
    if (!data) return

    const steps = data.steps
    if (steps.length === 0) {
      setSelectedStep(undefined)
      setSelectedFile(undefined)
      return
    }

    const current = selectedStep()
    if (current === undefined || !steps.some((candidate) => candidate.index === current)) {
      setSelectedStep(steps[steps.length - 1].index)
    }
  })

  createEffect(() => {
    const data = step()
    if (!data) return

    const files = data.files
    const current = selectedFile()
    if (files.length === 0) {
      setSelectedFile(undefined)
      return
    }

    if (!current || !files.some((candidate) => candidate.file === current)) {
      setSelectedFile(files[0].file)
    }
  })

  const refresh = () => {
    void refetchTimeline()
    if (selectedStep() !== undefined) void refetchStep()
    if (selectedFile()) void refetchFile()
  }

  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer)
    refreshTimer = setTimeout(refresh, 150)
  }

  const chooseStep = (index: number) => {
    setSelectedStep(index)
    setSelectedFile(undefined)
    if (narrow()) setView("files")
  }

  const chooseFile = (path: string) => {
    setSelectedFile(path)
    if (narrow()) setView("diff")
  }

  const copyPatch = () => {
    const data = file()
    if (!data?.patch) return
    void ctx.system
      .copy(data.patch)
      .then(() => ctx.toast.show({ title: "Patch copied", variant: "success" }))
      .catch(() => ctx.toast.show({ title: "Could not copy the patch", variant: "error" }))
  }

  const acceptStep = async () => {
    const stepIndex = selectedStep()
    if (stepIndex === undefined) return

    try {
      const result = (await ctx.client.rpc(RecentChanges).accept({
        sessionID: props.session.id,
        step: stepIndex,
      })) as AcceptResult
      ctx.toast.show({
        title: `Marked as reviewed up to #${result.acceptedStep}`,
        variant: "success",
      })
      void refetchTimeline()
    } catch {
      ctx.toast.show({ title: "Could not mark the step as reviewed", variant: "error" })
    }
  }

  const restoreStep = async (force = false, file?: string) => {
    const stepIndex = selectedStep()
    if (stepIndex === undefined) return

    if (!force) {
      const ok = await ctx.dialogs.confirm({
        title: file
          ? `Restore ${file} to step #${stepIndex}?`
          : `Restore to step #${stepIndex}?`,
        description: file
          ? "This file will be overwritten with its content at the selected step."
          : "Files changed after this step will be overwritten. The history is kept as a restore step.",
        confirm: "Restore",
        cancel: "Cancel",
        danger: true,
      })
      if (!ok) return
    }

    try {
      const result = (await ctx.client.rpc(RecentChanges).revert({
        sessionID: props.session.id,
        step: stepIndex,
        force,
        file,
      })) as RevertResult

      if (!result.ok) {
        if (result.error === "busy") {
          await ctx.dialogs.alert({
            title: "The agent is running",
            description: "Wait for the current request to finish, then restore.",
          })
          return
        }

        if (result.error === "missing_blob") {
          await ctx.dialogs.alert({
            title: "Cannot restore",
            description: `Stored content is missing for: ${result.conflicts.join(", ")}`,
          })
          return
        }

        if (result.conflicts.length > 0 && !force) {
          const overwrite = await ctx.dialogs.confirm({
            title: "Files changed on disk",
            description: `These files changed outside the plugin:\n${result.conflicts.join(
              "\n",
            )}\n\nOverwrite them?`,
            confirm: "Overwrite",
            danger: true,
          })
          if (overwrite) await restoreStep(true, file)
          return
        }

        await ctx.dialogs.alert({
          title: "Restore failed",
          description: result.error ?? "Unknown error",
        })
        return
      }

      ctx.toast.show({
        title:
          result.restored.length > 0
            ? `Restored ${result.restored.length} ${
                result.restored.length === 1 ? "file" : "files"
              }`
            : "Already at this state",
        variant: "success",
      })

      if (result.step) setSelectedStep(result.step.index)
      if (file) setSelectedFile(file)
      else setSelectedFile(undefined)

      void refetchTimeline()
      if (selectedStep() !== undefined) void refetchStep()
      if (selectedFile()) void refetchFile()
    } catch {
      ctx.toast.show({ title: "Restore failed", variant: "error" })
    }
  }

  const acceptFile = async (file: string) => {
    const stepIndex = selectedStep()
    if (stepIndex === undefined) return

    try {
      await ctx.client.rpc(RecentChanges).accept({
        sessionID: props.session.id,
        step: stepIndex,
        file,
      })
      ctx.toast.show({ title: `Marked ${file} as reviewed`, variant: "success" })
      void refetchStep()
      void refetchTimeline()
    } catch {
      ctx.toast.show({ title: `Could not mark ${file} as reviewed`, variant: "error" })
    }
  }

  const acceptSelectedFile = () => {
    const path = selectedFile()
    if (path) void acceptFile(path)
  }

  const restoreSelectedFile = () => {
    const path = selectedFile()
    if (path) void restoreStep(false, path)
  }

  const refreshSelectedFile = () => {
    if (selectedFile()) void refetchFile()
  }

  const openDialog = () => {
    openReviewDialog(ctx, props.session)
  }

  onMount(() => {
    const rpc = ctx.client.rpc(RecentChanges)
    const unsubscribe = rpc.events.on("updated", (event) => {
      const sessionID = (event.data as { sessionID?: string } | undefined)?.sessionID
      if (!sessionID || sessionID === props.session.id) scheduleRefresh()
    })

    const observer = root
      ? new ResizeObserver((entries) => {
          const width = entries[0]?.contentRect.width ?? 0
          setNarrow(width < 760)
        })
      : undefined
    if (root && observer) observer.observe(root)

    onCleanup(() => {
      unsubscribe()
      observer?.disconnect()
      if (refreshTimer) clearTimeout(refreshTimer)
    })
  })

  return (
    <div
      class="rc-panel"
      classList={{ "rc-narrow": narrow() }}
      ref={(element) => {
        root = element
      }}
    >
      <Show
        when={!narrow() || props.embedded}
        fallback={
          <div class="rc-compact">
            <button type="button" class="rc-compact-open" onClick={openDialog}>
              Review
            </button>
            <span class="rc-compact-count">{timeline()?.steps.length ?? 0}</span>
          </div>
        }
      >
      <header class="rc-header">
        <Show when={!props.embedded}>
          <span class="rc-title">Review changes</span>
        </Show>
        <Show when={props.onExpand}>
          <button type="button" class="rc-action" onClick={() => props.onExpand?.()}>
            Expand
          </button>
        </Show>
        <Show when={props.onCollapse}>
          <button type="button" class="rc-action" onClick={() => props.onCollapse?.()}>
            Collapse
          </button>
        </Show>
        <button
          type="button"
          class="rc-action"
          disabled={selectedStep() === undefined}
          onClick={() => void acceptStep()}
        >
          Accept
        </button>
        <button
          type="button"
          class="rc-action"
          disabled={selectedStep() === undefined}
          onClick={() => void restoreStep()}
        >
          Restore
        </button>
        <button type="button" class="rc-action" onClick={refresh}>
          Refresh
        </button>
        <span class="rc-muted">{props.session.directory}</span>
        <span class="rc-spacer" />
        <span class="rc-totals">
          <span class="rc-add">+{timeline()?.totals.additions ?? 0}</span>{" "}
          <span class="rc-del">−{timeline()?.totals.deletions ?? 0}</span>
        </span>
      </header>

      <Show when={!timeline.loading} fallback={<div class="rc-empty">Loading…</div>}>
        <Show
          when={!timeline.error}
          fallback={<div class="rc-error">Failed to load the change timeline.</div>}
        >
          <Show
            when={(timeline()?.steps.length ?? 0) > 0}
            fallback={
              <div class="rc-empty">
                No changes yet. Send a request and its step will appear here.
              </div>
            }
          >
            <Show
              when={!narrow()}
              fallback={
                <div class="rc-narrow-body">
                  <Show when={view() === "steps"}>
                    <StepTimeline
                      steps={timeline()?.steps ?? []}
                      selected={selectedStep()}
                      acceptedStep={timeline()?.acceptedStep}
                      onSelect={chooseStep}
                    />
                  </Show>

                  <Show when={view() === "files"}>
                    <div class="rc-narrow-head">
                      <button type="button" class="rc-back" onClick={() => setView("steps")}>
                        ← Steps
                      </button>
                      <span class="rc-muted">Step #{selectedStep()}</span>
                    </div>
                    <div class="rc-scroll">
                      <FileList
                        files={step()?.files ?? []}
                        selected={selectedFile()}
                        onSelect={chooseFile}
                        onAccept={(path) => void acceptFile(path)}
                        onRestore={(path) => void restoreStep(false, path)}
                      />
                    </div>
                  </Show>

                  <Show when={view() === "diff"}>
                    <div class="rc-narrow-head">
                      <button type="button" class="rc-back" onClick={() => setView("files")}>
                        ← Files
                      </button>
                      <span class="rc-muted">{selectedFile()}</span>
                    </div>
                    <Show
                      when={file()}
                      fallback={<div class="rc-empty">Loading diff…</div>}
                    >
                      {(data) => (
                        <DiffView
                          file={selectedFile() ?? ""}
                          result={data()}
                          onCopy={copyPatch}
                          onAccept={acceptSelectedFile}
                          onRestore={restoreSelectedFile}
                          onRefresh={refreshSelectedFile}
                        />
                      )}
                    </Show>
                  </Show>
                </div>
              }
            >
              <div class="rc-layout">
                <aside class="rc-sidebar">
                  <section class="rc-section rc-section-steps">
                    <div class="rc-section-title">Steps</div>
                    <div class="rc-scroll">
                      <StepTimeline
                        steps={timeline()?.steps ?? []}
                        selected={selectedStep()}
                        acceptedStep={timeline()?.acceptedStep}
                        onSelect={chooseStep}
                      />
                    </div>
                  </section>

                  <section class="rc-section rc-section-files">
                    <div class="rc-section-title">
                      Files{" "}
                      <span class="rc-muted">{step()?.files.length ?? 0}</span>
                    </div>
                    <div class="rc-scroll">
                      <Show
                        when={!step.loading}
                        fallback={<div class="rc-empty">Loading files…</div>}
                      >
                        <Show
                          when={(step()?.files.length ?? 0) > 0}
                          fallback={<div class="rc-empty">No files in this step.</div>}
                        >
                          <FileList
                            files={step()?.files ?? []}
                            selected={selectedFile()}
                            onSelect={chooseFile}
                            onAccept={(path) => void acceptFile(path)}
                            onRestore={(path) => void restoreStep(false, path)}
                          />
                        </Show>
                      </Show>
                    </div>
                  </section>
                </aside>

                <main class="rc-main">
                  <Show
                    when={selectedFile()}
                    fallback={<div class="rc-empty">Select a file to see the diff.</div>}
                  >
                    <Show
                      when={!file.loading}
                      fallback={<div class="rc-empty">Loading diff…</div>}
                    >
                      <Show
                        when={!file.error}
                        fallback={<div class="rc-error">Failed to load the diff.</div>}
                      >
                        <Show when={file()}>
                          {(data) => (
                            <DiffView
                              file={selectedFile() ?? ""}
                              result={data()}
                              onCopy={copyPatch}
                            />
                          )}
                        </Show>
                      </Show>
                    </Show>
                  </Show>
                </main>
              </div>
            </Show>
          </Show>
        </Show>
      </Show>

      <footer class="rc-footer">
        <span>
          Step #{selectedStep() ?? "—"} · {step()?.files.length ?? 0} files · reviewed up
          to #{timeline()?.acceptedStep ?? 0}
        </span>
      </footer>
      </Show>
    </div>
  )
}
