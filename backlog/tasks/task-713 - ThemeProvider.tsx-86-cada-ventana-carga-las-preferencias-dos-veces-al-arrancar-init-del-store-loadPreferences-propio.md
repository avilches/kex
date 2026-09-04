---
id: TASK-713
title: >-
  ThemeProvider.tsx:86 - cada ventana carga las preferencias dos veces al
  arrancar (init del store + loadPreferences propio)
status: To Do
assignee: []
created_date: '2026-09-04 01:34'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: low
type: task
ordinal: 706000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 9, Optimizaciones, BAJA. ThemeProvider.tsx:86 - Cada ventana carga las preferencias dos veces al arrancar (init del store + loadPreferences propio): 10 lecturas IPC en vez de 5.
<!-- SECTION:DESCRIPTION:END -->
