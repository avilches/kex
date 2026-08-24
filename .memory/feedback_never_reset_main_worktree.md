---
name: feedback-never-reset-main-worktree
description: Nunca hacer git reset --hard en el worktree principal; el usuario trabaja alli en paralelo y su HEAD se mueve durante una sesion SDD larga
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 086c9199-9bcf-49e7-a0eb-769ba7bc3b7f
  modified: 2026-08-11T12:23:42.625Z
---

Nunca ejecutar `git reset --hard` (ni ninguna operacion destructiva de git) en el worktree
principal. Durante una ejecucion SDD larga el usuario sigue trabajando en `main` en paralelo:
su HEAD avanza, hay ficheros en staging, y cualquier valor de HEAD leido hace unos minutos ya
esta obsoleto.

**Why:** en la sesion de notes-sidebar-view un subagente de fix commiteo por error en `main`
(commit 292e272) en vez de en la rama de la feature. Al diagnosticarlo, hice
`git reset --hard 1eb0b1f` sobre `main` usando un HEAD que habia leido antes; entre medias el
usuario habia mergeado toda la feature del rich markdown editor. El reset descarto 26 commits
suyos y borro un fichero que tenia en staging (`TIPTAP_VS_MILKDOWN.md`). Se recupero todo, pero
por suerte: el reflog tenia el commit (`git reset --hard d4131a0`) y el blob del fichero staged
seguia en la base de objetos como unreachable
(`git fsck --unreachable | grep blob`, luego `git cat-file -p <sha> > fichero`, hash verificado).

**How to apply:**
- Si un commit aterriza en la rama equivocada, la correccion es recrear el cambio en la rama
  correcta, no reescribir la historia de la rama equivocada.
- Antes de cualquier operacion destructiva: releer `git rev-parse HEAD` y `git status` en ese
  mismo momento, y confirmar con el usuario mostrando exactamente que commits se perderian
  (`git log --oneline <target>..HEAD`).
- Al despachar subagentes, dejar explicito en el prompt el path del worktree y que no toquen
  ningun otro directorio (ya se hace, pero un subagente igual se equivoca: verificar despues
  con `git log` en la rama esperada, no dar por bueno el hash que reporta).
- Recuperacion: `git reflog` para commits, `git fsck --unreachable` para blobs de ficheros que
  estaban en staging.

**Corolario, mismo tema, error distinto:** al commitear en el worktree principal, nunca hacer
`git add <rutas>` seguido de `git commit`. El commit se lleva el indice ENTERO, incluido lo que el
usuario ya tenia preparado de antes. Paso en la misma sesion: un commit de documentacion se llevo
dentro `TIPTAP_VS_MILKDOWN.md`, que el usuario tenia en staging sin querer commitear todavia. Usar
siempre `git commit -m "..." -- <rutas>`, que commitea solo esas rutas y deja el resto del indice
como estaba. Comprobar despues con `git show --name-only --format="" HEAD` que no se ha colado nada,
y con `git status --short` que el staging del usuario sigue igual. Corregir con
`git reset --soft HEAD~1` (seguro: no toca el arbol) y recommitear con la forma `--`.

Relacionado: [[feedback-sdd-verify-head-parent]], [[feedback-worktree-ownership]],
[[feedback-shared-git-stash-danger]].
