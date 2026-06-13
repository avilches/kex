# BUG-02 [high] El diff no normaliza CRLF: ficheros con CRLF muestran el archivo entero como cambiado

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src-tauri/src/modules/git/process.rs` (read_text_file vs git_show_text en :135), consumido en `src-tauri/src/modules/git/operations.rs` (diff_content).

## Problema
`original_content` viene de `git show` (respeta `core.autocrlf`, normalmente LF). `modified_content` viene de `read_text_file`, que lee los bytes crudos del worktree (con CRLF si los tiene). El diff lado cliente (`unifiedMergeView`) compara las dos cadenas: si el worktree tiene CRLF y el blob LF, cada linea aparece como cambiada o con `\r` resaltado intra-linea. El backend hace `trim_end_matches('\r')` en otros sitios (process.rs:196) pero no en diff_content. El `fallback_patch` (de `git diff`) esta bien porque git normaliza.

## Impacto / repro
En repos Windows o con `.gitattributes` de normalizacion, el diff marca el fichero entero como modificado. Falso positivo masivo que arruina la feature estrella del producto.

## Fix
Normalizar line endings de forma consistente en ambos lados antes de devolver: convertir CRLF a LF en ambos `TextSource::Text` dentro de `diff_content` y `commit_file_diff`. Asi `original_content` y `modified_content` solo difieren en cambios reales, no en `\r`.

## Criterios de aceptacion
- Un fichero con CRLF en worktree y blob LF muestra cero diferencias cuando el contenido logico es identico.
- Las diferencias reales siguen apareciendo.
- El comportamiento es identico en diff_content y commit_file_diff.

## Verificacion
Rust: `cd src-tauri && cargo clippy && cargo test --locked`. Comprobar el nuevo test de normalizacion CRLF.

## Test a anadir
Subsistema core de diff. Anadir en `git_operations.rs` un test: fichero con CRLF en el worktree y blob con LF en HEAD; verificar que `original_content` y `modified_content` devueltos por diff_content NO difieren solo por `\r` (es decir, son iguales si el contenido logico es igual).
