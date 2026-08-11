# Pendiente

Bugs, features y mejoras identificadas pero no programadas. Ver detalles en `docs/pending/`.

> Auditoria 2026-06-23 contra el codigo: ver [AUDIT-2026-06-23.md](pending/AUDIT-2026-06-23.md) para el detalle de que se elimino (ya corregido), que cambio de estado y que sigue vigente.
> Auditoria 2026-06-30: F1 (diff side-by-side) COMPLETADO y eliminado. Ver notas de cada item para estado actualizado.
> Auditoria 2026-07-02 (7 agentes, ~74k lineas, frontend + Rust): ver [AUDIT-2026-07-02.md](pending/AUDIT-2026-07-02.md). Backlog amplio pendiente de triaje: seguridad (sandbox html-preview, log de prompts en /tmp), leak de thread IPC por tab cerrada, colision de claves entre stores de settings, comandos Rust sincronos que congelan la UI, codigo muerto y duplicado. La cabecera del informe lista lo YA resuelto por la cadena del scratchpad (2026-07-03..06).

---

## URGENTE

- [URGENT-scratchpad-focus-y-rename-tools](pending/URGENT-scratchpad-focus-y-rename-tools.md) - Continuacion inmediata del trabajo mergeado en `6c395d6`: (1) BUG-SP-01 (pane return con raton no reabre el SP, re-probar con proceso fresco), (2) IMP-SP-02 (integrar catalogo de pruebas SP-XX en SCRATCHPAD.md y re-validar casos pendientes), (3) rename completo OpenInEditor -> OpenInTool (frontend + Rust, inventario y decisiones dentro)

## Bugs (`docs/pending/bugs/`)

- [BUG-04](pending/bugs/BUG-04-diff-editor-reconstruido-por-cambio.md) — Diff editor reconstruido por cambio de dep
- [BUG-14](pending/bugs/BUG-14-git-show-truncamiento-blobs-memoria.md) — git show: truncamiento de blobs en memoria (alcance reducido: el diff principal ya propaga `truncated` via `diff_inner`; solo afecta el flujo git-history/commit-file)
- [BUG-17](pending/bugs/BUG-17-busqueda-ipc-sin-cancelacion.md) — Busqueda IPC sin cancelacion (fs_search resuelto; fs_grep_interactive pendiente)
- [BUG-38](pending/bugs/BUG-38-busqueda-cmdF-incompleta.md) - Cmd+F: no busca en markdown/git-diff (terminal y editor resueltos)
- [BUG-39](pending/bugs/BUG-39-file-search-ux-poco-clara.md) - Busqueda de ficheros: UX poco clara (no es bug de codigo; los atajos funcionan, falta descubribilidad: tratar como mejora de UI)
- [BUG-40](pending/bugs/BUG-40-stage-unstage-all-incompleto.md) — Stage all / unstage all no procesa todos los ficheros (la logica de pathspecs parece correcta; el sintoma cuelga probablemente de BUG-06, renames sin original_rel. Reproducir antes de fix)
- [BUG-42](pending/bugs/BUG-42-borrar-fichero-con-editor-abierto.md) — Borrar un fichero con el editor abierto: el editor muestra un error rojo generico (string crudo de IPC, sin distinguir ENOENT ni ofrecer accion) y la vista de diff no reacciona (contenido obsoleto). Definir mejor UX
- [BUG-43](pending/bugs/BUG-43-restore-claude-code-con-worktree.md) — Restore de Claude Code cuando ha creado un worktree (sin verificar)
- [BUG-SP-01](pending/bugs/BUG-SP-01-mouse-pane-return-no-resume.md) - Scratchpad (remember ON): volver a un pane con el raton no reabre el SP (teclado si funciona). Reproducir con proceso fresco antes de investigar (sospecha HMR)
- [BUG-44](pending/bugs/BUG-44-macos-beep-shortcuts.md) - macOS: beep del sistema con Cmd+Ctrl+Flecha (navegacion de panes). Causa raiz confirmada (WKWebView -> interpretKeyEvents -> NSBeep), 2 intentos fallidos documentados, plan: responder chain sink (Opcion B) con fallback a NSEvent monitor (Opcion A)
- [BUG-45](pending/bugs/BUG-45-htmltomarkdown-alt-link-text-sin-escapar.md) - htmlToMarkdown: alt de imagen y texto de link sin escapar caracteres markdown-significativos (`]`, `)`, `|`). Hueco de la spec original del editor rich, no defecto de implementacion
- [BUG-46](pending/bugs/BUG-46-htmltomarkdown-tabla-vacia-no-se-descarta.md) - htmlToMarkdown: una tabla de 0 filas no se descarta como el parrafo vacio, deja una linea espuria. Cosmetico, muy improbable desde el editor real
- [BUG-47](pending/bugs/BUG-47-htmltomarkdown-br-br-p-idempotencia-lenta.md) - htmlToMarkdown: `<br><br>` seguido de `<p>` hermano en una lista tarda 2 pasadas extra en estabilizar (caso residual de una familia de bugs de idempotencia ya mayormente arreglada)
- [BUG-48](pending/bugs/BUG-48-details-comentario-obsoleto-pos-0.md) - details.ts: comentario sobre un bug "pos-0" de `@tiptap/extension-details` puede estar obsoleto en la version fijada; solo doc, codigo ya es seguro sin el
- [BUG-49](pending/bugs/BUG-49-wikilink-ambiguo-pierde-alias-y-anchor.md) - Wiki-link ambiguo (`[[Titulo]]` que matchea varios ficheros) pierde el alias del pipe y el anchor heading/block al resolver. Simplificacion deliberada del brief original, edge case real
- [BUG-50](pending/bugs/BUG-50-shortcut-legacy-toggleview-inerte-markdown.md) - Shortcut legacy `editor.markdown.toggleView` queda inerte (no hace nada) para tabs markdown con el editor rich activo
- [BUG-52](pending/bugs/BUG-52-notes-hygiene-varios.md) - Varios items de correccion y limpieza de bajo impacto en el stack de notas (payload muerto, lectura corta en `read_head`, fecha incorrecta en orden "Created", estado colgado en `kex.json`, last-writer-wins entre ventanas)
- [BUG-53](pending/bugs/BUG-53-autosave-flush-resucita-fichero-borrado-o-renombrado.md) - El flush de autosave al desmontar o cambiar de path resucita un fichero borrado o renombrado (afecta tabs markdown y editor con cambios sin guardar; preexistente en `main`, la vista de notas lo hace el camino mas comun)

