# Recent Changes — плагин дифф-ревью для OpenCode Desktop

**Статус:** MVP реализован (M0–M5), 36 тестов зелёные; TUI — будущий M6
**Дата:** 2026-11-10
**Рабочая директория:** `C:\Users\HONOR\work\opencode-recent-changes`
**Целевая версия OpenCode:** 2.2.x (проверено на `@opencode/plugin@2.2.6`, `@opencode/schema@2.2.6`)
**Поверхность MVP:** OpenCode Desktop (GUI-часть). TUI — будущий этап M6.

---

## 0. Что изменилось после ответов

| Вопрос | Решение |
|---|---|
| Поверхность | **Desktop GUI** (`./gui-experimental`), не TUI |
| Baseline | **По каждому запросу** (user turn), с сохранением истории шагов |
| Откат | **Поэтапный**: к концу любого запроса в сессии |
| Revert | **Входит в MVP** |
| TUI | Отложен в roadmap (M6) |

---

## 1. Цель

Плагин показывает изменения, которые агент сделал в коде, в виде diff-ревью
«как в Cursor»: список шагов (запросов), файлы, unified diff, откат к любому
шагу.

Ключевые требования:

1. **Без git** — ни `git diff`, ни `git status`, ни `child_process`. Свои
   снимки и свой diff-движок.
2. Формат патча — git-совместимый unified diff (побайтово на обычных кейсах).
3. **История по запросам**: каждый user turn — отдельный checkpoint; после
   каждого запроса изменения зафиксированы; можно откатиться к концу любого
   предыдущего запроса.
4. Revert не теряет историю: откат создаёт новый шаг, а не удаляет прошлое.

### Не-цели MVP

- TUI-панель (M6).
- История по коммитам/веткам.
- Rename detection (delete + add).
- Синтаксическая подсветка внутри диффа.
- Изменения, сделанные человеком вне сессии, если файл ни разу не трогал агент.

---

## 2. Референс: Cursor

| Механика Cursor | Наш аналог |
|---|---|
| Checkpoint на каждый запрос | `Step` в timeline |
| Diff считается локально | свой Myers-движок |
| История checkpoint'ов | `steps[]` + версии файлов |
| Keep (принять) | `acceptedStep := latest` |
| Undo (откатить) | `revertTo(step)` |
| Restore checkpoint | `revertTo(step)` + новый restore-шаг |
| Список файлов + `+N −M` | `FileDiff.Info[]` |
| Inline word highlight | `wordDiff` в UI (фаза 2) |

Cursor закрыт; копируем наблюдаемое поведение, не код.

---

## 3. Проверенные факты API

Источники: <https://opencode.ai/docs/build/plugins>, `/server`, `/cli`, `/rpc`,
`/gui`; типы `@opencode/plugin@2.2.6`, `@opencode/schema@2.2.6`.

### 3.1 Пакет

```jsonc
{
  "name": "opencode-recent-changes",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",                    // server
    "./gui-experimental": "./dist/gui-experimental.cjs", // desktop GUI
    "./rpc": "./src/rpc.ts"                   // контракт
  },
  "dependencies": { "@opencode/plugin": "latest" },
  "devDependencies": {
    "vite": "^7.0.0",
    "vite-plugin-solid": "^2.11.0",
    "solid-js": "^1.9.0"
  },
  "peerDependencies": { "effect": "^4.0.0" }
}
```

- Desktop загружает `./gui-experimental` (обязательно `.cjs`/`.js`, один
  prebuilt-бандл).
- GUI берёт `id` серверной части: `ctx.id === "recent-changes"`.
- Desktop читает плагины только из `opencode.json(c)`, не из `cli.json`.

### 3.2 Server part

```ts
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "recent-changes",
  async setup(ctx) {
    // ctx.location.directory
    // ctx.storage get/set/remove/scan
    // ctx.rpc.register / ctx.rpc(Contract)
    // ctx.tool.hook, ctx.session.hook
    // ctx.event.subscribe
  },
})
```

### 3.3 Хуки инструментов

