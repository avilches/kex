# fs_search: async, cancelacion server-side y limite de profundidad

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer `fs_search` no bloqueante (`spawn_blocking`), anadir un generation counter que cancele scans superados antes de que terminen, y limitar la profundidad maxima de traversal (default 8, hard 16).

**Architecture:** Se extrae la logica de scan al interior de un `tauri::async_runtime::spawn_blocking`, liberando el hilo del runtime de Tauri. Un `FileSearchState` con `Arc<AtomicU64>` (mismo patron que `ContentSearchState` en `grep.rs`) permite que cada nueva query cancele el scan anterior revisando la generacion en cada iteracion del walker. Se anade `max_depth: Option<usize>` igual que ya tiene `fs_list_files`.

**Tech Stack:** Rust, Tauri 2, crate `ignore` (WalkBuilder), `std::sync::atomic`, `std::sync::Arc`.

## Global Constraints

- Sin em-dash en comentarios, commits ni docs.
- Sin emojis.
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde antes del commit.
- `cd src-tauri && cargo clippy && cargo test --locked` en verde antes del commit.
- Un solo commit al final de la tarea.

---

### Task 1: Optimizar `fs_search`: async, cancelacion y limite de profundidad

**Files:**
- Modify: `src-tauri/src/modules/fs/search.rs`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produce: `pub struct FileSearchState` (exported) con `generation: Arc<AtomicU64>`
- Produce: `pub async fn fs_search(state: tauri::State<'_, FileSearchState>, root: String, query: String, limit: Option<usize>, max_depth: Option<usize>, workspace: Option<WorkspaceEnv>, show_hidden: Option<bool>) -> Result<SearchResult, String>`
- La firma del IPC no cambia desde el frontend (el parametro `max_depth` es opcional; los valores existentes `root`, `query`, `limit`, `showHidden`, `workspace` son identicos).

- [ ] **Step 1: Anadir test que documente los valores esperados de las nuevas constantes**

Abre `src-tauri/src/modules/fs/search.rs`. Al final del bloque `#[cfg(test)]` existente, anade:

```rust
#[test]
fn depth_defaults_are_sane() {
    assert_eq!(DEFAULT_DEPTH, 8);
    assert_eq!(HARD_DEPTH, 16);
    assert!(DEFAULT_DEPTH <= HARD_DEPTH);
}
```

Este test fallara hasta que las constantes existan.

- [ ] **Step 2: Verificar que el test falla**

```bash
cd src-tauri && cargo test depth_defaults_are_sane 2>&1 | head -20
```

Salida esperada: error de compilacion `cannot find value DEFAULT_DEPTH` (las constantes aun no existen).

- [ ] **Step 3: Implementar todos los cambios en `search.rs`**

Reemplaza el contenido completo de `src-tauri/src/modules/fs/search.rs` con:

