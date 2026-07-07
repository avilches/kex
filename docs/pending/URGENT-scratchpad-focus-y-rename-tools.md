# URGENTE: continuacion del trabajo de foco del scratchpad + rename OpenInTool

Estado: urgente (registrado 2026-07-07 al cierre de la sesion que mergeo la feature scratchpadRememberFocus).
Origen: handoff de sesion convertido en pending a peticion del usuario.

Contexto base: todo el trabajo esta mergeado en `main` (`6c395d6`, fast-forward; lint + types + 672 tests
en verde sobre el merge). El worktree y la rama `scratchpad-binary-focus` ya no existen. La referencia
canonica del subsistema es `docs/SCRATCHPAD.md` (modelo binario, marca de resume, invariante
`requestLeafFocus` con tabla de call sites, mapa de cierres, timing de eventos).

## Orden de trabajo recomendado

1. **BUG-SP-01** (detalle en `bugs/BUG-SP-01-mouse-pane-return-no-resume.md`): con remember ON, volver a
   un pane clicando su TERMINAL no reabre el scratchpad (con teclado si funciona). PRIMER paso obligatorio:
   reproducir con `pnpm tauri dev` FRESCO (la ronda que lo detecto corria con HMR acumulado y este modulo
   es el del gotcha de estado duplicado). Si persiste: `superpowers:systematic-debugging`, grep previo en
   `docs/*_GOTCHAS.md`, y la traza de timing del guard `focusedNow` de `setLeafTerminalFocused` en
   `docs/SCRATCHPAD.md`.
2. **IMP-SP-02** (detalle en `improvements/IMP-SP-02-test-catalog-scratchpad.md`): integrar el catalogo de
   pruebas SP-01..SP-10 (borrador completo con pasos, esperado y punteros a codigo) en `docs/SCRATCHPAD.md`
   y re-validar en vivo los casos pendientes: SP-02 (tras el bug), SP-05, SP-06, SP-07a-d, SP-09, SP-10.
3. **Rename OpenInEditor -> OpenInTool COMPLETO (frontend + Rust)**, decidido por el usuario el 2026-07-03.
   Crear worktree nuevo en `.claude/worktrees/<rama>` y ejecutar con subagentes + reviews. Inventario:
   - ~13 ficheros frontend: modulo `src/modules/external-editors/` entero (incluido el rename del
     directorio, ~8 importadores via `@/modules/external-editors`), `OpenInEditorButton`/`OpenInEditorTarget`,
     `ExternalEditorsSection.tsx` + id `"external-editors"` de settings section (cruza IPC como string),
     tipos `CustomEditor`/`DetectedEditor`/`EditorGroup`/`EditorTargetType`, `newEditorId()` en
     `src/lib/ids.ts`, glosario de `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/WORKSPACES_GOTCHAS.md`.
   - +4 Rust: `src-tauri/src/modules/editors/` (mod, detect, catalog), comandos IPC `editor_scan` /
     `editor_open` y su registro en `lib.rs`.
   - Claves persistidas: renombrar `textEditorMode` / `preferredFileEditorId` / `preferredWorkspaceEditorId`
     resetea esas prefs de usuario (PERMITIDO: regla del proyecto de no-compat-hacia-atras). Los datos en
     disco ya son neutros: fichero `settings-tools.json`, claves `"custom"` y `"tools"`.
   - La UI visible ya dice "Tools" casi entera; solo queda un fallback "editor" en el tooltip de
     `OpenInEditorButton.tsx` (~linea 203).
   - FALSOS AMIGOS (no tocar nada del editor CodeMirror interno): `src/modules/editor/`,
     `EditorSection.tsx`, prefs `editor*` de store.ts, shortcuts `editor.*`, tab kind `"editor"`,
     `editorHandles`, `tab.newEditor`.
   - Bonus en la misma pasada: el glosario de CLAUDE.md dice que estas prefs persisten en
     `settings-general.json` pero el codigo usa `settings-tools.json`; corregirlo.

## Riesgos de plataforma anotados (sin accion hasta que haya build Windows/Linux)

- Blur con `relatedTarget null` al desactivarse la ventana (Chromium) puede cerrar el scratchpad donde
  WKWebView no lo hace (riesgo F3 historico).
- En Chromium los botones toman foco al click (en WKWebView macOS no): revisar los caminos de
  chrome/restore cuando se pruebe alli.

## Lecciones operativas (para el agente que retome)

- El invariante "todo foco de leaf pasa por `requestLeafFocus`" se ha roto 3 veces en silencio; al tocar
  cualquier cosa que enfoque un leaf, pasar por la tabla de call sites y el checklist de
  `docs/SCRATCHPAD.md`.
- HMR sobre `useTerminalSession.ts` fabrica sintomas fantasma: matar y arrancar `pnpm tauri dev` fresco
  antes de diagnosticar foco. Siempre.
- Lint: `pnpm lint` y `pnpm exec biome lint` estan rotos por el proxy RTK; usar
  `./node_modules/.bin/biome lint ./src`.
- Ningun fix de foco se da por bueno sin prueba en vivo del usuario.
- Handoffs ajenos sin tocar: `HANDOFF-beep-fix.md` y `AUDIT-2026-07-02.md` (raiz del repo) no son de esta
  linea de trabajo.