```ts
interface ToolHooks {
  "execute.before": {
    tool: string
    readonly sessionID: Session.ID
    readonly agent: Agent.ID
    readonly messageID: SessionMessage.ID
    readonly id: Tool.CallID
    input: unknown
  }
  "execute.after": {
    readonly tool: string
    readonly sessionID: Session.ID
    readonly agent: Agent.ID
    readonly messageID: SessionMessage.ID
    readonly id: Tool.CallID
    readonly input: unknown
  } & (
    | { readonly status: "completed"; result: Tool.Result }
    | { readonly status: "error"; error: Tool.Error }
  )
}
```

`Tool.Result.metadata` — свободный `Record<string, any>`; встроенный diff
может быть, но источник истины — диск.

### 3.4 Границы запроса (события)

Подтверждённые типы из `event-manifest`:

- `session.execution.started`
- `session.execution.succeeded`
- `session.execution.failed`
- `session.execution.interrupted`
- `session.idle`
- `session.step.started` / `session.step.ended`
- `session.revert.staged` / `session.revert.committed` / `session.revert.cleared`
- `session.prompt` (hook на admission, не событие)

Используем:

- `ctx.session.hook("prompt", ...)` — граница запроса: закрыть предыдущий шаг
  и открыть новый.
- `ctx.event.subscribe({ types: ["session.execution.started",
  "session.execution.failed", "session.execution.interrupted", "session.idle"] })`:
  - `started` — отметить root-сессию как активную;
  - `failed` / `interrupted` — закрыть шаг со статусом `interrupted`;
  - `idle` — закрыть шаг (`closed`), это конец пользовательского запроса.
- `session.execution.succeeded` **не закрывает шаг**: он может срабатывать
  между tool-call'ами внутри одного запроса.
- Чтение `timeline`/`step` **не закрывает** шаг; оно только пересчитывает
  живую статистику. Шаг закроется по `idle` или при следующем prompt.

### 3.5 Схема диффа OpenCode

```ts
FileDiff.Info = {
  file: string
  patch: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
  more?: true
}
```

### 3.6 RPC

```ts
export const RecentChanges = Rpc.define({ id: "recent-changes", methods: {...}, events: {...} })

// server
const reg = await ctx.rpc.register(RecentChanges, impl)
await reg.events.emit("updated", { sessionID })

// GUI
const rc = ctx.client.rpc(RecentChanges)
const data = await rc.timeline({ sessionID })
const off = rc.events.on("updated", (e) => ...)
```

### 3.7 GUI part (Desktop)

```tsx
import { Command, Panel, Plugin } from "@opencode/plugin/gui"

export default Plugin.define({
  setup(ctx) {
    ctx.add(Panel, {
      id: "review",
      region: "side",
      width: 720,
      list: (input) => (input.open.includes("review") ? [tab] : []),
      render: (props) => <ReviewPanel session={props.session} screen={props.screen} />,
    })

    ctx.add(Command, (): Command => ({
      id: "review",
      title: "Review recent changes",
      bind: "mod+shift+d",
      slash: { name: "changes" },
      run: () => {
        const session = ctx.sessions.current()
        if (session) ctx.layout.open(`${ctx.id}:review`, session, { tab: "select" })
      },
    }))
  },
})
```

Проверенные возможности:

- `Panel`: `region: "side"`, `width`, `mobile`, `list`, `render`, `focus`,
  `enter`, `close`, `closed`, `restore`.
- `ctx.layout.open/close/toggle/state/side.toggle`.
- `ctx.sessions.current()`, `ctx.sessions.list()`, `ctx.screen.current()`.
- `ctx.dialogs.confirm/alert/prompt/select`; `ctx.ui.Dialog`.
- `ctx.ui.*`: Button, IconButton, Icon, Tooltip, Menu, Loader, Switch,
  TextInput, Select, Keybind, Markdown, Code, Settings*.
