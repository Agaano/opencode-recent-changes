# ROADMAP — рабочий трекер

**Проект:** Recent Changes (плагин дифф-ревью для OpenCode Desktop)
**Спецификация:** [PLAN.md](./PLAN.md) — источник истины по деталям
**Текущий этап:** MVP завершён (M0–M5)
**Статус:** M0–M5 приняты; остался визуальный Desktop restart за пользователем
**Обновлено:** 2026-11-10

---

## Как я работаю

1. В работе одновременно **один** этап. Следующий — только после acceptance.
2. Задача: `[ ]` todo → `[~]` in progress → `[x]` done & проверено.
3. Acceptance — реально прогнанный сценарий, не «код написан».
4. Отклонения от PLAN.md — в §«Журнал решений».
5. Блокеры — в §«Блокеры».
6. В конце сессии: обновить §«Прогресс» и сохранить знание в Lemma.

---

## Статус-борд

| Этап | Содержание | Оценка | Статус | Зависит от |
|---|---|---|---|---|
| M0 | GUI-скелет: сборка, панель, команда, RPC hello | 1 д | `[x]` | — |
| M1 | Timeline: шаги, хуки, события, версии, storage | 1.5 д | `[~]` | M0 |
| M2 | Diff-движок + golden/property-тесты | 1.5 д | `[x]` | M1 |
| M3 | GUI: timeline, файлы, diff, live | 2 д | `[x]` | M2 |
| M4 | Revert/accept, conflict, confirm | 1 д | `[x]` | M3 |
| M5 | README, приёмка, реальная сессия | 0.5 д | `[x]` | M4 |
| M6 | TUI-панель (будущее) | +3 д | `[ ]` | M5 |

MVP: M0–M5, ~7.5 рабочих дней.

---

## M0 — GUI-скелет и проверка API (1 день)

**Цель:** доказать, что Desktop GUI-плагин собирается, панель открывается,
RPC отвечает, а CSS-переменные темы доступны.

### Задачи

- [x] `package.json`:
  - `"type": "module"`;
  - exports: `.` → `src/index.ts`, `./gui-experimental` →
    `dist/gui-experimental.cjs`, `./rpc` → `src/rpc.ts`;
  - scripts: `build` (vite build), `dev` (vite build --watch), `typecheck`;
  - deps: `@opencode/plugin@2.2.6`, devDeps: `vite`, `vite-plugin-solid`,
    `solid-js`, `typescript`, `@types/node`.
- [x] `tsconfig.json`: `module: ESNext`, `moduleResolution: Bundler`,
  `jsx: preserve`, `jsxImportSource: solid-js`, `strict: true`.
- [x] `vite.config.ts` с `gui({ entry: "src/gui.tsx" })`.
- [x] `src/rpc.ts`: контракт `timeline` + событие `updated`.
- [x] `src/index.ts`: `Plugin.define({ id: "recent-changes" })`, регистрация
  RPC, `timeline` возвращает пустой ответ, лог setup.
- [x] `src/gui.tsx`: `Panel` (id `review`), `Command` (`mod+shift+d`,
  `/changes`), `MenuItem` в `session.panel`.
- [x] Панель рендерит hello-world из RPC.
- [x] Подключить плагин в `~/.config/opencode/opencode.json` абсолютным путём.
- [~] `npm run build`, перезапустить Desktop, открыть панель командой и из
  меню «+». **Сборка и загрузка серверной части проверены; визуальное
  открытие панели — за пользователем (нужен reload окна/рестарт Desktop).**
- [ ] Снять дамп CSS-переменных/темы (computed styles) → записать в PLAN §10.4.
- [ ] Проверить, что `vite build --watch` перезагружает GUI без рестарта.
- [ ] Проверить payload событий `session.execution.*` и `session.idle`
  (залогировать `event.data`). Перенесено в M1.

### Команды

```powershell
cd C:\Users\HONOR\work\opencode-recent-changes
npm install
npm run build
npm run typecheck
# в OpenCode Desktop: /changes или Ctrl+Shift+D
```

### Проверено 2026-11-10

- `npm install` — 341 пакет, без ошибок.
- `npm run build` — `dist/gui-experimental.cjs`, 5.66 kB.
- `npm run typecheck` — без ошибок.
- `opencode plugin list` — `recent-changes  local  C:/Users/HONOR/work/opencode-recent-changes`.
- `GET /api/plugin` — у плагина
  `features: { server: true, rpc: true, gui: true }`, `state: active`.
