# M4 - Cancelación end-to-end de la búsqueda IPC

**Esfuerzo: medio. Impacto: medio** (sirve directamente a la filosofía ultraligera: dejar de desperdiciar traversals).

## Problema

En la command palette, al cambiar el término de búsqueda, el JS descarta el resultado obsoleto por request-id (`useAsyncQuery.ts:32-50`, `useContentSearch.ts:31-38`), pero el `invoke("fs_grep_interactive", …)` subyacente **nunca se cancela**. Cada keystroke pasado el debounce arranca un traversal completo del workspace en Rust que corre hasta su límite de hits. El Rust ya tiene un `generation` counter, pero el cleanup del effect no le notifica. Ver BUG-17.

## Objetivo

Que al teclear, las búsquedas superadas se cancelen realmente en Rust, no solo se ignoren en JS.

## Diseño técnico

- Pasar un `AbortController`/signal a través de `run(term, signal)` en los hooks.
- En el cleanup del effect, llamar al path de cancelación de Rust: o bien un comando `fs_search_cancel(generation)` que haga que el traversal en vuelo compruebe un flag atómico y aborte, o aprovechar el `generation` counter existente para que el worker de búsqueda corte cuando detecta una generación más nueva.
- El `ignore`/`grep` walker debe comprobar el flag de cancelación periódicamente (por entrada o por lote) y salir temprano.

## Plan accionable

1. Backend: añadir un `AtomicBool`/`generation` consultable por la búsqueda en curso y un comando de cancelación (o reusar el counter existente para abort cooperativo). El walker comprueba y corta.
2. Frontend: hilar `signal` por `useAsyncQuery`/`useContentSearch`; en cleanup, invocar la cancelación.
3. Test backend: lanzar dos búsquedas solapadas y verificar que la primera aborta sin agotar su límite.

## Criterios de aceptación

- Teclear rápido en un repo grande no deja varios scans corriendo en paralelo hasta el final (verificable con logs/medición).
- La última búsqueda devuelve resultados correctos.
- `cargo test --locked` en verde.

## Relacionado

- BUG-17.