- `ctx.add(Style, css)` — свой CSS.
- `ctx.system.copy(text)`, `ctx.system.openExternal(url)`.
- `ctx.add(MenuItem, { menu: "session.panel", ... })` — пункт в «+» панели.
- `ctx.add(ComposerPill, ...)` — счётчик изменений над composer.
- `ctx.add(SettingsPage, ...)` — настройки.
- `ctx.storage` / `Store` — состояние окна.
- `createKeyed`, `createLatest`, `usePanel`, `usePlugin`.
- Встроенный контракт `Changes` (`@opencode/plugin/gui/review`) — это
  **чужой** review-панель; свои диффы туда не подставить, делаем свою панель.

### 3.8 Сборка GUI

```ts
// vite.config.ts
import { defineConfig } from "vite"
import { gui } from "@opencode/plugin/gui/vite"

export default defineConfig({ plugins: [gui({ entry: "src/gui.tsx", outFile: "dist/gui-experimental.cjs" })] })
```

- `vite build --watch` перезагружает GUI в каждом окне; **server part не
  перезапускается** (для серверных правок — `/reload` или рестарт).
- Бандл — один CJS-файл; `effect`, `solid-js`, `@opencode/*` — external.
- `setup` синхронный; тяжёлую работу — в компонентах/`createLatest`.

---

## 4. Архитектура

```
recent-changes/
├─ PLAN.md
├─ ROADMAP.md
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ src/
│  ├─ index.ts              server entry
│  ├─ rpc.ts                Rpc.define
│  ├─ gui.tsx               ./gui-experimental entry
│  ├─ gui/
│  │  ├─ panel.tsx          Panel contribution + layout
│  │  ├─ timeline.tsx       список шагов
│  │  ├─ file-list.tsx      файлы шага
│  │  ├─ diff-view.tsx      unified diff
│  │  ├─ toolbar.tsx        restore/copy/accept
│  │  ├─ styles.css         инжектится через Style
│  │  └─ i18n.ts            en/ru строки
│  ├─ core/
│  │  ├─ paths.ts           normalize, relPath, sha256, gitBlobSha1
│  │  ├─ capture.ts         хуки, интроспекция, шаги
│  │  ├─ timeline.ts        модель шагов и версий
│  │  ├─ store.ts           индекс + blobs
│  │  ├─ diff/
│  │  │  ├─ myers.ts
│  │  │  ├─ unified.ts
│  │  │  ├─ words.ts
│  │  │  └─ index.ts
│  │  └─ format.ts
│  └─ tui.tsx               (M6, будущее)
└─ test/
   ├─ fixtures/
   ├─ diff.golden.test.ts
   ├─ diff.property.test.ts
   ├─ timeline.test.ts
   ├─ revert.property.test.ts
   └─ capture.test.ts
```

Поток:

```
session.prompt ──► open Step N ──┐
tool.execute.before ──► before ──┤
tool.execute.after  ──► version ─┤
execution.succeeded ──► close ───┤
                                 ├─► store (index + blobs)
                                 │
GUI Panel ◄── RPC timeline/step/file/revert ◄┘
     ▲                │
     └── events.updated
```

---

## 5. Модель timeline (ключевое)

### 5.1 Сущности

```ts
interface SessionTimeline {
  version: 1
  sessionID: string              // root session
  directory: string
  createdAt: number
  acceptedStep: number           // «просмотрено до»
  steps: Step[]
  files: Record<string, FileHistory>
}

interface Step {
  id: string                     // st_0004
  index: number                  // 0 = baseline сессии
  kind: "baseline" | "request" | "restore"
  prompt?: string                // первые 120 символов запроса
  startedAt: number
  endedAt?: number
  status: "open" | "closed" | "interrupted" | "restored"
  restoreTo?: number             // для kind=restore
  files: string[]                // пути, затронутые в шаге
}

interface FileHistory {
  path: string
  initial: Version               // состояние до первого касания в сессии
  versions: VersionEntry[]       // хронологически
}

interface VersionEntry {
  step: number
  at: number
  version: Version
  tool?: string
  toolCallID?: string
  additions?: number             // кэш статистики
  deletions?: number
}

interface Version {
  exists: boolean
  blob?: string                  // sha256
  hash?: string                  // sha256 содержимого
  size?: number
  mode?: number
}
```

