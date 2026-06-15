# BUG-10 [RESUELTO] La persistencia serializa el arbol completo en cada cd y cada comando

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/app/App.tsx:152-155` (effect con deps `[workspaces, activeWorkspaceId]`) + `src/modules/workspaces/lib/workspaceState.ts:57-71`

## Problema
Cada `setTerminalPanelCwd` (cada cd, OSC 7) y cada `setTerminalRunningCommand` (cada comando, OSC 133 C/D) produce un `workspaces` nuevo y re-ejecuta el effect. El debounce amortigua el `invoke`, pero al hacer flush, `workspaces.map(sanitizeWorkspace)` hace una copia profunda recursiva de todos los arboles y serde/IPC serializa el estado completo. Con comandos corriendo en varios terminales se dispara constantemente.

## Impacto / repro
Copia profunda + JSON IPC del estado completo de forma repetida. CPU/GC proporcional al tamano del arbol. Repro: abrir varios terminales, ejecutar comandos y hacer `cd` en ellos; observar serializaciones repetidas del estado completo de workspaces.

## Fix (aplicado)
`runningCommand` movido a `src/modules/workspaces/lib/terminalEphemeralStore.ts`: `Map<panelId, string>` con patron `useSyncExternalStore`. `setTerminalRunningCommand` en `useWorkspaces.ts` ya no llama a `setWorkspaces`; escribe directamente al store. `PaneTabBar.tsx` suscribe al store y lee el valor para su panel. Al cerrar un panel, `clearRunningCommandEntry` limpia la entrada del store. `runningCommand` eliminado del tipo `Panel` en `types.ts`. `cd` (OSC 7) sigue en el arbol `workspaces` ya que es necesario para la restauracion de sesion.

## Criterios de aceptacion
- Cambios en `runningCommand` no mutan la identidad del arbol `workspaces` ni disparan el effect de persistencia.
- El estado persistido no incluye `runningCommand` (estado efimero).
- La copia profunda + serializacion del estado completo solo ocurre ante cambios estructurales reales (split, cierre, reorder, cd persistible), no por comandos en ejecucion.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`.

## Test a anadir
No aplica directamente como subsistema core, pero si se anade el store separado conviene un test unitario de `sanitizeWorkspace`/`workspaceState` que verifique que `runningCommand` no aparece en la salida serializada. Verificar tambien que el effect de persistencia no se dispara por cambios de `runningCommand`.
