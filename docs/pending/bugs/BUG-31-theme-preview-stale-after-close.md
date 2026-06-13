# BUG-31 [low] El preview de tema puede aplicarse tras cerrar la paleta (timer de 140 ms)

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/command-palette/CommandPalette.tsx:126-135`

## Problema
El efecto arma un timer de 140 ms que llama a `previewThemeId(id)` sin depender de `open`. Si el usuario pasa el raton por un tema y pulsa Escape dentro de esos 140 ms, `resetPalette` corre `previewThemeId(null)` y luego el timer pendiente dispara `previewThemeId(id)`, aplicando un preview obsoleto despues de haber cerrado la paleta.

## Impacto / repro
Tema equivocado previsualizado tras cerrar la paleta. Repro: abrir la command palette, hacer hover sobre un tema y pulsar Escape antes de que pasen 140 ms; el preview del tema se aplica aunque la paleta ya este cerrada.

## Fix
Anadir `open` a las dependencias del efecto y hacer early-return `if (!open) return;` al inicio del efecto, de modo que al cerrar la paleta el efecto se re-ejecute, no arme el timer y limpie el pendiente (cleanup del efecto previo).

## Criterios de aceptacion
- Tras cerrar la paleta (Escape o cualquier cierre) no se aplica ningun preview de tema pendiente.
- El preview en hover sigue funcionando mientras la paleta esta abierta.
- El timer pendiente se cancela en el cleanup al cambiar `open` a false.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar manualmente el escenario hover + Escape rapido y que el tema activo no cambia.

## Test a anadir
No aplica al core. Verificacion manual del timing.
