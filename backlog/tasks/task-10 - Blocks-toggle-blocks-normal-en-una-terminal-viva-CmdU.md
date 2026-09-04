---
id: TASK-10
title: 'Blocks: toggle blocks / normal en una terminal viva (Cmd+U)'
status: To Do
assignee: []
created_date: '2026-09-04 01:21'
labels: []
dependencies: []
references:
  - docs/TODO.md
priority: medium
type: idea
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Estado: idea anotada (2026-06-14). Hoy el hint Cmd+U switch en el prompt de un block terminal es decorativo: no hace nada.

Por que hoy no se hace: el modo blocks lo decide la shell al arrancar, leyendo la env var KEX_BLOCKS una sola vez en zshrc.zsh/bashrc.bash/init.fish/profile.ps1 (suprime su prompt para que el host dibuje la barra de input). Una shell ya arrancada no cambia su prompt aunque cambie la variable. Por eso alternar el modo en caliente exigiria re-spawnear el PTY (respawnSession), que es destructivo: borra el scrollback y mata el proceso en curso.

Camino para hacerlo limpio (no destructivo): dos piezas independientes:
1. Integracion de shell dinamica: que los scripts re-evaluen el modo en cada precmd (leyendo un fichero/var en vez de solo al arrancar), de modo que la supresion del prompt se pueda activar/desactivar sin reiniciar la shell.
2. Persistencia de sesion (tmux u otro): si la shell corre dentro de una sesion tmux persistente y Kex es solo un cliente attach, detach/re-attach no mata el proceso ni pierde el scrollback. Complementa al punto 1 para que el toggle sea totalmente no destructivo.

Frontend: al alternar el flag blocks del Panel + del Session, hay que re-vincular el slot para intercambiar los handlers OSC (BlockDecorations vs prompt/cwd tracker; hoy se eligen una sola vez en bindLeafToSlot).

Cuando se implemente: recuperar el shortcut real (terminal.toggleInput o equivalente) cableado a esta accion y el hint del prompt pasara a ser funcional. El estilo visual del hint ya esta puesto.
<!-- SECTION:DESCRIPTION:END -->
