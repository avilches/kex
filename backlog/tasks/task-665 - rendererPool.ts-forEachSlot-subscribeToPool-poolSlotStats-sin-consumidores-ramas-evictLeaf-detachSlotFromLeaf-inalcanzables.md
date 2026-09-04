---
id: TASK-665
title: >-
  rendererPool.ts - forEachSlot, subscribeToPool, poolSlotStats sin
  consumidores; ramas evictLeaf/detachSlotFromLeaf inalcanzables
status: To Do
assignee: []
created_date: '2026-09-04 01:33'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: task
ordinal: 658000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 5, Codigo muerto, Maquinaria muerta dentro de modulos vivos, MEDIA. src/modules/terminal/lib/rendererPool.ts - forEachSlot, subscribeToPool, poolSlotStats sin consumidores externos; pickSlotFor devuelve siempre previousLeafId: null, asi que las ramas evictLeaf/detachSlotFromLeaf de acquireSlot son inalcanzables y los metodos evictLeaf/isLeafBlocks del SlotAdapter nunca se invocan desde el pool.
<!-- SECTION:DESCRIPTION:END -->
