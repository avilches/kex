# BUG-24 [low] respawnSession reasigna dormantRing mientras bytes del pty viejo pueden seguir en vuelo

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/terminal/lib/useTerminalSession.ts:464-501` (respawnSession)

## Problema
`s.pty?.close()` es asincrono y no se espera antes de `s.dormantRing = new DormantRing()`. Un `onData` en vuelo del pty viejo puede empujar bytes del shell ya muerto al ring nuevo, contaminandolo.

## Impacto / repro
Bajo. Un respawn con output en vuelo puede mostrar bytes residuales del shell muerto en el ring nuevo.

Repro: provocar un respawn de una terminal que esta produciendo output activo en el momento del respawn. Observar que pueden aparecer bytes residuales del shell anterior.

## Fix
Neutralizar sincronicamente los handlers del pty viejo (desuscribir `onData`/`onExit`) antes de reasignar `dormantRing`, o ignorar bytes provenientes de un pty cuyo id ya no es el activo (comprobar el id del pty contra el id activo dentro del handler `onData`).

## Criterios de aceptacion
- Tras un respawn, ningun byte del pty anterior llega al `dormantRing` nuevo.
- Los handlers del pty viejo se neutralizan antes de reasignar el ring, o los bytes de un pty no activo se descartan.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Verificar que un respawn con output en vuelo no contamina el ring nuevo.

## Test a anadir
Subsistema core (terminal session lifecycle). Anadir un test que simule un `onData` del pty viejo llegando tras el respawn y verifique que no se escribe en el `dormantRing` nuevo (por neutralizacion de handlers o por descarte segun id).
