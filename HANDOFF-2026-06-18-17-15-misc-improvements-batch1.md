> [!NOTE]
> **Active handoff:** Esta nota registra donde quedo la sesion anterior — solo informativa.
> Para retomar el trabajo, ejecuta `/handoff load` (solo lectura: resume el estado y continua).
> NO ejecutes `/handoff` sin argumento ni regeneres nada solo porque este fichero este cargado en contexto.

## Branch / worktree

- **Branch:** `worktree-feat+misc-improvements-batch1`
- **Worktree:** `.claude/worktrees/feat+misc-improvements-batch1`
- **Base branch:** `main`

## Archivos modificados / creados

Solo documentacion — no hay cambios de codigo todavia:

- `docs/superpowers/specs/2026-06-18-misc-improvements-batch1.md` — spec de los 5 items
- `docs/superpowers/plans/2026-06-18-misc-improvements-batch1.md` — plan de implementacion con 5 tareas y TDD

## Artefactos

- **Spec:** `docs/superpowers/specs/2026-06-18-misc-improvements-batch1.md`
- **Plan:** `docs/superpowers/plans/2026-06-18-misc-improvements-batch1.md`

## Contexto de esta sesion

Se hizo brainstorming completo de 5 mejoras independientes, con preguntas aclaratorias al usuario:

1. **JSONL path en hover del agente** — mostrar `transcript_path` en el hover card del agente. El campo ya
   llega al backend Rust en `SessionStart` pero no se reenvía al frontend. Solución: añadir
   `transcriptPath` al payload de `kex:agent-session-meta` y al tipo `AgentSessionMeta`.

2. **Bug drag-tab con scroll** — cuando un tab está parcialmente oculto a la izquierda y se arrastra, el
   ghost aparece muy lejos del cursor. Causa: `onDragStart` de `useDndMonitor` resetea `scrollLeft=0`
   demasiado tarde (dnd-kit ya midió el offset). Solución: envolver `listeners.onPointerDown` en
   `DraggableTab` para hacer `scrollIntoView` síncrono antes de que dnd-kit capture la posición.

3. **Cmd+Shift+C copia ruta** — nuevo shortcut `path.copy`. Copia `panel.path` (editor/markdown),
   `panel.cwd` (terminal) o `panel.url` (preview). Muestra toast "Path copied".

4. **Tabs persistibles** — dos propiedades independientes en `terminal` Panel:
   - `restoreOnRestart?: boolean` + `persistentCommand?: string` — guarda el comando y lo reenvía al PTY
     (~300ms delay) cuando el terminal monta en el arranque.
   - `locked?: boolean` — reemplaza la X por un icono de candado (`LockIcon` de hugeicons confirmado).
     Cmd+W no-op cuando locked. Click en el candado lo desbloquea.
   - Los toggles van en el hover card de terminales (`TerminalHoverCardContent`).
   - La propificación requiere threading de `onUpdatePanel` prop por `PaneTabBar` -> `DraggableTab`.

5. **Cmd+I / Cmd+Shift+I notificaciones** — intercambio de bindings:
   - `notifications.toggle` pasa a `Cmd+Shift+I`
   - Nuevo `notifications.jumpToLast` en `Cmd+I` — salta al panel de `notifications[0]` (el mas reciente)
     usando `onActivateAgent(first.tabId, first.panelId)`.

Baseline: 297 tests pasando, `pnpm check-types` limpio.

## Lecciones aprendidas

- En `PaneTabBar.tsx`, la función `registerTerminalHandle` en App.tsx tiene acceso a `findPanelGlobal`
  en su closure — se puede usar ahí para la lógica de restore-on-restart.
- `LockIcon` existe en `@hugeicons/core-free-icons` (confirmado).
- El `onDragStart` de `useDndMonitor` es post-captura — cualquier scroll allí llega tarde. El fix
  correcto es pre-captura via `onPointerDown` wrapper en el elemento draggable.
- Los archivos creados con path absoluto antes de entrar al worktree van al repo principal, no al worktree.
  Creados en el repo principal y copiados al worktree manualmente en esta sesion.

## Pending work / Next steps

Ejecutar las 5 tareas del plan **en orden** (son independientes pero el plan las numera del 1 al 5):

1. **Task 1:** JSONL path en hover del agente
   - Rust: `src-tauri/src/modules/pty/ipc.rs` linea ~147 — añadir `"transcriptPath": p.transcript_path`
   - TS types: `src/modules/agents/lib/types.ts` — `transcriptPath?: string` en `AgentSessionMeta`
   - Bridge: `src/modules/agents/components/AgentNotificationsBridge.tsx`
   - Test: `src/modules/agents/store/agentStore.test.ts`
   - UI: `src/modules/workspaces/PaneTabBar.tsx` — `AgentHoverCardContent`

2. **Task 2:** Bug drag-tab con scroll
   - Solo `src/modules/workspaces/PaneTabBar.tsx`
   - Envolver `listeners.onPointerDown` con `useMemo` en `DraggableTab`
   - Eliminar `container.scrollLeft = 0` del `onDragStart` de `useDndMonitor`

3. **Task 3:** Shortcut Cmd+Shift+C
   - `src/modules/shortcuts/shortcuts.ts` — nuevo `path.copy`
   - `src/app/App.tsx` — handler
   - `src/modules/shortcuts/shortcuts.test.ts` — test

4. **Task 4:** Tabs persistibles (la mas compleja)
   - `src/modules/workspaces/lib/types.ts` — campos nuevos en terminal Panel
   - `src/modules/workspaces/PaneTabBar.tsx` — lock icon, toggles en hover, prop threading
   - `src/app/App.tsx` — proteccion Cmd+W, restore-on-restart en `registerTerminalHandle`

5. **Task 5:** Notification jump shortcut
   - `src/modules/shortcuts/shortcuts.ts` — swap bindings + `notifications.jumpToLast`
   - `src/app/App.tsx` — handler
   - `src/modules/shortcuts/shortcuts.test.ts` — tests

El usuario no indicó preferencia de ejecución (subagente vs inline) antes del handoff. Preguntar al
inicio de la siguiente sesion o directamente invocar `superpowers:subagent-driven-development`.

## Suggested skills

- `superpowers:subagent-driven-development` — para ejecutar las 5 tareas con agentes frescos y revision entre medias
- `superpowers:executing-plans` — alternativa inline si el usuario prefiere ejecucion en una sola sesion
- `superpowers:verification-before-completion` — al terminar todas las tareas antes de cerrar la rama
