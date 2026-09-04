---
id: TASK-706
title: >-
  settings/store.ts - cada setter notifica dos veces (onChange local + evento
  prefs-changed que tambien llega a la propia ventana)
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
ordinal: 699000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 9, Optimizaciones, MEDIA. src/modules/settings/store.ts:479 + :1246 - En la ventana que escribe, cada setter notifica dos veces (onChange local + el evento prefs-changed que emit() tambien entrega a la propia ventana): dos renders por escritura para valores objeto, y doble listCustomThemes() + applyTheme por guardado de tema. Ignorar en el listener los payloads originados en la propia ventana.
<!-- SECTION:DESCRIPTION:END -->