```rust
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use ignore::WalkBuilder;
use nucleo_matcher::pattern::{CaseMatching, Normalization, Pattern};
use nucleo_matcher::{Config, Matcher, Utf32Str};
use serde::Serialize;

use super::to_canon;
use crate::modules::workspace::{resolve_path, WorkspaceEnv};

#[derive(Serialize, Clone)]
pub struct SearchHit {
    /// Absolute path of the matched file.
    pub path: String,
    /// Path relative to the search root, for display.
    pub rel: String,
    /// File name only.
    pub name: String,
    pub is_dir: bool,
}

#[derive(Serialize)]
pub struct SearchResult {
    pub hits: Vec<SearchHit>,
    /// True if the scan stopped early (entry budget, hit cap, or superseded query).
    pub truncated: bool,
}

/// Hard cap on entries the walker is allowed to visit before bailing. Protects
/// against pathological roots like $HOME where there's no .gitignore and the
/// tree is effectively unbounded.
const MAX_SCANNED: usize = 50_000;

const DEFAULT_DEPTH: usize = 8;
const HARD_DEPTH: usize = 16;

/// Directory names pruned unconditionally — they're rarely useful in a
/// file-explorer search and they dominate scan time when present.
const PRUNE_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".turbo",
    ".cache",
    ".venv",
    "__pycache__",
];

/// Supersession counter for interactive file search. Each new query bumps the
/// generation; in-flight scans observe the change and quit early.
#[derive(Default)]
pub struct FileSearchState {
    generation: Arc<AtomicU64>,
}

#[tauri::command]
pub async fn fs_search(
    state: tauri::State<'_, FileSearchState>,
    root: String,
    query: String,
    limit: Option<usize>,
    max_depth: Option<usize>,
    workspace: Option<WorkspaceEnv>,
    show_hidden: Option<bool>,
) -> Result<SearchResult, String> {
    let q = query.trim().to_string();
    if q.is_empty() {
        return Ok(SearchResult {
            hits: Vec::new(),
            truncated: false,
        });
    }

    let my_gen = state.generation.fetch_add(1, Ordering::SeqCst) + 1;
    let gen = Arc::clone(&state.generation);

    let cap = limit.unwrap_or(200).min(1000);
    let depth = max_depth.unwrap_or(DEFAULT_DEPTH).clamp(1, HARD_DEPTH);
    let show_hidden = show_hidden.unwrap_or(false);
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = resolve_path(&root, &workspace);

    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }

    tauri::async_runtime::spawn_blocking(move || {
        let mut cands: Vec<SearchHit> = Vec::new();
        let mut scanned: usize = 0;
        let mut truncated = false;

        let walker = WalkBuilder::new(&root_path)
            .hidden(!show_hidden)
            .git_ignore(true)
            .git_global(true)
            .git_exclude(true)
            .ignore(true)
            .parents(true)
            .follow_links(false)
            .max_depth(Some(depth))
            .filter_entry(|dent| {
                if dent.depth() == 0 {
                    return true;
                }
                match dent.file_name().to_str() {
                    Some(name) => !PRUNE_DIRS.contains(&name),
                    None => true,
                }
            })
            .build();

        for dent in walker.flatten() {
            if gen.load(Ordering::SeqCst) != my_gen {
                truncated = true;
                break;
            }
            scanned += 1;
            if scanned > MAX_SCANNED {
                truncated = true;
                break;
            }
            let path = dent.path();
            if path == root_path {
                continue;
            }
            let rel = match path.strip_prefix(&root_path) {
                Ok(r) => to_canon(r),
                Err(_) => continue,
            };
            let name = path
                .file_name()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let is_dir = dent.file_type().map(|t| t.is_dir()).unwrap_or(false);
            cands.push(SearchHit {
                path: display_path(path, &root_path, &root, &workspace),
                rel,
                name,
                is_dir,
            });
        }

        let hits = rank_fuzzy(cands, &q, cap);
        Ok(SearchResult { hits, truncated })
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Fuzzy-rank candidates against the query (path-aware, smart-case), keeping
/// the top `cap`. Ties break toward shorter relative paths.
fn rank_fuzzy(cands: Vec<SearchHit>, query: &str, cap: usize) -> Vec<SearchHit> {
    let mut matcher = Matcher::new(Config::DEFAULT.match_paths());
    let pattern = Pattern::parse(query, CaseMatching::Smart, Normalization::Smart);
    let mut buf = Vec::new();

    let mut scored = Vec::with_capacity(cands.len());
    for (i, c) in cands.iter().enumerate() {
        if let Some(s) = pattern.score(Utf32Str::new(&c.rel, &mut buf), &mut matcher) {
            scored.push((s, i));
        }
    }
    scored.sort_by(|a, b| {
        b.0.cmp(&a.0)
            .then_with(|| cands[a.1].rel.len().cmp(&cands[b.1].rel.len()))
    });
    scored
        .into_iter()
        .take(cap)
        .map(|(_, i)| cands[i].clone())
        .collect()
}

#[derive(Serialize)]
pub struct ListFilesResult {
    pub files: Vec<String>,
    pub truncated: bool,
}

#[tauri::command]
pub fn fs_list_files(
    root: String,
    limit: Option<usize>,
    max_depth: Option<usize>,
    workspace: Option<WorkspaceEnv>,
    show_hidden: Option<bool>,
) -> Result<ListFilesResult, String> {
    const DEFAULT_LIMIT: usize = 2_000;
    const HARD_LIMIT: usize = 10_000;

    let cap = limit.unwrap_or(DEFAULT_LIMIT).clamp(1, HARD_LIMIT);
    let depth = max_depth.unwrap_or(DEFAULT_DEPTH).clamp(1, HARD_DEPTH);
    let show_hidden = show_hidden.unwrap_or(false);
    let workspace = WorkspaceEnv::from_option(workspace);
    let root_path = resolve_path(&root, &workspace);
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }

    let walker = WalkBuilder::new(&root_path)
        .hidden(!show_hidden)
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false)
        .max_depth(Some(depth))
        .filter_entry(|dent| {
            if dent.depth() == 0 {
                return true;
            }
            match dent.file_name().to_str() {
                Some(name) => !PRUNE_DIRS.contains(&name),
                None => true,
            }
        })
        .build();

    let mut files: Vec<String> = Vec::with_capacity(cap.min(256));
    let mut scanned: usize = 0;
    let mut truncated = false;

    for dent in walker.flatten() {
        scanned += 1;
        if scanned > MAX_SCANNED {
            truncated = true;
            break;
        }
        let is_file = dent.file_type().map(|t| t.is_file()).unwrap_or(false);
        if !is_file {
            continue;
        }
        let path = dent.path();
        let rel = match path.strip_prefix(&root_path) {
            Ok(r) => to_canon(r),
            Err(_) => continue,
        };
        if rel.is_empty() {
            continue;
        }
        files.push(rel);
        if files.len() >= cap {
            truncated = true;
            break;
        }
    }

    files.sort_by_key(|a| a.to_lowercase());
    Ok(ListFilesResult { files, truncated })
}

fn display_path(
    path: &std::path::Path,
    root_path: &std::path::Path,
    root_display: &str,
    workspace: &WorkspaceEnv,
) -> String {
    if workspace.is_wsl() {
        if let Ok(rel) = path.strip_prefix(root_path) {
            let rel = to_canon(rel);
            return if rel.is_empty() {
                root_display.to_string()
            } else if root_display.ends_with('/') {
                format!("{root_display}{rel}")
            } else {
                format!("{root_display}/{rel}")
            };
        }
    }
    to_canon(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hit(rel: &str) -> SearchHit {
        SearchHit {
            path: rel.to_string(),
            rel: rel.to_string(),
            name: rel.rsplit('/').next().unwrap_or(rel).to_string(),
            is_dir: false,
        }
    }

    #[test]
    fn rank_fuzzy_prefers_name_and_shorter_path() {
        let cands = vec![
            hit("src/deeply/nested/config.rs"),
            hit("config.rs"),
            hit("src/main.rs"),
        ];
        let out = rank_fuzzy(cands, "config", 10);
        assert_eq!(out[0].rel, "config.rs");
        assert!(!out.iter().any(|h| h.rel == "src/main.rs"));
    }

    #[test]
    fn rank_fuzzy_matches_subsequence() {
        let cands = vec![hit("CommandPalette.tsx"), hit("readme.md")];
        let out = rank_fuzzy(cands, "cmdp", 10);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].rel, "CommandPalette.tsx");
    }

    #[test]
    fn depth_defaults_are_sane() {
        assert_eq!(DEFAULT_DEPTH, 8);
        assert_eq!(HARD_DEPTH, 16);
        assert!(DEFAULT_DEPTH <= HARD_DEPTH);
    }
}
```

