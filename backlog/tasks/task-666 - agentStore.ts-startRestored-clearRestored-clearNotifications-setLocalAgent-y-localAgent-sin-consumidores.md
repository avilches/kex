---
id: TASK-666
title: >-
  agentStore.ts - startRestored, clearRestored, clearNotifications,
  setLocalAgent y localAgent sin consumidores
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
ordinal: 659000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 5, Codigo muerto, Maquinaria muerta dentro de modulos vivos, MEDIA. src/modules/agents/store/agentStore.ts - startRestored, clearRestored, clearNotifications, setLocalAgent y el estado localAgent sin consumidores; con ellos, el flag AgentSession.restored, LocalAgentState y AgentSource = "local" son inertes.
<!-- SECTION:DESCRIPTION:END -->
