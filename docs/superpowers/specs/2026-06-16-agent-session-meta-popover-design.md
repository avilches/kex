# Agent session metadata popover

**Fecha:** 2026-06-16
**Estado:** aprobado

## Objetivo

Mostrar metadata real de la sesion Claude en el tab de agente: session ID, directorio, tiempo activo, estado de restore. Disenado para ser extensible (context %, tokens, modelo) sin reescribir el flujo.

## Contexto

Hoy el tooltip del tab muestra `panelId.slice(0, 8)` etiquetado como "Session:" -- ese valor es el UUID interno de Kex, no el `session_id` de Claude Code. El `session_id` real llega a Rust via OSC `777;kex-session` (hook `SessionStart`) pero no se emite al frontend.

## Diseno

### Flujo de datos (Rust -> frontend)

1. `session.rs` -- cuando `SessionStart` llega, despues de llamar a `record_session`, emitir un evento Tauri `kex:agent-session-meta`:
   ```rust
   { panel_id: String, session_id: String, cwd_launch: String }
   ```
   `transcript_path` no se incluye (no tiene uso en la UI).

2. `AgentNotificationsBridge` -- escuchar `kex:agent-session-meta` y llamar a `store.setMeta(panelId, meta)`.

3. Restore -- cuando el PTY restaurado arranca, el hook `SessionStart` de Claude vuelve a emitir el OSC `kex-session`. El mismo flujo cubre el caso sin cambios extra.

### Tipos (`src/modules/agents/lib/types.ts`)

```ts
export type AgentSessionMeta = {
  sessionId?: string;
  cwdLaunch?: string;
  // extension futura: contextPct?, model?, tokenCount?
};
```

`AgentSession` recibe un campo nuevo:
```ts
meta?: AgentSessionMeta;
```

### Store (`src/modules/agents/store/agentStore.ts`)

Nueva accion:
```ts
setMeta: (panelId: string, meta: Partial<AgentSessionMeta>) => void;
```

Hace merge (`{ ...prev.meta, ...meta }`) para que fuentes distintas de metadata no se pisen entre si.

### UI (`src/modules/workspaces/PaneTabBar.tsx`)

- Eliminar el atributo `title` del div del tab (conflicto visual con el popover).
- Envolver el tab en un `HoverCard` de shadcn con `openDelay={700}`.
- Contenido del popover:

```
claude  •  working
──────────────────────────────
Session    abc12345…          (session.meta.sessionId, primeros 8 chars + "…")
Directory  ~/Work/proyecto    (panel.cwd, full path)
Started    hace 3 min         (elapsed desde agentSession.startedAt)
Restored   v                  (solo si agentSession.restored === true)
```

- Cuando `meta` aun no ha llegado (ventana entre `UserPromptSubmit` y el primer `SessionStart`), los campos `Session` y `Directory` no aparecen. Sin placeholder ni spinner.
- El status ("working" / "waiting") usa el mismo dot/spinner que el tab, en miniatura.

## Extensibilidad

Para anadir un nuevo campo (ej. `contextPct`):
1. Anadir `contextPct?: number` a `AgentSessionMeta`.
2. Emitirlo desde Rust (o desde el JSONL parser) via `setMeta`.
3. Anadir la fila al popover.

No se necesita cambiar la arquitectura del flujo.

## Ficheros afectados

| Fichero | Cambio |
|---|---|
| `src-tauri/src/modules/pty/session.rs` | Emitir `kex:agent-session-meta` tras `record_session` |
| `src/modules/agents/lib/types.ts` | Anadir `AgentSessionMeta` y `meta?` a `AgentSession` |
| `src/modules/agents/store/agentStore.ts` | Anadir accion `setMeta` |
| `src/modules/agents/components/AgentNotificationsBridge.tsx` | Escuchar `kex:agent-session-meta` y llamar a `setMeta` |
| `src/modules/workspaces/PaneTabBar.tsx` | Reemplazar `title` por `HoverCard` |

## Fuera de scope

- Leer tokens / context % del JSONL (requiere trabajo separado de parseo).
- Copiar el session ID al portapapeles desde el popover (mejora futura).
- Mostrar el modelo Claude en el popover (no disponible via hooks actuales).
