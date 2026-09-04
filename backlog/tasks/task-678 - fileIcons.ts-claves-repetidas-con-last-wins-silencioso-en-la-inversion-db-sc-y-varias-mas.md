---
id: TASK-678
title: >-
  fileIcons.ts - claves repetidas con last-wins silencioso en la inversion (db,
  sc, y varias mas)
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
ordinal: 671000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 6, Codigo duplicado, MEDIA. src/modules/explorer/lib/fileIcons.ts - Claves repetidas con last-wins silencioso en la inversion (linea 2661): "db" (database vs zip: los .db reciben icono de zip), "sc" (scala vs super-collider, contradice languageDefinitions), ".luacheckrc", "psb", "asc", ".lintstagedrc", ".knip.jsonc" duplicada dentro del mismo icono. Detectar colisiones con un assert en test.
<!-- SECTION:DESCRIPTION:END -->
