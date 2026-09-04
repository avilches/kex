---
id: TASK-519
title: 'AgentNotificationsBridge.tsx:114 - handleSignal captura getState() al inicio'
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
ordinal: 519000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 1, Bugs frontend, MEDIA. handleSignal captura getState() al inicio; tras ensureSession(...) se lee store.sessions[tabId] del snapshot viejo, donde la sesion recien creada no existe: el primer signal de atencion para un tab sin sesion previa se descarta en silencio. Fix: releer getState() tras ensureSession.
<!-- SECTION:DESCRIPTION:END -->