## WIP en ramas

- [F16](pending/features/F16-sidebar-slide-animation.md) — Animacion slide del panel lateral (rama `worktree-feat+sidebar-slide-animation`, baja prioridad, incompleto)

## Features (`docs/pending/features/`)

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
- [IMP-SP-02](pending/improvements/IMP-SP-02-test-catalog-scratchpad.md) - Catalogo de pruebas con codigo (SP-XX) para los invariantes del scratchpad: pasos, esperado y punteros a codigo por caso; integrarlo en docs/SCRATCHPAD.md y re-validar los casos pendientes (borrador completo en el fichero)
- [M9](pending/improvements/M9-rebind-rename-f2-shift-f6.md) — Rebind del atajo de rename: F2 -> Shift+F6
- [M10](pending/improvements/M10-rendimiento-busqueda-ficheros.md) — Rendimiento de la busqueda de ficheros (fs_search async/paralelo/cancelable + tuning de contenido)
- [M11](pending/improvements/M11-codelangdropdown-lenguaje-actual-y-auto.md) - CodeLangDropdown: mostrar el lenguaje actual del bloque de codigo y anadir opcion "Auto" para resetear
- [M12](pending/improvements/M12-consolidar-dropdowns-editor-rich.md) - Consolidar las 6 implementaciones de dropdown/floating-menu del editor rich (Toolbar, SlashMenu, WikiLinkMenu, CodeLangDropdown) en un componente compartido
- [M13](pending/improvements/M13-toolbar-table-picker-hover-stale.md) - Toolbar: el hover del table-size picker queda obsoleto si se cierra sin elegir tamano (cosmetico, heredado de HelixNotes)
- [M14](pending/improvements/M14-markdowntab-autofocus-visible-focused.md) - MarkdownTab: props `visible`/`focused` sin usar, sin autofocus del editor rich al activar el tab (a diferencia de los tabs de editor CodeMirror)
- [M15](pending/improvements/M15-emdash-shortcuts-ts.md) - Dos em-dashes preexistentes en `shortcuts.ts` (~lineas 362 y 444), sin relacion con el editor markdown; rollar en un futuro barrido de em-dashes de todo el proyecto
- [M16](pending/improvements/M16-markdown-prefs-no-reactivas-en-tab-abierto.md) - Nota informativa (no bug): `markdownEditor`/`markdownWikiLinks` no son reactivas en un tab ya abierto, se leen solo al montar; documentado para que no se redescubra como regresion, mas direccion opcional para hacerlas reactivas
- [IMP-MD-01](pending/improvements/IMP-MD-01-verificacion-manual-editor-rich.md) - Checklist de verificacion manual del editor markdown rich (18 grupos de escenarios, artifact interactivo). En curso: 1 bug real ya encontrado y arreglado (autosave al cerrar, rama `worktree-fix-close-without-autosave`), quedan ~17 grupos por confirmar
- [IMP-NOTES-01](pending/improvements/IMP-NOTES-01-duplicado-basename.md) - Helper `baseName`/`basename` duplicado en `CollectionsColumn.tsx`, `NoteRow.tsx` y `NotesView.tsx`; ya existe una version equivalente en `tabTitle.tsx`
- [IMP-NOTES-02](pending/improvements/IMP-NOTES-02-drag-listeners-durante-rename.md) - Listeners de drag activos durante el rename inline de una nota en sort mode "custom" (fix de una linea)
- [IMP-NOTES-03](pending/improvements/IMP-NOTES-03-sin-indicador-de-carga.md) - Sin indicador visual de carga en la lista de notas durante el primer escaneo de un vault grande
- [IMP-NOTES-04](pending/improvements/IMP-NOTES-04-navegacion-teclado.md) - Navegacion por teclado (flechas + Enter) en filas de nota y carpeta, igualando al explorer
- [IMP-NOTES-05](pending/improvements/IMP-NOTES-05-preview-tab-no-implementado.md) - Click simple y doble click se comportan igual al abrir una nota; los tabs markdown no tienen modo preview

## Contexto adicional (`docs/pending/`)

- [MODAL_MESSAGES.md](pending/MODAL_MESSAGES.md) — Modales destructivos de git: textos de discard por caso (el modal generico "miente" diciendo "can't be undone" hasta cuando no hay perdida), feedback de resultado, e iconos de los botones de accion (que comuniquen reversible como unstage vs destructivo como discard)
- [BUGS.md](pending/BUGS.md) — Resumen ejecutivo de todos los bugs
- [DOCS.md](pending/DOCS.md) — Notas de documentacion pendiente
- [README.md](pending/README.md) — Descripcion general del contenido de pending