### 5.2 Жизненный цикл шага

1. **Prompt hook** (`session.prompt`) для root-сессии: закрыть предыдущий
   открытый шаг (если остался), создать `Step N` (`kind: "request"`,
   `prompt`, `startedAt`), сделать его текущим.
2. **`execute.before`**: если путь ещё не имеет `initial` — прочитать файл,
   сохранить blob, зафиксировать `initial`.
3. **`execute.after`**: прочитать файл, сохранить blob, добавить
   `VersionEntry` с `step = N`. `before` шага всегда вычисляется как
   `versionBefore(step)`, отдельный `pendingBefore` не нужен.
4. **`execution.failed/interrupted`** (root): финализировать шаг:
   перечитать затронутые пути, добавить финальные версии, `endedAt`,
   `status: "interrupted"`, эмитить `updated`.
5. **`session.idle`** (root): то же, но `status: "closed"` — это конец
   пользовательского запроса.
6. **Чтение** `timeline`/`step` только пересчитывает статистику открытого
   шага и **не закрывает** его. Если `idle` потерялся, шаг закроется при
   следующем prompt.

### 5.3 Diff шага

Для шага `N` и пути `p`:

- `before` = последняя версия с `step < N` (или `initial`);
- `after` = последняя версия с `step === N` (на конец шага).

Патч считается `before → after`. Это diff «что сделал этот запрос».

### 5.4 Накопительный diff до шага K

- `before` = `initial`;
- `after` = последняя версия с `step <= K`.

Показывает всё, что накопилось от старта сессии до конца шага K.

### 5.5 Откат к шагу K

Алгоритм:

```
for each path in timeline.files:
  target = latest version with step <= K, else initial
  current = read disk
  if target.exists:
      if current.hash != target.hash: write blob (atomic)
  else:
      if current.exists: unlink
record Step R (kind="restore", restoreTo=K, files=changed paths)
set current step = R
```

Свойства:

- История **не удаляется**: шаги > K остаются, появляется restore-шаг.
- Можно откатиться снова к более раннему или более позднему шагу.
- Если файл был создан после K — он удаляется (initial.exists = false).
- Если файл существовал до сессии — восстанавливается `initial`.
- Перед записью проверяем, что текущий файл совпадает с последней
  зафиксированной версией; иначе `conflict` и требование `force`.

### 5.6 Accept (Keep)

`acceptedStep := latest` — «просмотрено до». UI по умолчанию показывает diff
от `acceptedStep` до текущего шага. Файлы на диске не меняются.

### 5.7 Сабагенты

Ключ — root-сессия (`session.root`). Шаг открывается по prompt родителя;
изменения дочерних сессий пишутся в тот же timeline с их `sessionID` в
метаданных версии.

### 5.8 Ограничение: bash

В режиме `capture: "tools"` изменения, сделанные только через `bash`, не
видны. Режим `capture: "workspace"` (опция) делает копию рабочего дерева на
старте шага и находит все изменения, включая bash. По умолчанию — `tools`.

---

## 6. Захват изменений

### 6.1 Определение путей

На `setup` читаем `ctx.tool.list()`, у каждого инструмента смотрим JSON-схему
`input`, ищем поля:

```
filePath, file_path, path, file, target, filename
```

Правила:

