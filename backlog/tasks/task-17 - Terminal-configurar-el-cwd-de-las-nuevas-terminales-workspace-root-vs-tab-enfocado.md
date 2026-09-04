---
id: TASK-17
title: >-
  Terminal: configurar el cwd de las nuevas terminales (workspace root vs tab
  enfocado)
status: To Do
assignee: []
created_date: '2026-09-04 01:22'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: medium
type: idea
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: idea anotada (2026-06-24).

Permitir elegir, via preferencia, donde abre su cwd una terminal nueva: en el workspace root (Workspace.cwd) o en el cwd del tab/panel enfocado (heredar del terminal activo). Hoy el comportamiento esta hardcodeado a heredar del tab enfocado, con fallback al workspace root.

Comportamiento actual: App.tsx (openNewTerminal) crea el panel con cwd: activeCwdRef.current ?? ws.cwd. activeCwdRef.current es el cwd del panel activo visible, pero solo si es un terminal (si el panel activo es editor/git-history, es null), con fallback a ws.cwd (el workspace root). En Rust, spawn_cwd_or_home() valida y cae a HOME si el cwd es invalido o falta. Los mismos call sites de openPanel con cwd cubren tambien split-right, split-down y el nuevo bloque, que tendrian que respetar la misma preferencia.

Que falta: nueva preferencia (p. ej. newTerminalCwd: focused o workspaceRoot, default focused para conservar el comportamiento actual). Plumbing en src/modules/settings/store.ts. Leer la preferencia en App.tsx y elegir entre activeCwdRef.current con fallback a ws.cwd (modo focused) y ws.cwd directo (modo workspaceRoot), aplicandolo a todos los call sites de creacion de terminal. UI: es un ajuste global del editor/terminal, asi que va en TerminalSection de Settings.
<!-- SECTION:DESCRIPTION:END -->
