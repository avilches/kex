# BUG-13 [medium] Deteccion de binario solo en los primeros 8 KB, incoherencia is_binary vs fallback_patch

## Contexto del proyecto
Kex es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; notificaciones de agentes de IA (Claude Code, Codex); buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src-tauri/src/modules/git/process.rs:374-383`

## Problema
La deteccion sniffea solo los primeros 8192 bytes buscando un NUL. Un fichero con cabecera de texto y binario despues se clasifica como texto y se hace `from_utf8_lossy`, metiendo el caracter de reemplazo por el diff, mientras `git diff` lo marcaria binario ("Binary files differ"), generando incoherencia.

## Impacto / repro
Un fichero mixto (cabecera textual seguida de bytes binarios mas alla de 8 KB) se muestra como texto corrupto en lugar de "binary". Repro: crear un fichero con primeros 8 KB de texto ASCII y un NUL despues; abrir su diff y observar que se renderiza como texto con caracteres de reemplazo en vez de detectarse como binario.

## Fix
Alinear con git: decidir binario via `--numstat` (lineas `-/-`) o `cat-file`, en vez del sniff local de 8 KB.

## Criterios de aceptacion
- La clasificacion binario/texto coincide con la de `git diff` para ficheros mixtos.
- Un fichero con bytes binarios mas alla de los primeros 8 KB se detecta como binario.
- No se inyecta el caracter de reemplazo de `from_utf8_lossy` en el diff de ficheros que git considera binarios.

## Verificacion
Rust: `cd src-tauri && cargo clippy && cargo test --locked`.

## Test a anadir
Subsistema core (git). Anadir test que cree un fichero con cabecera de texto y un NUL pasado los 8 KB, y verifique que la deteccion lo clasifica como binario de forma coherente con `git diff` (`--numstat` devuelve `-/-`). Anadir tambien un caso de fichero de texto puro que siga clasificandose como texto.
