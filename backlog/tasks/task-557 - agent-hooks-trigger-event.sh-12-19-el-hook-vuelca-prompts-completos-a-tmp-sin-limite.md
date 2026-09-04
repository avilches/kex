---
id: TASK-557
title: >-
  agent/hooks/trigger-event.sh:12-19 - el hook vuelca prompts completos a /tmp
  sin limite
status: To Do
assignee: []
created_date: '2026-09-04 01:24'
labels:
  - audit-2026-07-02
dependencies: []
references:
  - docs/pending/AUDIT-2026-07-02.md
priority: high
type: bug
ordinal: 557000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seccion 3, Seguridad, ALTA. El hook instalado en produccion vuelca el payload completo de cada evento (prompts del usuario, ultimos mensajes del asistente, cwd, titulos) en /tmp/kex-hook-<EVENT>.log y /tmp/kex-tab-<TAB>.log. En Linux multiusuario esos ficheros son legibles por otros usuarios, son objetivo de ataque de symlink en /tmp y crecen sin limite ni rotacion. Es "field discovery" (debug) que se ha quedado en el release. Fix: eliminar log_payload o moverlo a ~/.cache/kex/ con opt-in.
<!-- SECTION:DESCRIPTION:END -->
