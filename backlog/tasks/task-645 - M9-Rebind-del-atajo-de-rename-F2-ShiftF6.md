---
id: TASK-645
title: 'M9: Rebind del atajo de rename: F2 -> Shift+F6'
status: To Do
assignee: []
created_date: '2026-09-04 01:30'
labels: []
dependencies: []
references:
  - docs/pending/improvements/M9-rebind-rename-f2-shift-f6.md
priority: low
type: task
ordinal: 638000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
# M9 - Rebind del atajo de rename: F2 -> Shift+F6

**Prioridad:** Baja
**Esfuerzo:** Bajo

## Contexto

El rename inline del explorer esta asignado actualmente a `F2`. Se quiere cambiar el binding por defecto a `Shift+F6`.

## Cambio

- Actualizar el `defaultBindings` de la entrada de rename en el registry `src/modules/shortcuts/shortcuts.ts` para que sea `Shift+F6` en lugar de `F2`.
- No hardcodear la tecla en ningun handler: el handler debe seguir usando `matchesShortcut(...)` / el `id` del registry, de modo que el cambio sea solo de binding por defecto y siga siendo reasignable desde Settings.

## Criterios de aceptacion

- El rename se dispara con `Shift+F6` por defecto.
- La accion sigue apareciendo en Settings y es reasignable.
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde.
<!-- SECTION:DESCRIPTION:END -->
