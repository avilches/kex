# Memory Index (terax-ai)

- [Worktree ownership](feedback_worktree_ownership.md) — Solo limpiar worktrees/ramas creados por mi en la sesion; instrumentar debug en worktree propio, no en el del usuario
- [SDD: verify HEAD parent after each subagent commit](feedback_sdd_verify_head_parent.md) — Un commit de implementer puede aterrizar sobre una base vieja y borrar el commit anterior en silencio; comprobar antes de generar el review package
- [Peligro de git stash compartido entre worktrees](feedback_shared_git_stash_danger.md) — Nunca usar git stash/checkout -- . como truco de diagnostico; la stash list es compartida entre todos los worktrees del repo
- [Nunca hacer reset --hard en el worktree principal](feedback_never_reset_main_worktree.md) — El usuario trabaja en main en paralelo y su HEAD se mueve; releer HEAD justo antes y recuperar con reflog + fsck --unreachable
- [Webview debug via fetch](reference_webview_debug_via_fetch.md) — La consola del webview no llega a ningun log accesible; instrumentar con fetch a un servidor HTTP local y relanzar el binario
- [cargo fmt y reset sobre main](feedback_fmt_y_reset_sobre_main.md) — cargo fmt toca ficheros ajenos (mirar `git show --stat` antes de mezclar) y un reset sobre main deja el trabajo suelto en el checkout del usuario; arreglar con un commit encima
