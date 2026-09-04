---
id: TASK-556
title: >-
  html-preview/HtmlPreviewPane.tsx:26-28 - sandbox allow-same-origin en srcDoc
  anula el sandbox
status: To Do
assignee: []
created_date: '2026-09-04 01:23'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: high
type: bug
ordinal: 556000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 3, Seguridad, ALTA. El iframe de preview usa srcDoc con sandbox="allow-scripts allow-same-origin ...". Un documento srcdoc hereda el origen del padre, asi que esa combinacion anula el sandbox: cualquier <script> del HTML previsualizado accede a window.parent y con el a __TAURI_INTERNALS__, es decir, IPC completo (fs, shell, git). Previsualizar un HTML malicioso de un repo clonado ejecuta codigo con los privilegios de la app. Contrasta con BrowserPane.tsx:137, cuyo sandbox para URLs remotas si es seguro. Fix: quitar allow-same-origin (y servir por protocolo asset con origen distinto si el preview necesita assets locales).
<!-- SECTION:DESCRIPTION:END -->
