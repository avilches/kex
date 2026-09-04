---
id: TASK-561
title: >-
  fs/file.rs:48-52, workspace.rs:200-205 - fs_* no pasan por el registro de
  autorizacion
status: To Do
assignee: []
created_date: '2026-09-04 01:24'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: medium
type: bug
ordinal: 561000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 3, Seguridad, MEDIA. Decision documentada pero relevante: los comandos fs_* no pasan por el registro de autorizacion y bootstrap_registry autoriza $HOME entero, con lo que el gating de git/pty es en la practica simbolico. Merece al menos la deny-list de rutas sensibles que el propio comentario propone. Nota: revisar antes de trabajar si esto sigue siendo una decision deliberada; docs/pending/README.md (ya borrado en esta migracion) referenciaba una decision similar (F4, deny-list de autorizacion fs) como RESUELTA/descartada a proposito, documentada en docs/ARCHITECTURE.md paragrafo 4.2 - verificar si aplica tambien a este hallazgo antes de actuar.
<!-- SECTION:DESCRIPTION:END -->