- значение — строка;
- относительный путь резолвим от `ctx.location.directory`;
- `\` → `/`, `..` за пределы workspace отбрасываем;
- ignore: `.git`, `node_modules`, `dist`, `build`, `.next`, `coverage`,
  `*.lock` (picomatch).

Denylist: `read`, `glob`, `grep`, `list`, `webfetch`, `bash`.
`bash` — только в `workspace` режиме.

### 6.2 Baseline

`initial` для пути фиксируется один раз — при первом `execute.before` в
сессии. Дальше не меняется.

### 6.3 Live-чтение

`timeline`/`step`/`file` всегда читают текущий диск для «after»-состояния
(после финализации шага — из версии; до — live). Это ловит изменения,
сделанные не через `edit`.

### 6.4 Workspace-режим (опция)

На старте шага:

- копия рабочего дерева в `cache/checkpoints/<session>/<step>/`
  (`fs.cp`, ignore, лимит 20k файлов / 500 MB);
- на финализации: обход + сравнение mtime/size/hash, запись версий для всех
  изменённых путей;
- после финализации checkpoint удаляется (версии уже в blobs).

Fallback при превышении лимита — `tools` + warning.

### 6.5 Производительность

- Хуки не считают патчи: только чтение, hash, blob.
- Статистика `+/-` считается на финализации шага и кэшируется.
- Панель запрашивает патч только для выбранного файла.
- Очередь на `(sessionID, path)`.

---

## 7. Diff-движок

### 7.1 API

```ts
type Op =
  | { type: "equal"; oldLine: number; newLine: number; text: string }
  | { type: "insert"; newLine: number; text: string }
  | { type: "delete"; oldLine: number; text: string }

interface UnifiedResult {
  patch: string
  additions: number
  deletions: number
  status: "added" | "deleted" | "modified"
  binary: boolean
  truncated: boolean
}

