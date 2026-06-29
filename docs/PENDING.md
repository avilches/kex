# Pendiente

Bugs, features y mejoras identificadas pero no programadas. Ver detalles en `docs/pending/`.

> Auditoria 2026-06-23 contra el codigo: ver [AUDIT-2026-06-23.md](pending/AUDIT-2026-06-23.md) para el detalle de que se elimino (ya corregido), que cambio de estado y que sigue vigente.

---

## Bugs (`docs/pending/bugs/`)

- [BUG-04](pending/bugs/BUG-04-diff-editor-reconstruido-por-cambio.md) — Diff editor reconstruido por cambio de dep
- [BUG-14](pending/bugs/BUG-14-git-show-truncamiento-blobs-memoria.md) — git show: truncamiento de blobs en memoria (alcance reducido: el diff principal ya propaga `truncated` via `diff_inner`; solo afecta el flujo git-history/commit-file)
- [BUG-17](pending/bugs/BUG-17-busqueda-ipc-sin-cancelacion.md) — Busqueda IPC sin cancelacion (fs_search resuelto; fs_grep_interactive pendiente)
- [BUG-38](pending/bugs/BUG-38-busqueda-cmdF-incompleta.md) - Cmd+F: no busca en markdown/git-diff (terminal y editor resueltos)
- [BUG-39](pending/bugs/BUG-39-file-search-ux-poco-clara.md) - Busqueda de ficheros: UX poco clara (no es bug de codigo; los atajos funcionan, falta descubribilidad: tratar como mejora de UI)
- [BUG-40](pending/bugs/BUG-40-stage-unstage-all-incompleto.md) — Stage all / unstage all no procesa todos los ficheros (la logica de pathspecs parece correcta; el sintoma cuelga probablemente de BUG-06, renames sin original_rel. Reproducir antes de fix)
- [BUG-42](pending/bugs/BUG-42-borrar-fichero-con-editor-abierto.md) — Borrar un fichero con el editor abierto: el editor muestra un error rojo generico (string crudo de IPC, sin distinguir ENOENT ni ofrecer accion) y la vista de diff no reacciona (contenido obsoleto). Definir mejor UX
- [BUG-43](pending/bugs/BUG-43-restore-claude-code-con-worktree.md) — Restore de Claude Code cuando ha creado un worktree (sin verificar)

## WIP en ramas

- [F16](pending/features/F16-sidebar-slide-animation.md) — Animacion slide del panel lateral (rama `worktree-feat+sidebar-slide-animation`, baja prioridad, incompleto)

## Features (`docs/pending/features/`)

- [F1](pending/features/F1-diff-side-by-side.md) — Diff side-by-side
- [F2](pending/features/F2-stage-unstage-por-hunk.md) — Stage/unstage por hunk
- [F3](pending/features/F3-navegacion-hunks.md) — Navegacion entre hunks
- [F6](pending/features/F6-scrollback-persistente.md) — Scrollback persistente
- [F7](pending/features/F7-tab-bar-style-en-settings.md) — Exponer el estilo de tab bar en Settings
- [F10](pending/features/F10-confirm-quit-proceso-vivo.md) — Confirmar salida de la app con un proceso de terminal vivo (upstream d782f7d, aplazado en sync 2026-06-22)
- [F13](pending/features/F13-workspace-mostrar-prs-repo.md) - Workspace: mostrar PRs del repo (lista de PRs via gh CLI / GitHub API)
- [F14](pending/features/F14-pr-de-la-rama-actual.md) - PR de la rama actual (IPC `git_current_pr`, gh con fallback a REST via ureq). Base tecnica de F13 y del punto 3 de "barra superior" en TODO.md
- [F15](pending/features/F15-blocks-improvements.md) - Mejoras del sistema de blocks: collapse de outputs largos (B1), filtrado (B2), persistencia de historial (B3), panel command-history (B4), export (B5), notebooks (B6)

## Mejoras (`docs/pending/improvements/`)

- [M2](pending/improvements/M2-lazy-modulo-agents.md) — Lazy loading del modulo agents
- [M3](pending/improvements/M3-hunks-estructurados-backend.md) — Hunks estructurados en backend
- [M4](pending/improvements/M4-cancelacion-busqueda-ipc.md) — Cancelacion de busqueda IPC
- [M5](pending/improvements/M5-diff-grandes-worker.md) — Diffs grandes en Web Worker
- [M6](pending/improvements/M6-reaping-bg-procs-y-registry.md) — Reaping de procesos background y registry
- [M7](pending/improvements/M7-quick-wins.md) — Quick wins varios (parcial: ~11/15 ya hechos; quedan items 5 (parcial), 13, 14)
- [M8](pending/improvements/M8-release-appimage-wayland-updater-sig.md) — Adoptar sistema de release de AppImage del upstream (fix libwayland + sig race-free)
- [M9](pending/improvements/M9-rebind-rename-f2-shift-f6.md) — Rebind del atajo de rename: F2 -> Shift+F6
- [M10](pending/improvements/M10-rendimiento-busqueda-ficheros.md) — Rendimiento de la busqueda de ficheros (fs_search async/paralelo/cancelable + tuning de contenido)

## Contexto adicional (`docs/pending/`)

- [MODAL_MESSAGES.md](pending/MODAL_MESSAGES.md) — Modales destructivos de git: textos de discard por caso (el modal generico "miente" diciendo "can't be undone" hasta cuando no hay perdida), feedback de resultado, e iconos de los botones de accion (que comuniquen reversible como unstage vs destructivo como discard)
- [BUGS.md](pending/BUGS.md) — Resumen ejecutivo de todos los bugs
- [DOCS.md](pending/DOCS.md) — Notas de documentacion pendiente
- [README.md](pending/README.md) — Descripcion general del contenido de pending
