---
id: TASK-531
title: >-
  NewEditorDialog.tsx:60-70 - includes('..') rechaza nombres legitimos, no
  detecta rutas Windows
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
ordinal: 531000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, BAJA. includes("..") rechaza nombres legitimos (foo..txt) y no detecta rutas absolutas Windows (C:/foo). Fix: validar por segmentos y ^[A-Za-z]:.
<!-- SECTION:DESCRIPTION:END -->
