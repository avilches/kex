---
id: TASK-14
title: 'Terminal: clic en enlaces a ficheros generados por un agente'
status: To Do
assignee: []
created_date: '2026-09-04 01:21'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: medium
type: idea
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: PARCIAL con bug conocido (auditado 2026-06-30). La infraestructura esta implementada en src/modules/terminal/lib/terminalLinks.ts:

- PATH_PATTERNS (4 regex) detectan rutas absolutas, ~/, relativas y bare-relative en cada linea del buffer.
- provideLinks verifica que el fichero exista via fs_stat antes de mostrar el enlace (evita falsos positivos).
- Cmd+clic abre el fichero en el editor de Kex via dispatchFileLink.
- Los links OSC 8 file:// del agente son interceptados por un OscHandler custom y redirigidos al mismo flujo (en vez de abrir Finder).

Bug activo (documentado originalmente en un HANDOFF ya no presente en el repo, migrar el diagnostico si se recupera): provideLinks nunca se invoca (el link provider se registra en createSlot mientras el slot esta en el recycler; posible problema de timing o de lifecycle del ILinkProvider cuando el terminal se mueve al DOM visible). Diagnosticar de nuevo desde cero si no hay rastro del handoff original.

Nota relacionada (ver TODO.md, seccion Terminal: opciones de configuracion adicionales, y BUG conocido de terminalLinks): las rutas ~/... se pasan literales a fs_stat y Rust no expande ~ (workspace.rs:412), asi que el patron home-relative de PATH_PATTERNS nunca produce un enlace (hallazgo de AUDIT-2026-07-02).
<!-- SECTION:DESCRIPTION:END -->
