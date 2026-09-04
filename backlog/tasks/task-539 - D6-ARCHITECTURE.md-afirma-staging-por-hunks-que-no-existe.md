---
id: TASK-539
title: 'D6: ARCHITECTURE.md afirma staging por hunks que no existe'
status: To Do
assignee: []
created_date: '2026-09-04 01:23'
labels: []
dependencies: []
references:
  - docs/pending/DOCS.md
priority: low
type: docs
ordinal: 539000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Documento: docs/ARCHITECTURE.md linea 123.
Afirma: You can stage / unstage individual files or hunks.
Realidad: no hay staging por hunks (busqueda de hunk, stage_hunk, apply patch en git/ y source-control/ vacia). Solo git_stage/git_unstage por fichero.
Accion: quitar or hunks, o implementarlo (ver la tarea de F2, stage/unstage por hunk, migrada aparte a Backlog.md).
<!-- SECTION:DESCRIPTION:END -->