diffLines(before: string[], after: string[]): Op[]
toUnified(before: string, after: string, opts: {
  path: string
  context?: number
  maxLines?: number
}): UnifiedResult
wordDiff(oldLine: string, newLine: string): Segment[]
```

### 7.2 Строки

- `splitLinesKeepEol()` сохраняет `\n` / `\r\n`.
- Последняя строка без `\n` → `\ No newline at end of file`.
- CRLF и BOM не нормализуем (как git).

### 7.3 Алгоритм

- Myers O(ND) по хешам строк.
- Linear-space refinement.
- `maxD = 10_000`; при превышении — fallback «всё удалить / всё вставить»,
  `truncated: true`.
- Файлы > `maxLines` (200k) — без построчного diff, `truncated: true`.

### 7.4 Hunk builder

- Контекст 3.
- Склейка хунков при gap ≤ `2*context`.
- `@@ -oldStart,oldCount +newStart,newCount @@`; `,1` опускается.
- Пустой файл: `-0,0` / `+0,0`.

### 7.5 Git-заголовки

```
diff --git a/src/app.ts b/src/app.ts
index 3b18e51..a1b2c3d 100644
--- a/src/app.ts
+++ b/src/app.ts
```

- Новый: `new file mode 100644`, `--- /dev/null`.
- Удалённый: `deleted file mode 100644`, `+++ /dev/null`.
- `index` — git blob SHA-1: `sha1("blob " + len + "\0" + content)`.
- Режим `100644` / `100755` из `stat.mode`.
- Пути с пробелами/юникодом — C-style quoting.
- Бинарь (NUL в первых 8000 байт): `Binary files a/x and b/x differ`.

### 7.6 Статистика

`additions` = строки с `+` (без `+++`), `deletions` = строки с `-`
(без `---`).

### 7.7 Word diff

Токены (слова/пробелы/пунктуация), LCS, cap 400 токенов. Только UI.

### 7.8 Тесты

Golden против `git diff --no-index --no-color -U3` (эталон генерируется
**только в тестах**):

`add`, `delete`, `modify`, `multi-hunk`, `gap-5/6/7`, `no-newline-old/new`,
`crlf`, `bom`, `unicode`, `emoji`, `empty-to-content`, `content-to-empty`,
`binary`, `long-lines`.

Property: патч проходит `git apply --check` и восстанавливает `after`.

**Статус 2026-11-10:** 12 golden-кейсов + binary проходят побайтово
(`test/unified.test.ts`), всего 28 тестов; 10k строк с одним изменением —
7.9 мс. `bom`, `emoji`, `gap-5` пока не выделены в отдельные кейсы.

---

## 8. Хранилище

### 8.1 Индекс

`ctx.storage`, ключ `timeline/<rootSessionID>`:

```jsonc
{
  "version": 1,
  "sessionID": "ses_...",
  "directory": "C:/proj",
  "createdAt": 1762700000000,
  "acceptedStep": 2,
  "steps": [
    { "id": "st_0000", "index": 0, "kind": "baseline", "startedAt": 0, "status": "closed", "files": [] },
    { "id": "st_0001", "index": 1, "kind": "request", "prompt": "Add diff engine", "startedAt": 1762700001000, "endedAt": 1762700010000, "status": "closed", "files": ["src/diff.ts"] }
  ],
  "files": {
    "src/diff.ts": {
      "path": "src/diff.ts",
      "initial": { "exists": false },
      "versions": [
        { "step": 1, "at": 1762700009000, "version": { "exists": true, "blob": "sha256:...", "hash": "...", "size": 1234, "mode": 33188 }, "tool": "write", "additions": 11, "deletions": 0 }
      ]
    }
  }
}
```

### 8.2 Blobs

```
%LOCALAPPDATA%\opencode\cache\recent-changes\
├─ blobs\<sha256>
├─ checkpoints\<ses>\<step>\   (только workspace-режим, временно)
└─ tmp\
```

Атомарная запись `tmp` → `rename`, дедупликация по sha256.

### 8.3 Лимиты

| Лимит | Значение |
|---|---|
| Файл | 2 MB |
| Сессия | 64 MB |
| Шагов | 500 (старые компактятся) |
| Checkpoint | 20k файлов / 500 MB |
| Blob TTL | 30 дней |

### 8.4 Конкурентность

- Очередь на `(sessionID, path)`.
- Read-modify-write индекса под очередью сессии.
- Один открытый шаг на root-сессию.

---

## 9. RPC-контракт

```ts
export const RecentChanges = Rpc.define({
  id: "recent-changes",
  methods: {
    timeline: {
      input: { sessionID },
      output: {
        steps: StepInfo[],
        acceptedStep: number,
        currentStep: number,
        totals: { additions, deletions, files },
      },
    },
    step: {
      input: { sessionID, step },
      output: { files: FileDiff.Info[], additions, deletions },
    },
    file: {
      input: { sessionID, step, file },
      output: { patch, before?, after?, binary, truncated },
    },
    revert: {
      input: { sessionID, step, force?, file? },
      output: { ok, restored: string[], conflicts: string[], error?, step?: StepInfo },
    },
    accept: {
      input: { sessionID, step?, file? },
      output: { acceptedStep },
    },
    reset: {
      input: { sessionID },
      output: { ok: true },
    },
  },
  events: {
    updated: { schema: { sessionID } },
  },
})
```

`StepInfo`:

```ts
{
  index: number
  kind: "baseline" | "request" | "restore"
  prompt?: string
  startedAt: number
  endedAt?: number
  status: "open" | "closed" | "interrupted" | "restored"
  restoreTo?: number
  additions: number
  deletions: number
  files: number
}
```

Семантика:

- `timeline` — быстро, без патчей.
- `step` — список файлов шага с `FileDiff.Info` (патчи ленивые; можно
  возвращать только summary + отдельный `file`).
- `revert` — откат к концу шага; `force` обходит conflict.
- `accept` — сдвиг `acceptedStep`.
- `reset` — очистить timeline сессии (не трогая файлы).

---

## 10. UI (Desktop GUI)

### 10.1 Точки входа

| Что | Значение |
|---|---|
| Panel id | `review`, ключ `recent-changes:review`, `width: "narrow"` (компактный лончер) |
| Command | `recent-changes.review`, bind `mod+shift+d`, slash `/changes` — открывает диалог ревью |
| MenuItem | `session.panel`, title «Review changes», icon `review` |
| ComposerPill | «N changes» (опционально, после MVP) |
| SettingsPage | опции (после MVP) |

Основная поверхность M3 — **диалог** `ui.Dialog` (`size: "large"`), потому что
боковая панель в узком окне Desktop обрезается. Side panel оставлен как
компактный лончер с кнопкой «Open review».

### 10.2 Layout

```
┌ Review changes ─────────────────────────────── [Copy] [Refresh] ┐
│ Steps                    │ src/app.ts                  M +12 −3 │
│ ● #4 14:32  +18 −2       │ @@ -12,7 +12,9 @@ export ...        │
│   "Add diff engine"      │  12  12   const root = ...         │
│ ● #3 14:20  +3 −0        │  13     - return oldValue          │
│   "Fix types"            │      13 + const next = compute()   │
│ ○ #2 14:05  +7 −1        │      14 + return next              │
│   "..."                  │                                    │
└─────────────────────────────────────────────────────────────────┘
```

- Слева — timeline шагов (scroll, выбор).
- По центру — файлы выбранного шага (статус, `+/-`).
- Справа — diff выбранного файла.
- В диалоге `large` (640px) ширина < 760 → drill-down: шаги → файлы → diff.
- Toolbar: Refresh, Copy patch; Restore/Accept — M4.

### 10.3 Компоненты

- `StepTimeline`: точка статуса, `#N`, время, preview промпта, статистика,
  маркер `restore`, текущий шаг.
