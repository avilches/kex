# BUG-32 [low] El matcher de tab.selectByIndex salta el guard de key; futuros atajos de un digito quedan ocultos

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/shortcuts/shortcuts.ts:323-328`

## Problema
Para `tab.selectByIndex`, el matcher devuelve `false` solo cuando `!/^[1-9]$/.test(e.key)`, pero nunca compara `e.key` contra la `key` concreta del binding. Con la politica first-match-wins, cualquier futuro binding sobre un digito que comparta los mismos modificadores nunca dispararia porque `tab.selectByIndex` lo captura antes. Es latente hoy (Cmd+0 queda excluido por la regex), pero fragil.

## Impacto / repro
Anadir, por ejemplo, un binding `Cmd+2` para otra accion nunca se dispararia: `tab.selectByIndex` lo absorberia primero. Hoy no hay colision real, pero el matcher es una trampa para futuros atajos de un digito.

## Fix
No es estrictamente un cambio de comportamiento hoy. Anadir un test `shortcuts.test.ts` que fije el invariante de que solo `tab.selectByIndex` posee `Cmd+1..9` (y que ningun otro binding usa esos digitos con esos modificadores). Opcionalmente endurecer el matcher para que tambien excluya keys reclamadas por otros bindings, manteniendo el comportamiento actual.

## Criterios de aceptacion
- Existe un test que falla si se anade un binding sobre `Cmd+1..9` con los mismos modificadores que `tab.selectByIndex`.
- El comportamiento actual de seleccion de tab por indice (Cmd+1..9) se mantiene.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar que el nuevo test pasa con el estado actual y falla si se introduce un binding colisionante.

## Test a anadir
Subsistema core (shortcuts/IPC). Anadir `src/modules/shortcuts/shortcuts.test.ts` que recorra el registro de bindings y verifique que `Cmd+1..9` (con esos modificadores) pertenecen unicamente a `tab.selectByIndex`.
