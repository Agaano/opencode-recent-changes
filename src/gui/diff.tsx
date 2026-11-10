import { For, Show } from "solid-js"
import type { FileResult } from "../rpc.ts"
import { parsePatch } from "./parse.ts"

function statusLetter(status: FileResult["status"]): string {
  if (status === "added") return "A"
  if (status === "deleted") return "D"
  return "M"
}

export function DiffView(props: {
  file: string
  result: FileResult
  onCopy: () => void
  onAccept?: () => void
  onRestore?: () => void
  onRefresh?: () => void
}) {
  const parsed = () => parsePatch(props.result.patch)

  return (
    <div class="rc-diff">
      <div class="rc-diff-header">
        <span class="rc-file-status" data-status={props.result.status}>
          {statusLetter(props.result.status)}
        </span>
        <span class="rc-file-path" title={props.file}>
          {props.file}
        </span>
        <span class="rc-file-stats">
          <span class="rc-add">+{props.result.additions}</span>{" "}
          <span class="rc-del">−{props.result.deletions}</span>
        </span>
        <button type="button" class="rc-action" onClick={props.onAccept}>
          Accept
        </button>
        <button type="button" class="rc-action" onClick={props.onRestore}>
          Restore
        </button>
        <button type="button" class="rc-action" onClick={props.onRefresh}>
          Refresh
        </button>
        <button type="button" class="rc-action" onClick={props.onCopy}>
          Copy
        </button>
        <span class="rc-spacer" />
      </div>

      <Show when={!props.result.binary} fallback={<div class="rc-empty">Binary file changed.</div>}>
        <Show
          when={!props.result.truncated}
          fallback={<div class="rc-empty">Diff is too large to render.</div>}
        >
          <Show
            when={parsed().hunks.length > 0}
            fallback={
              <div class="rc-empty">
                No textual changes.{" "}
                <Show when={parsed().meta.length > 0}>
                  <span class="rc-muted">{parsed().meta.join(" · ")}</span>
                </Show>
              </div>
            }
          >
            <div class="rc-diff-scroll">
              <For each={parsed().hunks}>
                {(hunk) => (
                  <>
                    <div class="rc-hunk">{hunk.header}</div>
                    <For each={hunk.lines}>
                      {(line) => (
                        <Show
                          when={line.kind !== "meta"}
                          fallback={<div class="rc-line-meta">{line.text}</div>}
                        >
                          <div class={`rc-line rc-line-${line.kind}`}>
                            <span class="rc-ln">{line.oldNo ?? ""}</span>
                            <span class="rc-ln">{line.newNo ?? ""}</span>
                            <span class="rc-sign">
                              {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
                            </span>
                            <span class="rc-code">{line.text || " "}</span>
                          </div>
                        </Show>
                      )}
                    </For>
                  </>
                )}
              </For>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  )
}
