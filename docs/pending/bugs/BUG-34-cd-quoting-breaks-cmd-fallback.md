# BUG-34 [low · cross-platform] El quoting de cd rompe en el fallback cmd.exe

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/lib/shellQuote.ts:3-8`
Consumido en `src/App.tsx:638,658`

## Problema
`quoteShellArg(value, windows=true)` produce escaping de PowerShell con comillas simples. En `cmd.exe`, documentado como fallback en Windows, las comillas simples son literales, asi que `cd 'C:/Some Dir'` falla (cmd interpreta las comillas simples como parte del path). No es un problema de inyeccion (los paths provienen del explorer/OSC), pero el `cd` falla.

## Impacto / repro
El `cd` por breadcrumb falla en sesiones `cmd.exe`. Repro: en Windows con shell `cmd.exe` (fallback), hacer click en un segmento del breadcrumb cuyo path contenga un espacio; el cambio de directorio no ocurre.

## Fix
Saltar el `cd` por breadcrumb en sesiones `cmd.exe`, o detectar el shell y usar comillas dobles para `cmd` (que si funcionan en `cmd.exe`) reservando el quoting de PowerShell para `pwsh`/`powershell`.

## Criterios de aceptacion
- En sesiones `cmd.exe` el `cd` por breadcrumb funciona con paths con espacios, o se omite limpiamente sin enviar un comando roto.
- En `pwsh`/`powershell` el quoting actual se mantiene y sigue funcionando.
- En Unix no se altera el comportamiento.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar que el comando generado para `cmd.exe` con un path con espacios usa el quoting correcto (o se omite).

## Test a anadir
Anadir test unitario de `shellQuote`/del generador del comando `cd` que cubra el caso `cmd.exe` con path con espacios y verifique el quoting esperado (comillas dobles) o la omision. El handling de shell cross-platform es sensible.
