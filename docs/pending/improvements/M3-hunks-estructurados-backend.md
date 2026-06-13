# M3 - Hunks estructurados desde el backend para el diff

**Esfuerzo: alto. Impacto: alto** (habilita un diff premium con menos trabajo en el webview).

## Problema

Hoy el backend entrega `original_content` + `modified_content` completos y un `fallback_patch` de texto; el frontend recalcula el diff (LCS/Myers vía `@codemirror/merge`) en el hilo principal. Esto duplica trabajo, carga ambos contenidos enteros en memoria (BUG-14) y escala mal en ficheros grandes (BUG-05).

## Objetivo

Que el backend (o un parser dedicado) entregue hunks estructurados con números de línea de ambos lados, listos para render, opcionalmente con rangos intra-línea:

- `@@ -a,b +c,d @@` por hunk, con tipo de cada línea (context/add/del) y su número de línea en cada lado.
- Rangos intra-línea (`git diff --word-diff=porcelain` o `--color-words` parseado) para resaltado a nivel de carácter.

## Diseño técnico

- Nuevo comando `git_diff_hunks(repo, path, staged) -> Vec<Hunk>` que ejecuta `git diff` con `-z`/`--word-diff=porcelain` y parsea a una estructura tipada (en `git/parser.rs`, puro y testeable).
- Para diffs grandes, permitir paginado/lazy por hunk (no cargar 2 MB de blob de golpe), alineado con M5.
- El frontend renderiza directamente los hunks (en side-by-side de F1) sin recomputar el diff.

Trade-off: introduce dependencia del parsing de git para el render. Mantener el camino `original_content/modified_content` como fallback para casos donde el cliente prefiera recalcular (p.ej. ediciones en vivo).

## Plan accionable

1. Definir el tipo `Hunk`/`DiffLine`/`IntraRange` en `git/types.rs`.
2. Implementar `git_diff_hunks` en `operations.rs` + parser puro en `parser.rs` con tests exhaustivos (context, add/del, renames, CRLF normalizado, word-diff, ficheros nuevos/borrados, binarios → marcador).
3. Exponer score de similitud de rename (hoy se descarta el `R<score>`, ver M abajo) en el tipo.
4. Frontend: consumir hunks en el side-by-side; mantener fallback.
5. Tests de integración backend.

## Mejora incluida: exponer score de rename

Porcelain v2 y `--name-status` ya traen `R<score>` (porcentaje de similitud) que hoy se descarta en `parser.rs`. Exponerlo en `GitChangedFile`/`GitCommitFileChange` permite mostrar "Renamed (95%)" y decidir render como move puro vs move+edit. Esfuerzo bajo, alto valor de UX.

## Criterios de aceptación

- `git_diff_hunks` devuelve hunks correctos con line numbers de ambos lados para casos de prueba.
- El side-by-side renderiza desde hunks sin recomputar el diff en cliente para ficheros normales.
- Renames muestran su score.
- `cargo test --locked` en verde.

## Relacionado

- Habilita/mejora F1, F2, F3.
- Resuelve BUG-13 (binario coherente con git) y BUG-14 (truncado/memoria) de paso.
- Combina con M5 (worker / lazy para grandes).
