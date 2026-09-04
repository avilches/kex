---
id: TASK-535
title: >-
  SourceControlPanel.tsx:736-751,963 - clone en curso no se mata al desmontar;
  boton Clear cierra el formulario
status: To Do
assignee: []
created_date: '2026-09-04 01:23'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: low
type: bug
ordinal: 535000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, BAJA. Un clone en curso no se mata al desmontar (proceso + ring buffer vivos en Rust), y el boton title="Clear" cierra todo el formulario en vez de limpiar el input.
<!-- SECTION:DESCRIPTION:END -->
