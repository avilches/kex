# F13 - Workspace: mostrar PRs del repo

**Prioridad:** Media
**Esfuerzo:** Medio

## Contexto

Enriquecer los workspaces para que muestren los Pull Requests del repositorio asociado: numero, titulo, estado, rama, autor. La idea es ver los PRs del repo del workspace sin salir de Kex.

Relacionado con la pieza "PR de la rama actual" anotada en la seccion "Workspace: label de texto + barra superior con contexto" de `docs/TODO.md`, pero aqui el alcance es mas amplio: la lista de PRs del repo, no solo el de la rama activa.

## Cambios pedidos

1. **Listar PRs** del repo del workspace activo (al menos los abiertos): numero, titulo, rama, autor, estado (open / draft / merged / closed; checks de CI si es viable).
2. **Resaltar** el PR asociado a la rama git actual del panel activo.
3. **Punto de entrada**: una vista en la columna derecha (junto a Explorer / Source Control / Git History) o un popover desde la barra superior. Decidir al disenar.

## Notas de implementacion

- Datos de GitHub: via `gh` CLI (`gh pr list --json number,title,headRefName,state,author,url`) si esta instalado, o la GitHub API con token del usuario. Valorar autenticacion y rate limits.
- Nueva IPC (p. ej. `git_list_prs` / `github_list_prs`) o llamada desde el frontend. Mantener el liston de perf: cachear y refrescar bajo demanda, nunca en bucle.
- Resolver repo y remote con la infra existente (`git_resolve_repo`, `git_remote_url`).
- Degradar con elegancia cuando no hay remote de GitHub, no hay `gh`, o no hay red.

## Documentacion viva a actualizar al implementar

- `docs/IPC.md`: nueva IPC de listado de PRs (si se hace en Rust).
- `docs/ARCHITECTURE.md` + `AGENTS.md`: nueva vista/modulo si aplica.
- `docs/FORK.md`: feature anadida respecto al upstream.

## Criterios de aceptacion

- Para un repo de GitHub, se listan los PRs con su metadata basica.
- El PR de la rama activa se distingue del resto.
- Sin remote de GitHub / sin `gh` / sin red, la UI lo indica sin romperse.
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde; si hay IPC nueva, `cargo clippy` y `cargo test --locked` en verde.
