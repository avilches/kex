---
id: TASK-692
title: >-
  Normalizacion de paths con 4 implementaciones frontend distintas y manejo de ~
  divergente entre modulos
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
ordinal: 685000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 7, Incoherencias, MEDIA. Normalizacion de paths con 4 implementaciones frontend (canon(), normalizePath(), replace(/\\/g,"/") inline, helpers que asumen forward-slash) y manejo de ~ divergente (terminalLinks lo trata como absoluta y falla; pathComplete lo rechaza explicitamente). Consolidar en @/lib/pathUtils.
<!-- SECTION:DESCRIPTION:END -->
