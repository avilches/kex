# F2 - Stage / unstage / discard por hunk (y por línea)

**Prioridad: alta** (segunda tras el side-by-side). Es la diferencia entre un visor de diff y una herramienta de revisión real (VS Code, GitKraken, lazygit).

## Problema

Hoy el stage es solo por **fichero completo** (`src/modules/source-control/lib/useSourceControlPanel.ts:647`, comandos Rust `git_stage`/`git_unstage`). `docs/ARCHITECTURE.md:123` afirma falsamente que se puede hacer por hunks (ver D6). No hay `git apply --cached` parcial en el código.

## Objetivo

Desde el diff abierto en Source Control, permitir:

- Stage de un hunk concreto.
- Unstage de un hunk concreto (cuando se ve el diff staged).
- Discard de un hunk en el working tree.
- (Fase 2) selección por líneas dentro de un hunk.

## Diseño técnico

El mecanismo estándar es generar un patch parcial que contenga solo el/los hunk(s) seleccionados y aplicarlo con `git apply`:

- Stage de hunk: `git apply --cached <patch>` con el hunk en formato unified, header de fichero correcto y contadores `@@ -a,b +c,d @@` recalculados.
- Unstage de hunk: `git apply --cached --reverse <patch>` sobre el diff staged.
- Discard de hunk en worktree: `git apply --reverse <patch>`.

El backend ya tiene la infraestructura: ejecución gateada por autorización (`git/operations.rs`), `--` para pathspecs seguros, parsing robusto. Falta un comando nuevo.

### Comando Rust nuevo

`git_apply_patch(repo, patch: String, cached: bool, reverse: bool) -> Result<(), String>` en `git/operations.rs` + `git/commands.rs`:

- Validar autorización del repo (igual que el resto).
- Escribir el patch a stdin de `git apply` (no a un fichero temporal): `git apply [--cached] [--reverse] --unidiff-zero -` y feed por stdin.
- Validar el patch antes con `git apply --check` y devolver error claro si no aplica (working tree cambió desde que se generó el diff).
- Acotar tamaño del patch.

### Generación del patch parcial (frontend)

El cliente ya tiene `fallbackPatch` (el unified diff completo del fichero). Para un hunk:

1. Parsear el unified patch en hunks (`@@` headers). Un parser pequeño y puro en `src/modules/source-control/lib/patchHunks.ts` (testeable).
2. Para "stage hunk N", emitir un patch con el header del fichero (`diff --git`, `---`, `+++`) + solo el hunk N.
3. Para selección por líneas (fase 2), recomputar el hunk dejando como contexto las líneas no seleccionadas y recalculando los contadores.

## Plan accionable

1. **Backend:** añadir `git_apply_patch` (operations + commands + registrar en `lib.rs`), con `--check` previo y tests en `git_operations.rs` (stage de un hunk de un fichero con dos hunks; reverse; patch que no aplica → error).
2. **Lib pura:** `patchHunks.ts` - parser de unified diff a hunks y serializador de patch parcial por hunk. Tests con renames, ficheros nuevos, contexto, CRLF normalizado.
3. **UI:** botones "Stage hunk" / "Unstage hunk" / "Discard hunk" en la cabecera de cada hunk del diff (integrar con F1 una vez exista el side-by-side; en inline también es viable). Refrescar el status tras aplicar.
4. **Fase 2:** selección por líneas (checkbox/gutter en el diff) y patch line-level.
5. Actualizar `docs/ARCHITECTURE.md:123` para que la afirmación sea cierta (o quitarla hasta entonces).

## Criterios de aceptación

- Stage de un hunk deja el resto del fichero sin stagear; el status lo refleja.
- Unstage y discard por hunk funcionan y refrescan la vista.
- Un patch que ya no aplica (worktree cambió) da error claro, no corrompe el índice.
- Tests de backend y de `patchHunks.ts` en verde.

## Relacionado

- Se integra mejor sobre F1 (side-by-side) pero no lo bloquea (funciona también en inline).
- Resuelve D6.
