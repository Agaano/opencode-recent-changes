import { For } from "solid-js"
import type { StepFileInfo } from "../rpc.ts"

function statusLetter(status: StepFileInfo["status"]): string {
  if (status === "added") return "A"
  if (status === "deleted") return "D"
  return "M"
}

export function FileList(props: {
  files: StepFileInfo[]
  selected: string | undefined
  onSelect: (file: string) => void
  onAccept?: (file: string) => void
  onRestore?: (file: string) => void
}) {
  return (
    <div class="rc-files">
      <For each={props.files}>
        {(file) => (
          <div
            class="rc-file"
            classList={{ "rc-file-active": file.file === props.selected }}
          >
            <button
              type="button"
              class="rc-file-main"
              onClick={() => props.onSelect(file.file)}
              title={file.file}
            >
              <span class="rc-file-status" data-status={file.status}>
                {statusLetter(file.status)}
              </span>
              <span class="rc-file-path">
                {file.reviewed ? <span class="rc-step-check">✓</span> : null}
                {file.file}
              </span>
              <span class="rc-file-stats">
                <span class="rc-add">+{file.additions}</span>{" "}
                <span class="rc-del">−{file.deletions}</span>
              </span>
            </button>

            <button
              type="button"
              class="rc-file-action"
              title="Accept file"
              onClick={() => props.onAccept?.(file.file)}
            >
              ✓
            </button>
            <button
              type="button"
              class="rc-file-action"
              title="Restore file"
              onClick={() => props.onRestore?.(file.file)}
            >
              ↺
            </button>
          </div>
        )}
      </For>
    </div>
  )
}
