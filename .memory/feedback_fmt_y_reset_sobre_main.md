---
name: fmt-y-reset-sobre-main
description: cargo fmt reformatea ficheros ajenos y un reset sobre main deja el trabajo suelto en el checkout del usuario
metadata:
  node_type: memory
  type: feedback
---

Dos cosas que pasaron el 2026-10-18 al cerrar el trabajo de subagentes de OMP y OpenCode.

`cargo fmt` formatea todo el crate, no solo lo que se toco: el commit se llevo `actions/mod.rs` y `modules/mod.rs`, que no eran de la tarea. Antes de hacer commit en un worktree hay que mirar `git show --stat HEAD` y, si aparece un fichero ajeno, restaurarlo con `git checkout HEAD~1 -- <fichero>` y commitear aparte. Mejor aun: formatear solo lo propio con `rustfmt <fichero>`.

Al ver ese commit ya mezclado en `main`, se hizo `git reset --soft HEAD~1` sobre el checkout principal para deshacerlo. Eso dejo todos los cambios como modificaciones sin commitear en el checkout del usuario, mezclados con su trabajo, y el merge posterior fallo por un fichero sin trackear identico. No se perdio nada porque la rama del worktree tenia el commit, pero fue exactamente lo que `feedback_never_reset_main_worktree.md` prohibe.

Como aplicarlo: en `main` no se deshace nada. Si el merge ya esta hecho y es incorrecto, se arregla con un commit nuevo encima (`git revert -m 1`, o un commit que restaura los ficheros). Si todavia no se ha hecho el merge, se arregla en la rama del worktree y se mezcla despues.
