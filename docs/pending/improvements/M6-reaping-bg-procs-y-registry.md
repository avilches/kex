# M6 - Reaping de procesos background y cota del WorkspaceRegistry

**Esfuerzo: bajo-medio. Impacto: medio** (memoria; coherencia con "ultraligero").

## Problema

Dos crecimientos de memoria sin cota en el backend:

- **BUG-08:** `ShellState.bg` nunca elimina entradas. `shell_bg_kill` mata el hijo pero deja el `Arc<BackgroundProc>` (ring buffer de hasta 4 MiB) en el mapa para siempre. Sin reaping de procesos que terminan solos.
- **BUG-21:** `WorkspaceRegistry.roots` (`HashSet`) solo inserta, nunca purga. Cada `cd` distinto añade un root permanente y `is_authorized` hace `iter().any(starts_with)` O(n) en hot paths git/watch.

## Objetivo

Ciclo de vida explícito de los procesos background y un registry acotado y eficiente.

## Plan accionable

### Procesos background (BUG-08)

1. Añadir comando `shell_bg_remove(handle)` que haga `state.bg.write().remove(&handle)`.
2. `shell_bg_kill` elimina la entrada tras matar.
3. `shell_bg_list`/`shell_bg_logs` reapean entradas `exited` ya consumidas con un TTL post-exit, o capar el número de bg procs retenidos.
4. Frontend: invocar `shell_bg_remove` cuando deja de observar un proceso.
5. Test: arrancar/matar N procesos y verificar que el mapa no crece sin cota.

### WorkspaceRegistry (BUG-21)

1. Consolidar roots al insertar: si el nuevo root es ancestro de roots existentes, removerlos; si es descendiente de uno existente, no insertar.
2. Cota LRU del número de roots.
3. Test: insertar `~/a`, luego `~/a/b` (no se añade), luego `~/` (consolida); `is_authorized` sigue correcto.

## Criterios de aceptación

- El mapa de bg procs y el set de roots no crecen sin límite en una sesión larga.
- `is_authorized` no degrada con miles de `cd`.
- `cargo test --locked` en verde.

## Relacionado

- BUG-08, BUG-21; combina con F4 (autorización fs comparte el registry).