- `FileList`: `M/A/D`, `+N −M`, активный файл, клик.
- `DiffView`: заголовок файла, хунки, две колонки номеров, строки `+`/`-`/` `,
  word-level highlight (фаза 2), горизонтальный скролл для длинных строк.
- `Toolbar`: Refresh, Copy patch; confirm для restore — M4.
- Состояния: loading / empty / error / binary / truncated / conflict.
- Live: `events.on("updated")` + debounce 150 мс, сохранение выбранного шага.

### 10.4 Стили

- `ctx.add(Style, css)`.
- Используются переменные `--diffs-*` из Desktop: `--diffs-bg-addition`,
  `--diffs-bg-deletion`, `--diffs-bg-context`, `--diffs-addition-color`,
  `--diffs-deletion-color`, `--diffs-fg-number`, `--diffs-font-family`,
  `--diffs-font-size`; fallback — `color-mix`, `currentColor`.
- Цвета: `+` — success, `-` — error, `@@` — muted, номера — faint.
- Шрифт — monospace приложения.
- Никаких внешних CDN.

### 10.5 Действия

- **Expand** — полноэкранный режим: `Portal` в `document.body`,
  `position: fixed; width: 100vw; height: 100vh`, кнопки Collapse/Close
  слева в шапке, чтобы не зависеть от ширины окна.
- **Collapse** — вернуться к диалогу `large`.
- **Restore this checkpoint** — `revert` + confirm (`danger: true`).
- **Copy patch** — `ctx.system.copy(patch)`.
- **Accept** — `accept` (Keep); с `file` — только выбранный файл.
- **Restore file** — `revert` с `file`: откат одного файла, остальные не трогаются.
- **Refresh file** — повторный `file` для выбранного пути.
- **Open file** — опционально: `ctx.screen.current()?.file.sync(path)`.
- **Refresh** — повторный `timeline`.

---

