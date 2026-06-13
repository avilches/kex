# M2 - Hacer perezosa toda la superficie frontend del módulo agents

**Esfuerzo: bajo-medio. Impacto: medio** (coherencia con la filosofía no-agentes + memoria).

## Problema

La filosofía del proyecto es explícitamente NO ser un producto de agentes. El detector Rust es de coste cero cuando no corre ningún agente (bien), pero la superficie frontend de `agents` tiene **coste fijo permanente** aunque nunca se use un agente:

- `AgentNotificationsBridge` (`App.tsx:1168`) registra un listener permanente `terax:agent-signal`.
- `useWindowFocus` registra `onFocusChanged`.
- `NotificationBell` está siempre en el header, suscrito a dos slices de zustand.
- El módulo arrastra `zustand` (`agentStore.ts`) y `@tauri-apps/plugin-notification`; si zustand solo se usa aquí, es una dependencia cargada por una feature no-core.
- Detalle: `NotificationBell.relativeTime` (`:25`) muestra "Xm ago" pero solo re-renderiza al cambiar el store, así que los timestamps quedan obsoletos.

## Objetivo

Coste cero en el frontend para usuarios que solo quieren "terminales + editar ficheros + verlos", sin perder la funcionalidad para quien sí usa un agente en el terminal.

## Plan accionable

1. No registrar los listeners (`terax:agent-signal`, `onFocusChanged`) ni montar `NotificationBell` hasta la primera señal `terax:agent-signal` observada (o hasta que `agentNotifications` esté activo). Hoy `route.ts:36` ya comprueba la preferencia, pero los listeners se registran antes.
2. Gate por la preferencia `agentNotifications` (ya existente): si está desactivada, no montar nada de la superficie.
3. Lazy-import del módulo (`React.lazy`/import dinámico) para que `zustand` y `plugin-notification` no entren en el bundle inicial si la feature está apagada.
4. Arreglar `relativeTime` para que se refresque (timer o recálculo on-open del popover) o mostrar timestamp absoluto.
5. Confirmar con el usuario el nivel deseado: ¿feature opcional apagada por defecto, o siempre disponible pero perezosa? Dada la filosofía, sugerencia: perezosa y activable.

## Criterios de aceptación

- Con `agentNotifications` desactivado, no hay listeners de agents registrados ni `NotificationBell` montado, y el chunk de agents no está en el bundle inicial (verificable con el análisis de bundle / size-limit).
- Activarlo (o la primera señal) monta la superficie sin recargar.
- `pnpm lint`/`check-types`/`test` en verde y `.size-limit.json` respetado.

## Relacionado

- Filosofía no-agentes. `docs/FORK.md` ya documenta la eliminación del subsistema AI; esto extiende la coherencia a las notificaciones de agente de terminal.
