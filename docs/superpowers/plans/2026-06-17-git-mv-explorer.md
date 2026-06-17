# git mv en Explorer (drag & drop y rename) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuando el usuario mueve o renombra un fichero/directorio en el explorer (drag & drop interno o rename inline), usar `git mv` si el fichero está trackeado en git, con fallback silencioso a `fs_rename` si no lo está.

**Architecture:** Se añade una función `operations::mv` en Rust que ejecuta `git mv` como subproceso, siguiendo el mismo patrón que el resto de operaciones git del módulo. Un nuevo comando Tauri `git_mv` lo expone al frontend. En `useFileTree.ts`, `movePath` y `commitRename` intentan `git_mv` primero; si Tauri devuelve error (fichero no trackeado, fuera de repo, etc.), caen silenciosamente a `fs_rename`.

**Tech Stack:** Rust (Tauri backend), TypeScript/React (frontend), `tempfile` crate para tests.

## Global Constraints

- Sin comentarios de código salvo que el WHY sea no obvio.
- Sin em-dash en ningún texto.
- Imports frontend siempre `@/...`, nunca relativos entre módulos.
- pnpm únicamente.
- Verificar con `cargo clippy`, `cargo test --locked`, `pnpm lint`, `pnpm check-types` antes de dar por terminado.

---

### Task 1: `operations::mv` con tests

**Files:**
- Modify: `src-tauri/src/modules/git/operations.rs` (añadir función `mv` y tests al final)

**Interfaces:**
- Produces: `pub fn mv(registry: &WorkspaceRegistry, from: &str, to: &str, workspace: &WorkspaceEnv) -> Result<()>`
- Consumes: `resolve_path` (de `crate::modules::workspace`), `canonical_dir`, `resolve_repo_in_authorized`, `ensure_git_available`, `run_git`, `ensure_success`, `display_path` — todas ya en scope dentro de `operations.rs`

- [ ] **Step 1: Escribir el test (fichero trackeado — happy path)**

Al final de `operations.rs`, dentro del bloque `#[cfg(test)] mod tests` existente (que ya tiene `use super::*`), añadir — justo antes del cierre `}` del mod:

```rust
    // dentro del mod tests existente — NO abrir un nuevo mod tests

    use std::process::Command as Cmd;
    use crate::modules::workspace::{WorkspaceEnv, WorkspaceRegistry};

    fn git_init_with_commit(dir: &std::path::Path) {
        Cmd::new("git").arg("init").current_dir(dir).status().unwrap();
        Cmd::new("git").args(["config", "user.email", "t@t.com"]).current_dir(dir).status().unwrap();
        Cmd::new("git").args(["config", "user.name", "T"]).current_dir(dir).status().unwrap();
        std::fs::write(dir.join("a.txt"), b"hello").unwrap();
        Cmd::new("git").args(["add", "a.txt"]).current_dir(dir).status().unwrap();
        Cmd::new("git").args(["commit", "-m", "init"]).current_dir(dir).status().unwrap();
    }

    #[test]
    fn mv_tracked_file_moves_and_stages_rename() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let from = dir.path().join("a.txt").to_string_lossy().into_owned();
        let to = dir.path().join("b.txt").to_string_lossy().into_owned();

        super::mv(&registry, &from, &to, &WorkspaceEnv::Local).unwrap();

        assert!(!dir.path().join("a.txt").exists());
        assert!(dir.path().join("b.txt").exists());

        // Verificar que el rename está staged (git status --porcelain debe contener R)
        let output = Cmd::new("git")
            .args(["status", "--porcelain"])
            .current_dir(dir.path())
            .output()
            .unwrap();
        let status = String::from_utf8_lossy(&output.stdout);
        assert!(status.contains("R "), "expected staged rename, got: {status}");
    }

    // cierre del bloque de tests de mv — los tres tests van seguidos dentro del mod tests

    #[test]
    fn mv_untracked_file_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        git_init_with_commit(dir.path());
        std::fs::write(dir.path().join("new.txt"), b"x").unwrap();

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let from = dir.path().join("new.txt").to_string_lossy().into_owned();
        let to = dir.path().join("moved.txt").to_string_lossy().into_owned();

        let result = super::mv(&registry, &from, &to, &WorkspaceEnv::Local);
        assert!(result.is_err(), "expected error for untracked file");
    }

    #[test]
    fn mv_outside_repo_returns_error() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("x.txt"), b"y").unwrap();

        let registry = WorkspaceRegistry::default();
        registry.authorize(dir.path()).unwrap();

        let from = dir.path().join("x.txt").to_string_lossy().into_owned();
        let to = dir.path().join("y.txt").to_string_lossy().into_owned();

        let result = super::mv(&registry, &from, &to, &WorkspaceEnv::Local);
        assert!(result.is_err(), "expected error outside git repo");
    }
    // fin de los tests añadidos — cierra con el `}` del mod tests existente
```

