---
id: TASK-691
title: >-
  Barrels que no son la superficie real del modulo: consumidores hacen
  deep-import masivo, ~20 lineas de barrels quedan muertas
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
ordinal: 684000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 7, Incoherencias, MEDIA. Barrels que no son la superficie real del modulo: los consumidores hacen deep-import masivo (@/modules/workspaces: 11 imports de barrel vs 62 deep) y ~20 lineas de los barrels de terminal/workspaces quedan muertas aunque los simbolos se usen por ruta profunda. Decidir politica: o barrel obligatorio o podar los barrels.
<!-- SECTION:DESCRIPTION:END -->
