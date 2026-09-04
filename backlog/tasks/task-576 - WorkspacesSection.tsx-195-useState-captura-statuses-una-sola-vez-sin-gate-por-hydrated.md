---
id: TASK-576
title: >-
  WorkspacesSection.tsx:195 - useState captura statuses una sola vez sin gate
  por hydrated
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: high
type: bug
ordinal: 503000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, ALTA. src/settings/sections/WorkspacesSection.tsx:195 - useState<WorkspaceStatus[]>(stored) captura los statuses una sola vez al montar, pero la ventana de Settings hidrata las preferencias de forma asincrona y no hay gate por hydrated. Si la seccion se monta antes de terminar la hidratacion, muestra DEFAULT_WORKSPACE_STATUSES y cualquier edicion (o el cleanup de desmontaje, que persiste statusesRef) machaca los statuses reales del usuario en settings-general.json. Fix: resincronizar cuando hydrated pase a true, o no renderizar hasta hidratar. Mismo patron de carrera en AppearanceSection.tsx:41 (showCustomInput/customValue para uiFont, severidad MEDIA, no migrado como tarea aparte, tenlo en cuenta al arreglar este).
<!-- SECTION:DESCRIPTION:END -->