## 11. Конфиг

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [{
    "package": "C:/Users/HONOR/work/opencode-recent-changes",
    "options": {
      "capture": "tools",          // tools | workspace
      "contextLines": 3,
      "ignore": ["**/node_modules/**", "**/dist/**", "**/build/**", "**/.next/**", "**/coverage/**", "**/*.lock"],
      "maxFileSize": 2097152,
      "maxSessionBytes": 67108864,
      "maxSteps": 500,
      "maxLines": 200000,
      "keybind": "mod+shift+d",
      "showComposerPill": false
    }
  }]
}
```

Валидация в `setup`, неизвестные ключи — warning, дефолты.

---

## 12. Крайние случаи

| Кейс | Поведение |
|---|---|
| Файл создан в шаге N | `initial.exists = false`, `status: added` |
| Файл удалён | `status: deleted`, `+++ /dev/null` |
| Переименование | delete + add |
| Бинарь | «Binary files … differ» |
| Огромный файл | `truncated`, статистика из версии |
| CRLF/BOM | как git |
| Нет newline | `\ No newline at end of file` |
| Путь вне workspace | игнор + warning |
| Симлинк | diff по цели |
| Несколько правок в шаге | один diff `before → after` шага |
| Сабагент | в timeline root-сессии |
| Bash-правка (tools) | не видна, документируем |
| Bash-правка (workspace) | видна через checkpoint |
| Внешняя правка после шага | conflict при revert, нужен `force` |
| Откат к шагу 0 | восстанавливает initial-состояния |
| Откат к шагу с созданным файлом | файл восстанавливается |
| Откат к шагу до создания файла | файл удаляется |
| Повторный откат | идемпотентен, создаёт restore-шаг |
| Плагин перезагружен | timeline в storage, blobs на диске |
| Сессия удалена | TTL + очистка |
| Ошибка инструмента | версия не пишется |
| Потеря события закрытия | ленивая финализация |
| Гонка хуков | очередь `(session, path)` |
| 500+ шагов | компакция старых, версии сохраняются |

---

## 13. Roadmap (кратко; детали — ROADMAP.md)

| Этап | Содержание | Оценка |
|---|---|---|
| M0 | GUI-скелет: сборка, панель, команда, RPC hello | 1 д |
| M1 | Timeline: шаги, хуки, события, версии, storage | 1.5 д |
| M2 | Diff-движок + golden/property-тесты | 1.5 д |
| M3 | GUI: timeline, файлы, diff, live | 2 д |
| M4 | Revert/accept, conflict, confirm | 1 д |
| M5 | README, приёмка, реальная сессия | 0.5 д |
| M6 | TUI-панель (будущее) | +3 д |

Итого MVP: ~7.5 рабочих дней.

---

## 14. Риски

| Риск | Митигация |
|---|---|
| GUI API experimental | M0-спайк; pin версии; изолировать в `gui/` |
| Сборка CJS/JSX | штатный preset `@opencode/plugin/gui/vite`, `vite build --watch` |
| Server не перезагружается при rebuild GUI | помнить; серверные правки — `/reload` |
| Неизвестные CSS-переменные | M0 дамп computed styles + fallback |
| Потеря события закрытия шага | ленивая финализация |
| Bash-правки | опция `capture: "workspace"` |
| Большие репозитории | лимиты, ignore, fallback |
| Revert затрёт чужие правки | hash-check + confirm + `force` |
| Долгая история | maxSteps + компакция + TTL blobs |
| Конфликт с встроенным review | своя панель, свой ключ, не трогаем `Changes` |

---

## 15. Открытые вопросы

1. **Bash-правки:** включать `capture: "workspace"` по умолчанию? (дороже, но
   полный откат).
2. **Accept:** нужен ли в MVP или достаточно restore? (по умолчанию — да).
3. **ComposerPill** со счётчиком изменений — в MVP или после?
4. **Язык UI:** русский, английский или оба (i18n)?

Текущие допущения: `capture: "tools"`, accept — да, pill — после MVP,
i18n en + ru.

---

## 16. Журнал исследований

- Доки: `/build/plugins`, `/server`, `/cli`, `/rpc`, `/gui`.
- `@opencode/plugin@2.2.6`: хуки `tool.execute.*`, GUI SDK.
- `@opencode/schema@2.2.6`: `FileDiff.Info`, `event-manifest`
  (`session.execution.*`, `session.idle`, `session.step.*`).
- GUI: `Panel`, `Command`, `MenuItem`, `ComposerPill`, `Style`,
  `ctx.layout`, `ctx.sessions`, `ctx.dialogs`, `ctx.ui`, `ctx.client.rpc`.
- Встроенный `Changes` (`@opencode/plugin/gui/review`) — чужой review,
  не переиспользуем для своих диффов.
- Cursor: наблюдаемая модель checkpoint + локальный diff + review list.

---

## 17. Запуск (после M0)

```powershell
cd C:\Users\HONOR\work\opencode-recent-changes
npm install
npm run build        # vite build → dist/gui-experimental.cjs
npm run dev          # vite build --watch
```

1. Плагин уже в `~/.config/opencode/opencode.json` (см. §11).
2. Перезапустить Desktop (GUI-часть подхватывается при старте/пересборке).
3. В сессии: `/changes` или `Ctrl+Shift+D`.
4. Логи: `~/.local/share/opencode/log/opencode.log`, фильтр `recent-changes`.
