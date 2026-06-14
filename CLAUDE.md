@AGENTS.md

## Reglas de trabajo

### Gestion de tareas pendientes

- Cuando el usuario pide recordar una feature para mas adelante: añadirla a `docs/TODO.md`.
- Cuando algo queda pendiente y el usuario decide no hacerlo ahora: añadirlo a `docs/PENDING.md` con referencia al fichero de detalle en `docs/pending/` (subdirectorios: `bugs/`, `features/`, `improvements/`).
- Cuando el usuario pregunta "que queda por hacer": mostrar primero `docs/PENDING.md`, luego `docs/TODO.md`.
- Al revisar lo pendiente, buscar tambien ficheros de handoff sueltos (p. ej. `HANDOFF-*.md` en la raiz o en `docs/`) por si el usuario quiere continuar con alguno. Listarlos, decir de que trata cada uno, y ofrecer al usuario limpiarlos, unificarlos o mover su contenido vivo a `docs/PENDING.md` o `docs/TODO.md`. No borrar ni mover un handoff sin confirmacion del usuario.

### Estado mutable externo en React

Nunca usar `setInterval + setTick` para releer estado mutable externo (arrays a nivel de modulo, pools, caches). El state setter queda stale tras el primer render cycle y no causa re-renders. Usar `useSyncExternalStore(subscribe, getSnapshot)`. `getSnapshot` debe devolver la MISMA referencia si nada cambio (cache obligatorio), de lo contrario React lanza "infinite loop" error. Patron correcto: snapshot cacheado en el modulo, funcion `notify*()` que lo recalcula y notifica, llamar `notify*()` en todos los puntos donde el estado cambia.

### Diagnostico de bugs con Vite HMR

Cuando Vite HMR recarga un modulo con estado mutable a nivel de modulo, crea una segunda instancia. Los componentes ya montados siguen usando la instancia vieja. Para diagnosticar bugs de estado mutable, siempre hacer kill del proceso y `pnpm tauri dev` fresco antes de leer logs. No confiar en resultados de sesiones con cambios via HMR.

## Documentacion viva

- `docs/ARCHITECTURE.md` + `docs/IPC.md` + `docs/BUILD.md` — referencia principal (ver AGENTS.md para politica de actualizacion)
- `docs/WORKSPACES.md` + `docs/WORKSPACES_GOTCHAS.md` — subsistema de workspaces y pool de terminales
- `docs/AGENT_SESSION_RESTORE.md` — hooks, store JSON, algoritmo de restore, UI del tab, casos de error
- `docs/FORK.md` — divergencias y roadmap respecto al upstream

## Notas de implementacion
### Fix WebGL GPU al arrancar

Bug resuelto (2026-06-11, documentado en `docs/WORKSPACES_GPU.md`). Fix: `setTimeout(retryMissingWebgl, 350)` en `main.tsx` tras `showWindow` a t=50ms. Los rAFs de `scheduleUnhide` se encolan mientras la ventana esta oculta. No anadir mas retries en `rendererPool.ts` sin pasar por `main.tsx`.
