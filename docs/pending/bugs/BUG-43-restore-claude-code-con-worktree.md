---
id: BUG-43
title: Restore de sesion Claude Code cuando ha creado un worktree
area: agents / session-restore / workspaces
severity: medium
status: sin confirmar
---

## Descripcion

No esta verificado que el restore de sesion de Claude Code funcione cuando el agente ha creado un git worktree durante la sesion. El cwd del worktree puede no existir en el momento del restore, o la autorizacion del workspace puede no cubrirlo.

## Que probar

- Sesion de Claude Code que crea un worktree (`.claude/worktrees/<branch>`) y trabaja dentro de el. Reiniciar la app y comprobar si la sesion se restaura en el cwd correcto.
- Que pasa si el worktree ya no existe al restaurar (branch mergeada y worktree eliminado): el restore deberia degradar con gracia, no fallar el spawn ni quedar en un cwd invalido.
- Re-autorizacion del cwd del worktree en el registro de workspaces tras el restore.

## Impacto

Si el restore no maneja el worktree, la sesion del agente puede no recuperarse o arrancar en la raiz equivocada.

## Referencias

- `docs/AGENT_SESSION_RESTORE.md` (hooks, store JSON, algoritmo de restore).
- Registro de autorizacion de workspaces (`workspace_authorize` / `workspace_current_dir`).

## Pendiente

- Verificacion manual con un worktree vivo y con uno ya eliminado.
- Documentar el caso en `docs/AGENT_SESSION_RESTORE.md` si se confirma un agujero.
