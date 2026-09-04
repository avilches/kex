---
id: TASK-552
title: >-
  lib.rs:228-254 - handler de Resized reescribe workspaces.json decenas de veces
  por segundo
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
ordinal: 552000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 2, Bugs backend Rust, BAJA. Durante un drag de resize (el skip "sin cambios" nunca aplica porque la geometria cambia en cada tick). Debounce recomendado.
<!-- SECTION:DESCRIPTION:END -->
