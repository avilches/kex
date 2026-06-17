# Spec: git mv en el Explorer (drag & drop y rename)

**Fecha**: 2026-06-17
**Estado**: aprobado

## Objetivo

Cuando el usuario mueve un fichero/directorio en el explorer (drag & drop o rename inline) y ese fichero está trackeado por git, la operacion debe ejecutar `git mv` en lugar de un rename de SO puro. Esto stagea automaticamente el rename en git, evitando que aparezca como "deleted + untracked" en el panel de Source Control.

## Comportamiento esperado

- Drag & drop de un fichero/dir trackeado: usa `git mv`, el rename queda staged.
- Rename inline (F2 / doble click) de un fichero/dir trackeado: igual.
- Fichero no trackeado (nuevo, nunca hecho `git add`): fallback silencioso a `fs_rename`. Sin toast, sin error.
- Fuera de un repo git: fallback silencioso a `fs_rename`.
- Directorios: `git mv dir/ newdir/` mueve todo el directorio en el FS (incluidos ficheros no trackeados dentro) y stagea los renames de los ficheros trackeados. No requiere tratamiento especial.

## Arquitectura

### Opcion elegida: nuevo comando Rust `git_mv` + fallback en frontend

Separacion de responsabilidades: `fs_rename` sigue siendo puro FS; `git_mv` es exclusivamente git. El frontend orquesta el fallback.

Alternativas descartadas:
- Modificar `fs_rename` para detectar git internamente: mezcla responsabilidades.
- Detectar trackeado via `gitStatus` en frontend: los ficheros clean no aparecen en el snapshot, falsa negativa para la mayoria de casos.

## Rust: nuevo comando `git_mv`

**Ubicacion**: funcion en `src-tauri/src/modules/git/operations.rs` + comando Tauri en `commands.rs`.

```rust
// operations.rs
pub fn mv(
    registry: &WorkspaceRegistry,
    from: &str,
    to: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    // 1. resolver cwd = directorio padre del origen
    // 2. verificar path dentro del workspace autorizado
    // 3. run_git(workspace, cwd, ["mv", "--", from_abs, to_abs])
}

// commands.rs
#[tauri::command]
pub async fn git_mv(
    from: String,
    to: String,
    workspace: Option<WorkspaceEnv>,
    registry: State<'_, WorkspaceRegistry>,
) -> Result<(), String>
```

- `from` y `to` son rutas absolutas (mismo contrato que `fs_rename`).
- Git devuelve exit code != 0 si el fichero no esta trackeado; el error se propaga como `Err(String)`.
- Se registra en `lib.rs` junto al resto de `git_*`.

## Frontend: `useFileTree.ts`

Dos funciones modificadas: `movePath` y `commitRename`.

Patron identico en ambas, sustituyendo la llamada directa a `fs_rename`:

```ts
try {
  await invoke("git_mv", { from, to, workspace: currentWorkspaceEnv() });
} catch {
  await invoke("fs_rename", { from, to, workspace: currentWorkspaceEnv() });
}
```

- El toast de error solo se muestra si `fs_rename` tambien falla (ambas operaciones fallan).
- Si solo falla `git_mv` y triunfa `fs_rename`: silencio total.
- El callback `onPathRenamed` se invoca igual en ambos casos.
- No hay cambios en los tipos ni en la API publica de `useFileTree`.
- Los llamadores (`FileExplorer`, `useDndMonitor`) no necesitan modificarse.

## Documentacion a actualizar

- `docs/IPC.md`: anadir `git_mv` a la tabla de comandos Tauri del modulo `git::*`.

## Alcance excluido

- Drop de ficheros desde el OS (Finder/Explorer): ese path usa `fs_copy`, no `fs_rename`. Fuera de scope.
- Confirmacion visual de que se uso `git mv` vs `fs_rename`: no se muestra, comportamiento transparente.
