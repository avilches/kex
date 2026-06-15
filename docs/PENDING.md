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
- [BUG-16](pending/bugs/BUG-16-windowcontrols-leak-onresized.md) — WindowControls: leak en onResized
- [BUG-17](pending/bugs/BUG-17-busqueda-ipc-sin-cancelacion.md) — Busqueda IPC sin cancelacion
- [BUG-18](pending/bugs/BUG-18-race-refetch-fs-changed-explorer.md) — Race entre refetch y fs-changed en explorer
- [BUG-19](pending/bugs/BUG-19-temas-custom-colores-sin-validar.md) — Temas custom: colores sin validar
- [BUG-20](pending/bugs/BUG-20-pty-open-autoriza-cwd-aunque-spawn-falle.md) — pty_open autoriza cwd aunque spawn falle
- [BUG-21](pending/bugs/BUG-21-workspaceregistry-sin-cota-on.md) — WorkspaceRegistry sin cota en listeners
- [BUG-24](pending/bugs/BUG-24-respawnsession-dormantring-bytes-en-vuelo.md) — respawnSession: bytes en vuelo del DormantRing
- [BUG-25](pending/bugs/BUG-25-doble-destroy-cierre-ultimo-panel.md) — Doble destroy al cerrar ultimo panel
- [BUG-26](pending/bugs/BUG-26-diff-effect-source-dep-recreated.md) — Diff effect: source dep recreada en cada render
- [BUG-27](pending/bugs/BUG-27-countdifflines-heuristic-not-numstat.md) — countDiffLines: heuristica, no numstat
- [BUG-28](pending/bugs/BUG-28-parse-renamed-empty-path-truncated.md) — parse renamed: empty path en truncado
- [BUG-29](pending/bugs/BUG-29-path-split-forward-slash-only.md) — Path split solo por forward-slash
- [BUG-30](pending/bugs/BUG-30-fs-mutations-autosave-swallow-errors.md) — fs mutations + autosave silencian errores
- [BUG-31](pending/bugs/BUG-31-theme-preview-stale-after-close.md) — Theme preview stale al cerrar settings
- [BUG-32](pending/bugs/BUG-32-selectbyindex-matcher-skips-key-guard.md) — selectByIndex matcher salta key guard
- [BUG-33](pending/bugs/BUG-33-segmentsfromcwd-case-sensitive-home-windows.md) — segmentsFromCwd: case-sensitive en home Windows
- [BUG-34](pending/bugs/BUG-34-cd-quoting-breaks-cmd-fallback.md) — cd quoting rompe fallback a cmd.exe
- [BUG-35](pending/bugs/BUG-35-usepresence-mounted-in-deps-reentrancy.md) — usePresence: mounted en deps causa reentrancy
- [BUG-36](pending/bugs/BUG-36-block-menu-desaparece-bloque-largo.md) - Menu de acciones de bloque desaparece en bloques muy largos
- [BUG-37](pending/bugs/BUG-37-blocks-atajos-rotos.md) - Blocks: sin hotkey para nuevo block terminal; Cmd+U switch no funciona
- [BUG-38](pending/bugs/BUG-38-busqueda-cmdF-incompleta.md) - Cmd+F: no busca en documentos; terminal search sin navegacion entre resultados
- [BUG-39](pending/bugs/BUG-39-file-search-ux-poco-clara.md) - Busqueda de ficheros: UX poco clara (solo via Cmd+P + #?)

## Features (`docs/pending/features/`)

- [F1](pending/features/F1-diff-side-by-side.md) — Diff side-by-side
- [F2](pending/features/F2-stage-unstage-por-hunk.md) — Stage/unstage por hunk
- [F3](pending/features/F3-navegacion-hunks.md) — Navegacion entre hunks
- [F5](pending/features/F5-reabrir-tab-cerrado.md) — Reabrir tab cerrado
- [F6](pending/features/F6-scrollback-persistente.md) — Scrollback persistente
- [F7](pending/features/F7-tab-bar-style-en-settings.md) — Exponer el estilo de tab bar en Settings

## Mejoras (`docs/pending/improvements/`)

- [M1](pending/improvements/M1-memoizacion-arbol-workspaces.md) — Memoizacion del arbol de workspaces
- [M2](pending/improvements/M2-lazy-modulo-agents.md) — Lazy loading del modulo agents
- [M3](pending/improvements/M3-hunks-estructurados-backend.md) — Hunks estructurados en backend
- [M4](pending/improvements/M4-cancelacion-busqueda-ipc.md) — Cancelacion de busqueda IPC
- [M5](pending/improvements/M5-diff-grandes-worker.md) — Diffs grandes en Web Worker
- [M6](pending/improvements/M6-reaping-bg-procs-y-registry.md) — Reaping de procesos background y registry
- [M7](pending/improvements/M7-quick-wins.md) — Quick wins varios
- [M8](pending/improvements/M8-release-appimage-wayland-updater-sig.md) — Adoptar sistema de release de AppImage del upstream (fix libwayland + sig race-free)

## Contexto adicional (`docs/pending/`)

- [BUGS.md](pending/BUGS.md) — Resumen ejecutivo de todos los bugs
- [DOCS.md](pending/DOCS.md) — Notas de documentacion pendiente
- [README.md](pending/README.md) — Descripcion general del contenido de pending
