---
name: feedback-worktree-ownership
description: "Only clean up worktrees/branches I created this session; never touch the user's worktrees, and don't leave debug edits in them"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: ea2f82b1-d084-4cea-9d42-4c1f094aa010
---

El usuario corrige: "no limpies worktrees que no sean los tuyos de esta sesion. Cierra lo tuyo (mergea y borra)".

**Why:** El usuario mantiene sus propios worktrees en `.claude/worktrees/` (p. ej. `fix-git-root`) y corre el dev server (`pnpm tauri dev`) desde uno de ellos. Son trabajo suyo en curso, no mio.

**How to apply:**
- Solo borrar/mergear worktrees y ramas que yo haya creado en la sesion actual. Nunca borrar los del usuario aunque parezcan candidatos (mergeados, etc.); preguntar o dejarlos.
- Para trabajo o instrumentacion de debug, crear SIEMPRE mi propio worktree (`.claude/worktrees/<branch>` desde main) y trabajar ahi. No editar el worktree que el usuario tiene corriendo: si dejo cambios sin commitear ahi y el usuario commitea su propio trabajo, mis ediciones de debug se cuelan en su commit (paso en esta sesion: instrumentacion `[KEXDBG]` quedo commiteada en `279f839` de `fix-git-root`).
- Para extraer un fix hecho en el worktree del usuario hacia main: generar patch (`git diff main -- <file>`), crear worktree propio desde main, aplicar, commit atomico, merge ff a main, borrar mi worktree.
