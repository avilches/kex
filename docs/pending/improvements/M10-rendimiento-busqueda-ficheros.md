# M10 - Rendimiento de la busqueda de ficheros (por nombre y por contenido)

**Prioridad:** Alta (parte a) / Media (parte b)
**Esfuerzo:** Medio

## Contexto

Analisis de las dos busquedas realizado en la sesion del 2026-06-17. Hay dos rutas con margen de mejora distintas a la cancelacion ya recogida en BUG-17 / M4 (que cubren `fs_grep_interactive`).

## Parte a - `fs_search` (busqueda por nombre, Cmd+Alt+F) - impacto alto

`fs_search` en `src-tauri/src/modules/fs/search.rs` es **sincrona** (bloquea el hilo Tauri), **single-threaded** y **sin cancelacion**. Con una raiz grande (>10k ficheros) congela la UI.

Mejoras en orden de impacto:

1. **Async + `spawn_blocking`**: mover la logica a `tauri::async_runtime::spawn_blocking` para no bloquear el hilo Tauri.
2. **Cancelacion server-side (generation counter)**: igual que `fs_grep_interactive`. Anadir un estado equivalente con `AtomicU64`; el walker comprueba en cada iteracion si la generacion cambio y hace `break`.
3. **Walk paralelo**: `WalkBuilder::build_parallel()` igual que `search_tree` en `grep.rs`.

## Parte b - busqueda por contenido (Cmd+P + #) - impacto medio

En `useContentSearch.ts`:

- Debounce demasiado agresivo para repos grandes: subir de 140ms a ~200-250ms.
- Limite de hits bajo: subir de 80 a ~150-200 (en `useContentSearch.ts` y en `fs_grep_interactive`).

## Criterios de aceptacion

- En una raiz grande, la busqueda por nombre no congela la UI y se puede cancelar al cambiar el termino.
- Los nuevos valores de debounce/limite son configurables o al menos coherentes entre front y backend.
- `pnpm lint`, `pnpm check-types`, `pnpm test`, `cargo clippy`, `cargo test --locked` en verde.
- Test que fije la cancelacion cooperativa del walker de `fs_search`.

## Relacionado

- BUG-17 y M4 (cancelacion de `fs_grep_interactive`).
- M7-10 (helper de split de paths cross-platform).