Nota sobre `fs_list_files`: ahora reutiliza las constantes del modulo (`DEFAULT_DEPTH`, `HARD_DEPTH`) en lugar de redefinirlas localmente. Los valores son identicos (8 y 16) y la firma de la funcion no cambia.

- [ ] **Step 4: Registrar `FileSearchState` en `lib.rs`**

Abre `src-tauri/src/lib.rs`. Busca la linea:

```rust
        .manage(fs::grep::ContentSearchState::default())
```

Anade inmediatamente despues:

```rust
        .manage(fs::search::FileSearchState::default())
```

El bloque queda asi:

```rust
        .manage(fs::grep::ContentSearchState::default())
        .manage(fs::search::FileSearchState::default())
```

- [ ] **Step 5: Verificar compilacion y tests de Rust**

```bash
cd src-tauri && cargo clippy 2>&1 | tail -20
```

Salida esperada: `warning: ...` o `Finished` sin errores `error[E...]`.

```bash
cd src-tauri && cargo test --locked 2>&1 | tail -20
```

Salida esperada: `test result: ok. X passed`.

Los tres tests de `search::tests` deben pasar: `rank_fuzzy_prefers_name_and_shorter_path`, `rank_fuzzy_matches_subsequence`, `depth_defaults_are_sane`.

- [ ] **Step 6: Verificar checks de frontend (sin cambios, pero por sanidad)**

```bash
pnpm lint && pnpm check-types && pnpm test 2>&1 | tail -20
```

Salida esperada: todos en verde. Los tests del frontend no tocan `fs_search` directamente.

- [ ] **Step 7: Actualizar PENDING.md: marcar BUG-17 como resuelto parcialmente**

`BUG-17` en `docs/PENDING.md` describe que los scans superados corren hasta el final. Nuestro cambio resuelve esto para `fs_search` (el generation counter detiene el scan anterior en cuanto llega una nueva query). El bug original describe `fs_grep_interactive` (busqueda de contenido), que sigue pendiente. Actualiza `docs/PENDING.md` para anotar que `fs_search` ya tiene cancelacion:

Busca la linea:
```
- [BUG-17](pending/bugs/BUG-17-busqueda-ipc-sin-cancelacion.md) — Busqueda IPC sin cancelacion
```

Cambiala a:
```
- [BUG-17](pending/bugs/BUG-17-busqueda-ipc-sin-cancelacion.md) — Busqueda IPC sin cancelacion (fs_search resuelto; fs_grep_interactive pendiente)
```

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/modules/fs/search.rs src-tauri/src/lib.rs docs/PENDING.md
git commit -m "perf(search): fs_search async, generation counter y max_depth"
```