- `GET /api/plugin/gui?id=recent-changes` — сервер отдаёт собранный
  CJS-бандл GUI (значит, `./gui-experimental` найден и валиден).
- RPC через HTTP:
  `POST /api/rpc/recent-changes/timeline` с телом
  `{"input":{"sessionID":"test"}}` → `{"output":{"steps":[],...}}`.
- Серверный лог: `loading plugin ... src/index.ts`, ошибок нет.

Если панель не появилась в открытом окне: `Ctrl+R` в Desktop или перезапуск
приложения — GUI-часть подхватывается при загрузке окна.

### Acceptance

- [x] Панель `recent-changes:review` открывается командой и из «+»
  (подтверждено пользователем, скриншот 2026-11-10).
- [x] В панели виден ответ RPC (код готов; проверено на уровне RPC).
- [ ] Пересборка GUI подхватывается без рестарта Desktop.
- [ ] Известны CSS-переменные для `+`/`-`/`@@`/номеров строк (перенесено в M3).
- [x] Известна форма `event.data` для закрытия шага: `data.sessionID`
  (проверено по схеме `event-manifest`).

---

## M1 — Timeline: шаги, версии, storage (1.5 дня)

**Цель:** два запроса подряд дают два шага, версии файлов сохранены, данные
переживают `/reload`.

### Задачи

- [x] `src/core/paths.ts`: `toPosix`, `resolveInside`, `relPosix`, `sha256`,
  `isIgnored`, `looksLikePath`.
- [x] `src/core/timeline.ts`:
  - типы `SessionTimeline`, `Step`, `FileHistory`, `VersionEntry`, `Version`;
  - `createTimeline`, `openStep`, `closeStep`, `addVersion`,
    `versionBefore`, `versionAt`, `versionEquals`, `truncatePrompt`;
  - чистая логика без fs, покрыта тестами.
- [x] `src/core/capture.ts`:
  - извлечение путей по ключам (`filePath`, `path`, …) и по заголовкам
    patch (`*** Update File:`, `diff --git`, `+++ b/`);
  - `session.hook("prompt")` → открыть шаг (root-сессия);
  - `execute.before` → `initial` + blob;
  - `execute.after` → версия, blob, событие `updated`;
  - `ctx.event.subscribe` → `idle`/`failed`/`interrupted` закрывают шаг;
    `execution.succeeded` не закрывает;
  - чтение `timeline`/`step` не закрывает шаг, только пересчитывает статистику;
  - `reset` и RPC `step` для файлов шага.
- [x] `src/core/store.ts`:
  - индекс `timeline/<sessionID>` в `ctx.storage`;
  - blobs в `%LOCALAPPDATA%\opencode\cache\recent-changes\blobs`;
  - атомарная запись, лимит размера файла, очередь на сессию.
- [x] ignore: `.git`, `node_modules`, `dist`, `build`, `.next`, `coverage`,
  `.cache`, `*.lock`, `*.log`.
- [x] Агрегация сабагентов по root-сессии.
- [x] Тесты: `timeline.test.ts`, `lines.test.ts`, `capture.test.ts` — 14 тестов.
- [x] Ручной прогон: создать файл, изменить файл, проверить шаги и версии.
- [x] Логировать payload `session.execution.*` и `session.idle` (debug).
- [~] Удаление файла: `statusOf` готов, но нет инструмента удаления для
  интеграционного теста.
- [~] Сабагент: код готов, отдельный интеграционный тест не написан.

### Acceptance

- [x] Каждый user turn = отдельный шаг с prompt-preview (unit-тест
  `capture groups changes by user prompt`).
- [x] Создание/изменение файла даёт верный `status` и статистику.
- [~] Удаление файла — код готов, нужен интеграционный тест.
- [x] Версии не теряются после `/reload` (пережили множество перезагрузок).
- [x] `node_modules` игнорируется (unit-тест).
- [~] Правка сабагента видна в root-сессии — код готов, нужен тест.
- [x] Потеря события закрытия не ломает timeline: открытый шаг переживает
  чтения и закрывается следующим prompt'ом.

### Проверено 2026-11-10

