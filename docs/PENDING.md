# Pendiente

Bugs, features y mejoras identificadas pero no programadas. Ver detalles en `docs/pending/`.

---

## Bugs (`docs/pending/bugs/`)

- [BUG-02](pending/bugs/BUG-02-diff-no-normaliza-crlf.md) — Diff no normaliza CRLF
- [BUG-03](pending/bugs/BUG-03-autosave-timer-perdido-al-desmontar.md) — Autosave: timer perdido al desmontar
- [BUG-04](pending/bugs/BUG-04-diff-editor-reconstruido-por-cambio.md) — Diff editor reconstruido por cambio de dep
- [BUG-05](pending/bugs/BUG-05-diffs-grandes-umbral-solo-bytes.md) — Diffs grandes: umbral solo en bytes
- [BUG-06](pending/bugs/BUG-06-diff-rename-staged-pathspec-incompleto.md) — Diff rename staged: pathspec incompleto
- [BUG-07](pending/bugs/BUG-07-split-name-status-numstat-heuristica-tab.md) — Split name-status/numstat: heuristica por tab
- [BUG-08](pending/bugs/BUG-08-fuga-procesos-background-shellstate.md) — Fuga de procesos background en ShellState
- [BUG-11](pending/bugs/BUG-11-flag-truncated-ignorado-cliente.md) — Flag `truncated` ignorado en el cliente
- [BUG-12](pending/bugs/BUG-12-toctou-auto-autorizacion-repo-root.md) — TOCTOU en auto-autorizacion de repo root
- [BUG-13](pending/bugs/BUG-13-deteccion-binario-8kb-incoherente.md) — Deteccion de binario con 8 KB incoherente
- [BUG-14](pending/bugs/BUG-14-git-show-truncamiento-blobs-memoria.md) — git show: truncamiento de blobs en memoria
- [BUG-15](pending/bugs/BUG-15-usefiletree-callbacks-inestables.md) — useFileTree: callbacks inestables
- [BUG-17](pending/bugs/BUG-17-busqueda-ipc-sin-cancelacion.md) — Busqueda IPC sin cancelacion (fs_search resuelto; fs_grep_interactive pendiente)
- [BUG-18](pending/bugs/BUG-18-race-refetch-fs-changed-explorer.md) — Race entre refetch y fs-changed en explorer
- [BUG-20](pending/bugs/BUG-20-pty-open-autoriza-cwd-aunque-spawn-falle.md) — pty_open autoriza cwd aunque spawn falle
- [BUG-27](pending/bugs/BUG-27-countdifflines-heuristic-not-numstat.md) — countDiffLines: heuristica, no numstat
- [BUG-28](pending/bugs/BUG-28-parse-renamed-empty-path-truncated.md) — parse renamed: empty path en truncado
- [BUG-30](pending/bugs/BUG-30-fs-mutations-autosave-swallow-errors.md) — fs mutations + autosave silencian errores
- [BUG-34](pending/bugs/BUG-34-cd-quoting-breaks-cmd-fallback.md) — cd quoting rompe fallback a cmd.exe
- [BUG-38](pending/bugs/BUG-38-busqueda-cmdF-incompleta.md) - Cmd+F: no busca en markdown/git-diff (terminal y editor resueltos)
- [BUG-39](pending/bugs/BUG-39-file-search-ux-poco-clara.md) - Busqueda de ficheros: UX poco clara (solo via Cmd+P + #?)
- [BUG-40](pending/bugs/BUG-40-stage-unstage-all-incompleto.md) — Stage all / unstage all no procesa todos los ficheros
- [BUG-41](pending/bugs/BUG-41-explore-root-por-editor-restore.md) — Explore root por editor: persistencia y restore sin verificar
- [BUG-42](pending/bugs/BUG-42-borrar-fichero-con-editor-abierto.md) — Borrar un fichero con el editor abierto (sin verificar)
- [BUG-43](pending/bugs/BUG-43-restore-claude-code-con-worktree.md) — Restore de Claude Code cuando ha creado un worktree (sin verificar)

## Features (`docs/pending/features/`)

- [F1](pending/features/F1-diff-side-by-side.md) — Diff side-by-side
- [F2](pending/features/F2-stage-unstage-por-hunk.md) — Stage/unstage por hunk
- [F3](pending/features/F3-navegacion-hunks.md) — Navegacion entre hunks
- [F5](pending/features/F5-reabrir-tab-cerrado.md) — Reabrir tab cerrado
- [F6](pending/features/F6-scrollback-persistente.md) — Scrollback persistente
- [F7](pending/features/F7-tab-bar-style-en-settings.md) — Exponer el estilo de tab bar en Settings
- [F8](pending/features/F8-explorer-navegacion-teclado.md) — Navegacion del explorer por teclado
- [F9](pending/features/F9-explorer-operaciones-fichero.md) — Operaciones de fichero en el explorer (duplicar, copiar/pegar, cortar, borrar) + limpieza del menu
- [F10](pending/features/F10-confirm-quit-proceso-vivo.md) — Confirmar salida de la app con un proceso de terminal vivo (upstream d782f7d, aplazado en sync 2026-06-22)

## Mejoras (`docs/pending/improvements/`)

- [M1](pending/improvements/M1-memoizacion-arbol-workspaces.md) — Memoizacion del arbol de workspaces
- [M2](pending/improvements/M2-lazy-modulo-agents.md) — Lazy loading del modulo agents
- [M3](pending/improvements/M3-hunks-estructurados-backend.md) — Hunks estructurados en backend
- [M4](pending/improvements/M4-cancelacion-busqueda-ipc.md) — Cancelacion de busqueda IPC
- [M5](pending/improvements/M5-diff-grandes-worker.md) — Diffs grandes en Web Worker
- [M6](pending/improvements/M6-reaping-bg-procs-y-registry.md) — Reaping de procesos background y registry
- [M7](pending/improvements/M7-quick-wins.md) — Quick wins varios
- [M8](pending/improvements/M8-release-appimage-wayland-updater-sig.md) — Adoptar sistema de release de AppImage del upstream (fix libwayland + sig race-free)
- [M9](pending/improvements/M9-rebind-rename-f2-shift-f6.md) — Rebind del atajo de rename: F2 -> Shift+F6
- [M10](pending/improvements/M10-rendimiento-busqueda-ficheros.md) — Rendimiento de la busqueda de ficheros (fs_search async/paralelo/cancelable + tuning de contenido)

## Contexto adicional (`docs/pending/`)

- [MODAL_MESSAGES.md](pending/MODAL_MESSAGES.md) — Mensajes de modales destructivos (discard por caso + feedback de resultado)
- [BUGS.md](pending/BUGS.md) — Resumen ejecutivo de todos los bugs
- [DOCS.md](pending/DOCS.md) — Notas de documentacion pendiente
- [README.md](pending/README.md) — Descripcion general del contenido de pending
