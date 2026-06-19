---
id: BUG-41
title: Explore root por editor - persistencia y restore sin verificar
area: editor / explorer / workspaces
severity: low
status: sin confirmar
---

## Descripcion

Cada editor de ficheros guarda su "explore root" asociado. No esta verificado que la asignacion, la persistencia y el restore funcionen correctamente en todos los casos.

## Que probar

- Que el explore root se guarda y se restaura bien al recargar / reabrir el workspace.
- Quitar manualmente el explore root del `workspace-state.json` (o `workspace.json`) y comprobar si el comportamiento de fallback es el esperado: la hipotesis es que sin valor explicito deberia derivarse de `dirname()` del fichero abierto. Confirmar que es realmente lo que ocurre.
- Casos de edge: fichero movido/renombrado, fichero borrado, fichero en otra raiz, varios editores con raices distintas en el mismo workspace.

## Impacto

Si el restore falla, el explorer puede abrir en la raiz equivocada o quedar vacio al restaurar un workspace.

## Pendiente

- Verificacion manual de los casos anteriores.
- Si se confirma que el fallback a `dirname()` no ocurre cuando deberia, abrir el fix correspondiente.