- [ ] **Step 2: Ejecutar tests para verificar que fallan**

```bash
cd src-tauri && cargo test git::operations::tests::mv_ -- --nocapture 2>&1 | head -30
```

Resultado esperado: error de compilación `cannot find function mv` (o similar).

- [ ] **Step 3: Implementar `operations::mv`**

Añadir ANTES del bloque `#[cfg(test)]`, al final de la lista de funciones públicas en `operations.rs`:

```rust
pub fn mv(
    registry: &WorkspaceRegistry,
    from: &str,
    to: &str,
    workspace: &WorkspaceEnv,
) -> Result<()> {
    use crate::modules::workspace::resolve_path;

    let from_path = resolve_path(from, workspace);
    let from_parent = from_path
        .parent()
        .map(|p| p.to_string_lossy().into_owned())
        .ok_or_else(|| GitError::NotADirectory(from.to_string()))?;

    let cwd = canonical_dir(registry, &from_parent, workspace)?;
    if !registry.is_authorized(&cwd.local_path) {
        return Err(GitError::PathOutsideWorkspace(cwd.local_path));
    }
    ensure_git_available(&cwd.workspace)?;

    let repo = resolve_repo_in_authorized(registry, &cwd)?.ok_or_else(|| {
        GitError::CommandFailed {
            context: "not a git repository",
            detail: from.to_string(),
        }
    })?;

    let to_path = resolve_path(to, workspace);

    // Compute repo-relative paths for git mv (git expects relative or absolute;
    // relative avoids any platform path separator issues).
    let from_rel = from_path
        .strip_prefix(&repo.local_path)
        .map(|r| r.to_string_lossy().replace('\\', "/"))
        .map_err(|_| GitError::PathOutsideWorkspace(from_path.clone()))?;
    let to_rel = to_path
        .strip_prefix(&repo.local_path)
        .map(|r| r.to_string_lossy().replace('\\', "/"))
        .map_err(|_| GitError::PathOutsideWorkspace(to_path))?;

    let output = run_git(
        &repo.workspace,
        Some(&repo.git_path),
        ["mv", "--", &from_rel, &to_rel],
        DEFAULT_TIMEOUT_SECS,
    )?;
    ensure_success(&output, "git mv failed")
}
```

Nota: `resolve_path`, `canonical_dir`, `resolve_repo_in_authorized`, `ensure_git_available`, `run_git`, `ensure_success`, `GitError`, `DEFAULT_TIMEOUT_SECS` ya están en scope dentro de `operations.rs`.

- [ ] **Step 4: Verificar que los tests pasan**

```bash
cd src-tauri && cargo test git::operations::tests::mv_ -- --nocapture
```

Resultado esperado: los tres tests pasan (tracked → OK, untracked → Err, no repo → Err).

- [ ] **Step 5: Clippy**

```bash
cd src-tauri && cargo clippy 2>&1 | grep -E "^error"
```

Resultado esperado: sin errores.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/modules/git/operations.rs
git commit -m "feat(git): añadir operations::mv para git mv con tests"
```

---

### Task 2: Comando Tauri `git_mv` + registro

**Files:**
- Modify: `src-tauri/src/modules/git/commands.rs` (añadir `git_mv`)
- Modify: `src-tauri/src/lib.rs` (registrar en `generate_handler!`)

**Interfaces:**
- Consumes: `operations::mv` definido en Task 1
- Produces: comando Tauri `"git_mv"` con parámetros `from: String, to: String, workspace: Option<WorkspaceEnv>`

- [ ] **Step 1: Añadir el comando en `commands.rs`**

Al final de `commands.rs`, antes del cierre del fichero:

```rust
#[tauri::command]
pub async fn git_mv(
    from: String,
    to: String,
    workspace: Option<WorkspaceEnv>,
    app: AppHandle,
) -> Result<(), String> {
    let workspace = WorkspaceEnv::from_option(workspace);
    blocking(app, move |r| {
        operations::mv(r, &from, &to, &workspace).map_err(Into::into)
    })
    .await
}
```

- [ ] **Step 2: Registrar en `lib.rs`**

En `src-tauri/src/lib.rs`, dentro del bloque `tauri::generate_handler![...]`, añadir `git::commands::git_mv` junto al resto de comandos `git_*`:

```rust
git::commands::git_remote_url,
git::commands::git_mv,         // <- añadir aquí
shell::shell_run_command,
```

- [ ] **Step 3: Compilar**

```bash
cd src-tauri && cargo build 2>&1 | grep -E "^error"
```

Resultado esperado: compila sin errores.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/modules/git/commands.rs src-tauri/src/lib.rs
git commit -m "feat(git): exponer git_mv como comando Tauri"
```

---

### Task 3: Frontend — `movePath` y `commitRename` con fallback

