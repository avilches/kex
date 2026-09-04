---
id: TASK-627
title: 'F16: Animacion slide del panel lateral'
status: In Progress
assignee: []
created_date: '2026-09-04 01:30'
labels: []
dependencies: []
references:
  - docs/pending/features/F16-sidebar-slide-animation.md
priority: low
type: task
ordinal: 620000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Nota: trabajo en curso en la rama worktree-feat+sidebar-slide-animation.

# F16 - Animacion slide del panel lateral

**Estado:** WIP en rama `worktree-feat+sidebar-slide-animation` (baja prioridad)
**Worktree:** `.claude/worktrees/feat+sidebar-slide-animation`
**Handoff:** `HANDOFF-2026-06-29-15-55-sidebar-slide-broken.md` dentro del worktree

## Objetivo

Añadir animacion CSS de slide (apertura/cierre) al panel lateral derecho (Explorer / Source Control / Git History),
sin afectar el comportamiento de redimension normal (min/max como antes).

## Estado actual

La infraestructura esta en su mayoria correcta:
- Paneles siempre montados (always-mounted) con `[data-layout="main"]`
- Transicion CSS en `flex-grow` solo en el grupo exterior, desactivada durante drag
- `ResizableHandle` con `html[data-resizing]` para suprimir la transicion

El problema pendiente: `collapsible` prop de `react-resizable-panels` permite tanto
`collapse()` imperativo (necesario) como drag past minSize (no deseado). No se han
encontrado opciones de la libreria para desactivar uno sin el otro.

## Proximos pasos

Ver handoff para el detalle tecnico. El enfoque sugerido: `minSize` dinamico con
`flushSync` para la animacion de cierre sin usar `collapsible`.
<!-- SECTION:DESCRIPTION:END -->