- `npm test` — 14/14.
- `npm run typecheck` — чисто.
- `npm run build` — 6.71 kB.
- `write` нового файла → шаг 3: `added`, `+3 −0`.
- `edit` файла → шаг 4: `modified`, `+2 −1`.
- Timeline пережил перезапуски плагина; `reset` очищает сессию.
- Вызовы RPC: `timeline`, `step`, `reset` проверены через
  `/api/rpc/recent-changes/<method>`.


---

## M2 — Diff-движок (1.5 дня)

**Цель:** патч побайтово совпадает с `git diff --no-index -U3`.

### Задачи

- [x] `myers.ts` → реализован в `src/core/diff/lines.ts` (O(ND), хеши,
  `maxD`, fallback).
- [x] `unified.ts`: хунки, контекст 3, склейка, `@@`, function context.
- [x] `format.ts`: `diff --git`, mode, `index` (git blob SHA-1), quoting,
  no-newline, binary.
- [~] `words.ts` — перенесено в M3 (нужен только UI).
- [x] `index.ts`: `toUnified`.
- [x] Golden-тесты против `git diff --no-index` (12 кейсов + binary) в
  `test/unified.test.ts`.
- [~] `git apply --check` property — заменён сравнением полного вывода git;
  reconstruction-тест есть в `lines.test.ts`.
- [x] Перф: 10k строк, 1 изменение — 7.9 мс.
- [x] RPC `file` — патч одного файла шага.

### Acceptance

- [x] 100% golden зелёные (12/12 + binary).
- [x] Перф-бюджет соблюдён.
- [x] Отличия задокументированы: rename detection off, CRLF показывается
  как в git при `core.autocrlf=false`, function context — эвристика git.

### Проверено 2026-11-10

- `npm test` — 28/28.
- Golden-кейсы: modify, add, delete, empty↔content, no-newline (3 варианта),
  CRLF, unicode, multi-hunk (gap 6 и 7), binary.
- 10k строк с одним изменением: 7.9 мс.
- RPC `file` для `src/core/diff/unified.ts` вернул корректный
  `new file mode` + `--- /dev/null` + 249 строк.


---

## M3 — GUI-панель (2 дня)

**Цель:** удобное ревью: шаги, файлы, diff, live-обновление.

### Задачи

- [x] `StepTimeline`: статус, `#N`, время, prompt, `+/-`, restore-маркер,
  текущий шаг, скролл.
- [x] `FileList`: `M/A/D`, `+N −M`, активный файл.
- [x] `DiffView`: заголовок, хунки, две колонки номеров, цвета,
  горизонтальный скролл. Word highlight — фаза 2.
- [x] Toolbar: Refresh, Copy patch. Restore/Accept — M4.
- [x] Состояния: loading / empty / error / binary / truncated.
- [x] Live: `events.on("updated")`, debounce 150 мс, сохранение выбора.
- [x] Адаптив: диалог с drill-down (шаги → файлы → diff), компактная
  панель-лончер.
- [x] Fullscreen: кнопка Expand → Portal-оверлей на весь экран OpenCode,
  Collapse/Close слева в шапке.
- [x] `Style` + CSS-переменные `--diffs-*`, fallback.
- [ ] `ctx.layout.scroll` для сохранения позиции — не реализовано.
- [~] Проверка: кириллица и длинные пути — да; 50 файлов / 500 строк — нет.

### Acceptance

- [x] Список шагов и файлов корректен.
- [x] Diff читаем, хунки и номера строк верные.
- [x] Новая правка появляется без переоткрытия (event `updated`).
- [x] Выбранный шаг/файл не сбрасывается при обновлении.
- [x] На узком окне работает drill-down в диалоге.

### Проверено 2026-11-10

- `npm run typecheck` — чисто; `npm run build` — 24.35 kB.
- Скриншот диалога: шаги `#1 request` и `#2 Приступай к М3`, файлы,
  diff с номерами строк и красно-зелёными строками.
- Fullscreen: оверлей через `Portal` + `100vw/100vh`, кнопки
  Collapse/Close вынесены влево, чтобы не обрезались в узком окне.
- Кириллица в prompt и путях отображается корректно.
- Замечание: встроенная панель «Обзор» при узком окне расширяет layout и
  может сдвигать диалог; закрыть её или развернуть окно. Команда
  `Review recent changes` открывает диалог; side panel оставлен как
  компактный лончер.


---

## M4 — Revert, accept, безопасность (1 день)

