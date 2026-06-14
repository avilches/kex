---
id: BUG-38
title: Cmd+F - no funciona en documentos; terminal search sin navegacion
area: search / header
severity: medium
---

## Descripcion

Dos deficiencias en la busqueda con `Cmd+F`:

1. **En paneles de documento (editor, markdown, git-diff, etc.)**: `Cmd+F` no abre busqueda. Solo funciona en terminales. Deberia activar la busqueda en el panel activo independientemente de su tipo.

2. **En terminal, la busqueda no permite navegar entre resultados**: al abrir la busqueda en un terminal con `Cmd+F`, no hay forma de ir al resultado siguiente/anterior con `Enter` / `Shift+Enter` o flechas. El usuario queda bloqueado en el primer resultado.

## Impacto

Busqueda en documentos completamente inoperativa. Busqueda en terminal inutilizable para ficheros de log con muchos resultados.

## Como reproducir

1. Abrir un editor con texto. Pulsar `Cmd+F` -- no pasa nada.
2. Abrir un terminal con output largo. Pulsar `Cmd+F`. Escribir un termino. No hay forma de ir al siguiente resultado.

## Hipotesis

- `SearchInline` (modulo `header/`) puede no adaptar su target cuando el panel activo no es un terminal. `SearchTarget` puede no cubrir los tipos de panel distintos de `terminal`.
- La navegacion entre resultados (xterm `FindAddonOptions: incremental`) puede no estar cableada al teclado -- revisar `useTerminalSearch` o equivalente.
