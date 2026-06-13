# Terax - Discrepancias entre documentación y código

Verificación de que `AGENTS.md`, `CLAUDE.md`, `docs/*` y la documentación raíz se correspondan con lo que hace el código. La primera es crítica: `ROADMAP.md` describe el producto upstream AI-native que este fork eliminó.

---

## CRÍTICAS

### D3 [critical] `ROADMAP.md` describe un producto AI-native que este fork eliminó

- **Documento:** `ROADMAP.md:12-46`.
- **Afirma:** *"Terax is a fast, lightweight, AI-native terminal (ADE) ... first-class AI agent system ... Keys stored in the OS keychain"*, temas con "Agents, tools, autocomplete, voice", shipped con "AI-context redaction".
- **Realidad:** `docs/FORK.md:14-40` documenta que se eliminó por completo `src/modules/ai/`, `secrets.rs` (keyring), `net.rs` y el AI SDK. `src/modules/ai` no existe; `keyring`/`anthropic`/`openai` no aparecen en `Cargo.toml` ni `package.json`. `README.md` ya está actualizado.
- **Acción:** Reescribir `ROADMAP.md` acorde al fork no-AI (como ya se hizo con README), o eliminarlo. Hoy es documentación del upstream pegada sin revisar.

---

## HIGH

### D4 [high] `SECURITY.md` describe subsistemas AI ya eliminados

- **Documento:** `SECURITY.md` ("What we do to keep things safe", "What's in scope").
- **Afirma:** *"API keys live in the OS keychain via keyring"*, "talks to AI providers", "AI tool approval. File writes and shell commands from the agent need your OK", scope incluye "AI tool results, credentials".
- **Realidad:** keyring y el subsistema AI fueron removidos (`FORK.md:14-40`). No hay almacén de API keys, ni aprobación de herramientas, ni proveedores AI.
- **Acción:** Actualizar `SECURITY.md`: eliminar keyring/AI/tool-approval y ajustar el scope a lo que el fork expone (PTY, FS, IPC, plugins, updater).

---

## MEDIUM

### D5 [medium] Nombre del fichero de persistencia incorrecto en `AGENTS.md`

- **Documento:** `AGENTS.md:126`.
- **Afirma:** estado persistido en `workspace-state.json` vía `tauri-plugin-store`, debounced 300 ms.
- **Realidad:** el fichero es `workspaces.json` (`src-tauri/src/lib.rs:292`), persistido por ventana vía el comando `window_save_workspace_state`. `docs/WORKSPACES.md:30` lo nombra bien. El debounce real en `App.tsx` es 800 ms, no 300.
- **Acción:** Corregir `AGENTS.md` a `workspaces.json`, persistencia por-ventana vía `window_save_workspace_state`, y el debounce a 800 ms.

---

## LOW

### D6 [low] `ARCHITECTURE.md` afirma staging por hunks que no existe

- **Documento:** `docs/ARCHITECTURE.md:123`.
- **Afirma:** *"You can stage / unstage individual files or hunks."*
- **Realidad:** No hay staging por hunks (búsqueda de `hunk|stage_hunk|apply.*patch` en `git/` y `source-control/` vacía). Solo `git_stage`/`git_unstage` por fichero.
- **Acción:** Quitar "or hunks" **o** implementarlo (ver `review/features/F2-stage-unstage-por-hunk.md`).

### D7 [low] El diff es unificado (inline), no side-by-side; la doc debería precisarlo

- **Documento:** `docs/ARCHITECTURE.md:123,195,261`.
- **Afirma:** describe el diff genéricamente como "the CodeMirror merge extension" y "diff decorations". No afirma side-by-side, así que técnicamente no hay mentira en la doc. Pero el código usa `unifiedMergeView` (inline, una columna), no `MergeView` side-by-side.
- **Realidad:** `src/modules/editor/GitDiffPane.tsx:5,207` usa `unifiedMergeView`.
- **Acción:** Precisar en la doc "unified (inline) merge view". Nota importante: el doble panel side-by-side es un objetivo de producto del usuario que hoy no está implementado, ver `review/features/F1-diff-side-by-side.md`.

### D8 [low] `docs/IPC.md` no documenta `restore_window_geometry`

- **Realidad:** Registrado en `lib.rs:409`, ausente de la sección "Misc" de `IPC.md`. Es el único comando registrado no documentado en IPC.md (los 153 listados existen todos en el código).
- **Acción:** Añadirlo a `docs/IPC.md`.

### D9 [low] `AGENTS.md` omite el módulo `fs::watch::*` y el script `init.fish`

- **Realidad:** `fs_watch_add`/`fs_watch_remove` existen y se registran pero `AGENTS.md` no los menciona en la descripción de `fs::*` (sí están en IPC.md). El script `src-tauri/src/modules/pty/scripts/init.fish` existe y `ARCHITECTURE.md`/README listan fish como shell soportado, pero la sección "PTY shell integration" de `AGENTS.md` solo enumera zsh/bash/Windows.
- **Acción:** Añadir `fs::watch::*` a la descripción de `fs::*` y `init.fish` a la lista de scripts de shell en `AGENTS.md`.

---

## Resumen IPC: documentados vs registrados

- 44 comandos registrados en `lib.rs:349-415`. Todos los 153 entries de `docs/IPC.md` existen en el código (ningún comando documentado fantasma).
- **Faltante en IPC.md:** solo `restore_window_geometry` (D8).
- `AGENTS.md` es overview, no superficie exhaustiva, y omite varios comandos (`fs_grep_interactive`, `history_*`, `window_*`, `pty_has_foreground_process`, `pty_shell_name`, etc.); severidad baja porque remite a IPC.md.