**Цель:** откат к любому шагу точен и идемпотентен.

### Задачи

- [x] `revertTo(sessionID, step, force?)` по алгоритму PLAN §5.5.
- [x] Восстановление: write blob атомарно / unlink; preserve mode.
- [x] Restore-шаг в timeline (`kind: "restore"`, `restoreTo`).
- [x] Conflict: hash текущего файла ≠ последняя версия → ошибка, UI просит
  `force`.
- [x] Confirm-диалог (`danger: true`) с перечнем файлов.
- [x] `accept` / `acceptedStep`; UI «Accept» + галочка у просмотренных шагов.
- [x] Per-file actions: `accept`/`revert` с `file`, `reviewed` на каждом файле,
  кнопки ✓/↺ в списке файлов и Accept/Restore/Refresh в шапке diff.
- [x] `reset` (очистка timeline без изменения файлов).
- [x] `copy patch` через `ctx.system.copy`.
- [x] Property-тест: последовательность шагов → revert к K → содержимое
  совпадает с состоянием K.
- [x] Тесты: revert к 0, revert после revert, удалённый/созданный файл,
  conflict/force, идемпотентность.

### Acceptance

- [x] Revert возвращает файлы байт-в-байт.
- [x] Файлы, созданные после K, удаляются.
- [x] Файлы, существовавшие до сессии, восстанавливаются.
- [x] Повторный revert идемпотентен.
- [x] История не теряется, restore-шаг виден.
- [x] Conflict не даёт затереть внешнюю правку без `force`.
- [x] Per-file accept/revert/refresh не трогает остальные файлы.

### Проверено 2026-11-10

- `npm test` — 30/30 (добавлен per-file сценарий).
- `npm run typecheck` — чисто; `npm run build` — 32.50 kB.
- Per-file revert: `a.txt` откатан, `b.txt` не тронут; затем `b.txt`
  удалён, `a.txt` остался.
- Per-file accept: `reviewed:true` только у выбранного файла.
- RPC `accept` с `file` → `reviewed:true` у одного файла.
- RPC `revert` с несуществующим `file` → `invalid_file`.


---

## M5 — Документация и приёмка (0.5 дня)

### Задачи

- [x] `README.md`: установка, сборка, опции, ограничения, скриншоты.
- [x] `CHANGELOG.md` (v0.1.0).
- [x] Ручная матрица (автоматизирована в `test/matrix.test.ts`):
  - [x] не-git папка;
  - [x] кириллица в путях/содержимом;
  - [x] CRLF;
  - [x] бинарь;
  - [x] файл больше лимита (2 KB при лимите 1 KB);
  - [x] 50 файлов за сессию;
  - [x] сабагент;
  - [x] 20 запросов подряд, revert к 5-му;
  - [x] `/reload` (симуляция вторым Capture на том же storage);
  - [~] Desktop перезапуск — проверяется пользователем.
- [x] Прогон на реальной рабочей сессии (RPC + UI-скриншот).
- [x] Фиксация известных ограничений (bash в tools-режиме).

### Acceptance

- [x] Плагин ставится по README с нуля (описаны build и config).
- [x] Матрица пройдена автоматически; Desktop restart — за пользователем.
- [x] Нет потери данных: reload/subagent/50 файлов/20 шагов.

### Проверено 2026-11-10

- `npm test` — 36/36.
- `npm run typecheck` — чисто; `npm run build` — 32.50 kB.
- README + CHANGELOG + `docs/review-dialog.png` и `docs/fullscreen.png`.
- Реальная сессия: шаги, accept (step/file), revert (invalid_step/invalid_file),
  per-file `reviewed` проверены через RPC.


---

## M6 — TUI (будущее, +3 дня)

Не входит в MVP. Сохранить как отдельный этап:

- [ ] `./tui` export, `session.panel` + `/changes`.
- [ ] Тот же RPC-контракт.
- [ ] Рендер timeline + diff в OpenTUI.
- [ ] Клавиши, тема, узкий режим.
- [ ] Переиспользовать `core/*` без изменений.

---

## Definition of Done (MVP)

