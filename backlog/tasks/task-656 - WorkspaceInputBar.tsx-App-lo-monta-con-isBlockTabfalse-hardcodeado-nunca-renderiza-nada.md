---
id: TASK-656
title: >-
  WorkspaceInputBar.tsx - App lo monta con isBlockTab=false hardcodeado, nunca
  renderiza nada
status: To Do
assignee: []
created_date: '2026-09-04 01:32'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: task
ordinal: 649000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 5, Codigo muerto, MEDIA. src/app/components/WorkspaceInputBar.tsx + App.tsx:2794-2797 - App lo monta con isBlockTab={false} hardcodeado y el componente devuelve null en ese caso: nunca renderiza nada, pero ejecuta useBlockController(null) en cada render de App.
<!-- SECTION:DESCRIPTION:END -->
