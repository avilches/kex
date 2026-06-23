# Revisión completa de Kex

Auditoría de código (backend Rust + frontend React), documentación y propuesta de mejoras/features, evaluada contra la filosofía del proyecto: **terminal ultraligero, rápido y eficiente en memoria; terminales + edición/visualización de ficheros; sin foco en agentes; buen diff de git en doble panel.**

Método: 6 agentes de auditoría especializados en paralelo (backend core, git, workspaces/terminal, diff doble panel, resto de UI, docs vs código). El hallazgo más grave verificado a mano es el diff que no es doble panel.

## Entregables

Todo está en ficheros markdown autocontenidos y accionables por un agente de forma aislada: cada uno incluye contexto del proyecto, ubicación `archivo:línea`, problema, fix concreto, criterios de aceptación y comandos de verificación.

- **[BUGS.md](BUGS.md)** - índice de los 30 bugs (6 high, 12 medium, 12 low). Cada bug es un fichero en **bugs/BUG-NN-*.md** ejecutable por separado.
- **[DOCS.md](DOCS.md)** - discrepancias entre documentación y código (3 críticas, 1 high, 5 menores).
- **features/** - una spec accionable por feature (F1-F6).
- **improvements/** - una spec accionable por mejora (M1-M7).

Para lanzar un agente sobre un item concreto basta con apuntarlo al fichero, por ejemplo: "implementa `docs/pending/bugs/BUG-02-diff-no-normaliza-crlf.md`" o "implementa `docs/pending/features/F1-diff-side-by-side.md`".

## Los 2 hallazgos que importan

1. **La feature estrella (diff en doble panel) no existe.** El código usa `unifiedMergeView` (inline, una columna), no `MergeView` side-by-side. La dependencia `@codemirror/merge` ya está instalada, así que el coste de bundle es ~cero. Ver **[features/F1](features/F1-diff-side-by-side.md)**.
2. **El diff calculado en cliente trata CRLF como cambios.** En repos Windows/normalizados, el diff marca el fichero entero como modificado (BUG-02). Hay que arreglarlo para que el doble panel valga algo.

## Features (specs)

| ID | Título | Prioridad | Esfuerzo |
| --- | --- | --- | --- |
| [F1](features/F1-diff-side-by-side.md) | Diff en doble panel (side-by-side) real | Máxima | Medio-alto |
| [F2](features/F2-stage-unstage-por-hunk.md) | Stage / unstage / discard por hunk y por línea | Alta | Alto |
| [F3](features/F3-navegacion-hunks.md) | Navegación entre cambios (next/prev hunk) | Alta | Medio |
| [F5](features/F5-reabrir-tab-cerrado.md) | Reabrir panel cerrado (Cmd+Shift+T) | Media | Bajo |
| [F6](features/F6-scrollback-persistente.md) | Scrollback persistente entre sesiones | Media | Medio |

## Mejoras (specs)

| ID | Título | Impacto | Esfuerzo |
| --- | --- | --- | --- |
| [M2](improvements/M2-lazy-modulo-agents.md) | Módulo agents perezoso (coherencia no-agentes) | Medio | Bajo-medio |
| [M3](improvements/M3-hunks-estructurados-backend.md) | Hunks estructurados desde el backend | Alto | Alto |
| [M4](improvements/M4-cancelacion-busqueda-ipc.md) | Cancelación end-to-end de búsqueda IPC | Medio | Medio |
| [M5](improvements/M5-diff-grandes-worker.md) | Diff en Web Worker / virtualización | Medio | Alto |
| [M6](improvements/M6-reaping-bg-procs-y-registry.md) | Reaping de bg procs + cota del registry | Medio | Bajo-medio |
| [M7](improvements/M7-quick-wins.md) | 15 quick wins de bajo esfuerzo | Variado | Bajo |

## Orden sugerido

1. **Verdad de la doc primero:** corregir DOCS.md (D3-D4). La decisión sobre autorización fs ya está documentada en `docs/ARCHITECTURE.md §4.2`.
2. **Hacer la feature estrella real:** BUG-02 (CRLF) → F1 (side-by-side) → F3 (navegación) → F2 (stage por hunk). Apoyar con M3 (hunks backend) y M5 (grandes).
3. **Rendimiento y memoria:** M6 (reaping), M2 (agents perezoso), BUG-08/10. (M1 memoización: ya hecha, ver `AUDIT-2026-06-23.md`.)
4. **Pulido continuo:** M7 quick wins y los bugs low.

## Decisiones abiertas

- **F4 (deny-list / autorización fs): RESUELTA.** Se decidió no implementarla y ajustar la documentación. El modelo de amenaza del fork (sin agentes AI, boundary en `capabilities/default.json`, el terminal ya da shell completo) la vuelve innecesaria. Detalle en `docs/ARCHITECTURE.md §4.2` y en el comentario antes de `fs_read_file` en `src-tauri/src/modules/fs/file.rs`. No reabrir salvo petición explícita.
- **M2 (módulo agents): pendiente de confirmar con el usuario.** ¿Hacer la superficie frontend de agents perezosa pero disponible, o apagada por defecto? Dada la filosofía no-agentes del fork conviene confirmarlo antes de tocar. Spec en [M2](improvements/M2-lazy-modulo-agents.md).

## Estado verificado (lo que NO hay que tocar)

El PTY core, la seguridad del módulo git (salvo BUG-12), las operaciones puras de `splitNode.ts`, la virtualización de Source Control y el cache de diffs están sólidos y testeados. Detalle en la sección final de [BUGS.md](BUGS.md).