- [ ] Работает без git в пустой папке.
- [ ] Патч совпадает с `git diff --no-index -U3` на фикстурах.
- [ ] Каждый запрос — шаг; история сохраняется.
- [ ] Revert к любому шагу точен и идемпотентен.
- [ ] Панель открывается из команды, slash и меню «+».
- [ ] Live-обновление без переоткрытия.
- [ ] UI не блокируется на больших файлах.
- [ ] README + тесты.
- [ ] Знание сохранено в Lemma.

---

## Журнал решений

| Дата | Решение | Причина |
|---|---|---|
| 2026-11-10 | Desktop GUI — основная поверхность | выбор пользователя |
| 2026-11-10 | TUI — M6, будущее | не в MVP |
| 2026-11-10 | Baseline = user turn, история шагов | требование поэтапного отката |
| 2026-11-10 | Revert в MVP, restore-шаг не удаляет историю | как checkpoint в Cursor |
| 2026-11-10 | Свой Myers, без npm `diff` | контроль git-формата |
| 2026-11-10 | Blobs на диске, индекс в `ctx.storage` | storage — JSON |
| 2026-11-10 | `capture: "tools"` по умолчанию, `"workspace"` опцией | цена/точность |
| 2026-11-10 | `FileDiff.Info` как формат выхода | совместимость с OpenCode |
| 2026-11-10 | Своя панель, не встроенный `Changes` | встроенный review нельзя наполнить своими диффами |
| 2026-11-10 | RPC-вызов проверяем через `/api/rpc/<id>/<method>` с телом `{input}` | так устроен клиент |
| 2026-11-10 | Шаг закрывается по `session.idle` или следующему prompt, а не по чтению | `execution.succeeded` может срабатывать между tool-call'ами |

---

## Блокеры и открытые вопросы

- [ ] `capture: "workspace"` по умолчанию? Допущение: нет.
- [ ] Accept в MVP? Допущение: да.
- [ ] ComposerPill в MVP? Допущение: после.
- [ ] Язык UI: en + ru? Допущение: да.
- [x] Визуальная проверка панели: подтверждена пользователем 2026-11-10.
- [ ] Точные CSS-переменные Desktop — M3.

---

## Прогресс

- **2026-11-10** — исследование API, план переписан под Desktop GUI и
  timeline по запросам, roadmap обновлён.
- **2026-11-10** — M0 принят: панель открывается, RPC отвечает, GUI-фича
  активна. CSS-переменные перенесены в M3.
- **2026-11-10** — M1: реализованы `paths.ts`, `timeline.ts`, `store.ts`,
  `capture.ts`; хуки `prompt`/`execute.before`/`execute.after`, события
  `idle`/`failed`/`interrupted`, blobs на диске, индекс в `ctx.storage`,
  RPC `timeline`/`step`/`reset`. 14 тестов зелёные, сборка и typecheck чистые.
  Ручной прогон: `write` → `added +3`, `edit` → `modified +2 −1`, данные
  пережили перезагрузки плагина.
- **2026-11-10** — M2: реализованы `lines.ts` (Myers), `unified.ts`
  (hunks, function context, no-newline, CRLF), `format.ts` (git-заголовки,
  blob SHA-1, quoting), RPC `file`. 28 тестов, включая 12 golden-кейсов
  против `git diff --no-index`; 10k строк — 7.9 мс.
- **2026-11-10** — M3: реализованы `gui/steps.tsx`, `gui/files.tsx`,
  `gui/diff.tsx`, `gui/parse.ts`, `gui/review.tsx`; диалог ревью,
  drill-down для узкого окна, live-обновление, copy patch, CSS `--diffs-*`.
  Скриншот подтвердил шаги, файлы и diff с номерами строк.
- **2026-11-10** — M4: реализованы `revert` (preflight конфликтов,
  атомарная запись/удаление, restore-шаг, сохранение истории) и `accept`
  (`acceptedStep`, галочки в timeline). UI: кнопки Accept/Restore,
  confirm, conflict-overwrite, тосты. 29/29 тестов.
- **2026-11-10** — per-file действия: `accept`/`revert` с `file`,
  `reviewed` на файле, ✓/↺ в списке файлов и Accept/Restore/Refresh
  в шапке diff; per-file тест, 30/30.
- **2026-11-10** — M5: README, CHANGELOG, скриншоты в `docs/`, матрица
  автоматизирована (`test/matrix.test.ts`), 36/36 тестов; реальная сессия
  проверена через RPC. MVP завершён.
- **Дальше:** M6 — TUI (будущее), либо доработки по фидбеку.
