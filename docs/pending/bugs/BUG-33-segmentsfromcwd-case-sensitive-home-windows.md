# BUG-33 [low · cross-platform] segmentsFromCwd compara el prefijo home case-sensitive en Windows

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/statusbar/lib/pathUtils.ts:17-19`

## Problema
`normCwd.startsWith(normHome + "/")` es case-sensitive. En Windows el shell puede emitir la letra de unidad en minuscula mientras `homeDir()` la devuelve en mayuscula (o viceversa), asi que el prefijo home no coincide y el breadcrumb nunca colapsa a `~`.

## Impacto / repro
El breadcrumb del statusbar no muestra `~` en Windows cuando hay diferencia de mayusculas/minusculas en la unidad. Repro: en Windows con cwd `c:/Users/foo/...` y home `C:/Users/foo`, el breadcrumb muestra la ruta completa en lugar de `~/...`.

## Fix
Comparar el prefijo home de forma case-insensitive en Windows (lowercasear ambos lados solo para la comparacion) mientras se corta los segmentos desde el string original (preservando el case real de los segmentos mostrados).

## Criterios de aceptacion
- En Windows, el breadcrumb colapsa a `~` aunque la unidad difiera en mayusculas/minusculas entre cwd y home.
- En Unix el comportamiento sigue siendo case-sensitive (no se altera).
- Los segmentos mostrados conservan su case original.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Comprobar que `c:/Users/foo/bar` con home `C:/Users/foo` produce segmentos `~`, `bar`.

## Test a anadir
Anadir caso en el test de `pathUtils` (`segmentsFromCwd`) que cubra prefijo home con case distinto en la unidad y verifique el colapso a `~`. El handling de paths cross-platform es sensible, conviene fijarlo.