**Files:**
- Modify: `src/modules/explorer/lib/useFileTree.ts` (funciones `movePath` y `commitRename`)

**Interfaces:**
- Consumes: comando Tauri `"git_mv"` de Task 2, `invoke` de `@tauri-apps/api/core`, `currentWorkspaceEnv` de `@/modules/workspace`
- Produces: misma API pública de `useFileTree`; los llamadores (`FileExplorer`, `useDndMonitor`) no cambian

- [ ] **Step 1: Modificar `movePath`**

En `useFileTree.ts`, localizar la función `movePath` (líneas ~402-431). Reemplazar el bloque `try` completo:

```ts
// antes:
try {
  await invoke("fs_rename", {
    from,
    to,
    workspace: currentWorkspaceEnv(),
  });
  options?.onPathRenamed?.(from, to);
  await Promise.all([fetchChildren(dirname(from)), fetchChildren(toDir)]);
} catch (e) {
  console.error("fs_rename (move) failed:", e);
  toast.error(`Failed to move "${name}" to "${toDir}"`, {
    description: e instanceof Error ? e.message : String(e),
  });
}

// después:
try {
  try {
    await invoke("git_mv", { from, to, workspace: currentWorkspaceEnv() });
  } catch {
    await invoke("fs_rename", { from, to, workspace: currentWorkspaceEnv() });
  }
  options?.onPathRenamed?.(from, to);
  await Promise.all([fetchChildren(dirname(from)), fetchChildren(toDir)]);
} catch (e) {
  console.error("fs_rename (move) failed:", e);
  toast.error(`Failed to move "${name}" to "${toDir}"`, {
    description: e instanceof Error ? e.message : String(e),
  });
}
```

- [ ] **Step 2: Modificar `commitRename`**

En `useFileTree.ts`, localizar la función `commitRename` (líneas ~355-384). Reemplazar el bloque `try` interno:

```ts
// antes:
try {
  await invoke("fs_rename", {
    from: renaming,
    to,
    workspace: currentWorkspaceEnv(),
  });
  options?.onPathRenamed?.(renaming, to);
  await fetchChildren(parent);
} catch (e) {
  console.error("fs_rename failed:", e);
  toast.error(`Failed to rename to "${trimmed}"`, {
    description: e instanceof Error ? e.message : String(e),
  });
} finally {
  setRenaming(null);
}

// después:
try {
  try {
    await invoke("git_mv", { from: renaming, to, workspace: currentWorkspaceEnv() });
  } catch {
    await invoke("fs_rename", { from: renaming, to, workspace: currentWorkspaceEnv() });
  }
  options?.onPathRenamed?.(renaming, to);
  await fetchChildren(parent);
} catch (e) {
  console.error("fs_rename failed:", e);
  toast.error(`Failed to rename to "${trimmed}"`, {
    description: e instanceof Error ? e.message : String(e),
  });
} finally {
  setRenaming(null);
}
```

- [ ] **Step 3: Type-check y lint**

```bash
pnpm check-types && pnpm lint
```

Resultado esperado: 0 errores.

- [ ] **Step 4: Test manual — fichero trackeado**

1. Arrancar la app: `pnpm tauri dev`
2. Abrir un workspace con un repo git que tenga ficheros commiteados
3. Arrastrar un fichero trackeado a otra carpeta del mismo repo
4. Abrir el panel Source Control
5. Verificar que el fichero aparece como **renamed** (icono R) y NO como deleted + untracked

- [ ] **Step 5: Test manual — fichero no trackeado**

1. Crear un fichero nuevo en el explorer (botón New File) sin hacer `git add`
2. Arrastrar ese fichero a otra carpeta
3. Verificar que el fichero se mueve correctamente (sin error toast)
4. Verificar que NO aparece staged en Source Control (sigue siendo untracked en la nueva ubicación)

- [ ] **Step 6: Test manual — rename inline**

1. Doble click en un fichero trackeado → renombrar
2. Abrir Source Control → verificar que aparece como renamed (R), no como D + U

- [ ] **Step 7: Commit**

```bash
git add src/modules/explorer/lib/useFileTree.ts
git commit -m "feat(explorer): usar git mv al mover o renombrar ficheros trackeados"
```

---

### Task 4: Actualizar `docs/IPC.md`

**Files:**
- Modify: `docs/IPC.md`

- [ ] **Step 1: Añadir `git_mv` a la tabla**

En `docs/IPC.md`, en la tabla del bloque `git::*`, añadir la fila tras `git_remote_url`:

```markdown
| `git_mv` | Mover o renombrar un fichero/dir trackeado en git; stagea el rename automaticamente |
```

- [ ] **Step 2: Commit**

```bash
git add docs/IPC.md
git commit -m "docs: añadir git_mv a la tabla IPC"
```

---

## Verificación final

```bash
cd src-tauri && cargo test --locked && cargo clippy
pnpm lint && pnpm check-types && pnpm test
```
