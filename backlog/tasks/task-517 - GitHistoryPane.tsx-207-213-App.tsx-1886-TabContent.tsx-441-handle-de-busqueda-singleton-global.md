---
id: TASK-517
title: >-
  GitHistoryPane.tsx:207-213 + App.tsx:1886 + TabContent.tsx:441 - handle de
  busqueda singleton global
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: bug
ordinal: 517000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. El handle de busqueda de git-history es un singleton global que ignora el tabId: con dos tabs de historia montados (nunca se desmontan), la busqueda del header filtra un pane oculto y el cleanup de uno anula el handle de otro. Fix: mapa por tabId.
<!-- SECTION:DESCRIPTION:END -->
