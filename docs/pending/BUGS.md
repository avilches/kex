# Kex - Índice de bugs

Cada bug es un fichero autocontenido y accionable por un agente en `docs/pending/bugs/`. Un agente puede ejecutar cualquiera de forma aislada: cada fichero incluye contexto del proyecto, ubicación `archivo:línea`, problema, impacto, fix concreto, criterios de aceptación, comandos de verificación y el test a añadir si toca un subsistema core.

Total: 34 bugs. 6 high, 12 medium, 16 low. Los marcados con asterisco se verificaron a mano.

## High

| ID | Título | Fichero |
| --- | --- | --- |
| BUG-02 | El diff no normaliza CRLF: fichero entero como cambiado | [bugs/BUG-02-diff-no-normaliza-crlf.md](bugs/BUG-02-diff-no-normaliza-crlf.md) |
| BUG-03 | Timer de autosave perdido al desmontar: pérdida de datos | [bugs/BUG-03-autosave-timer-perdido-al-desmontar.md](bugs/BUG-03-autosave-timer-perdido-al-desmontar.md) |
| BUG-04 | El editor del diff se reconstruye en cada cambio/tema | [bugs/BUG-04-diff-editor-reconstruido-por-cambio.md](bugs/BUG-04-diff-editor-reconstruido-por-cambio.md) |
| BUG-05 | Diffs grandes sin guardia por líneas (solo bytes) | [bugs/BUG-05-diffs-grandes-umbral-solo-bytes.md](bugs/BUG-05-diffs-grandes-umbral-solo-bytes.md) |
| BUG-06 | Rename staged: pathspec incompleto en `diff_content` | [bugs/BUG-06-diff-rename-staged-pathspec-incompleto.md](bugs/BUG-06-diff-rename-staged-pathspec-incompleto.md) |
| BUG-07 | `split_name_status_numstat` heurística TAB frágil | [bugs/BUG-07-split-name-status-numstat-heuristica-tab.md](bugs/BUG-07-split-name-status-numstat-heuristica-tab.md) |

## Medium

| ID | Título | Fichero |
| --- | --- | --- |
| BUG-08 | Fuga: bg procs nunca removidos del mapa (memoria) | [bugs/BUG-08-fuga-procesos-background-shellstate.md](bugs/BUG-08-fuga-procesos-background-shellstate.md) |
| BUG-09 | DnD context value sin memoizar: cascada de re-renders | [bugs/BUG-09-dnd-provider-context-value-rerenders.md](bugs/BUG-09-dnd-provider-context-value-rerenders.md) |
| BUG-10 | Persistencia serializa el árbol en cada `cd`/comando | [bugs/BUG-10-persistencia-serializa-arbol-completo.md](bugs/BUG-10-persistencia-serializa-arbol-completo.md) |
| BUG-11 | El flag `truncated` se ignora en el cliente | [bugs/BUG-11-flag-truncated-ignorado-cliente.md](bugs/BUG-11-flag-truncated-ignorado-cliente.md) |
| BUG-12 | TOCTOU: auto-autorización del repo root ascendente | [bugs/BUG-12-toctou-auto-autorizacion-repo-root.md](bugs/BUG-12-toctou-auto-autorizacion-repo-root.md) |
| BUG-13 | Detección de binario solo 8 KB: incoherencia | [bugs/BUG-13-deteccion-binario-8kb-incoherente.md](bugs/BUG-13-deteccion-binario-8kb-incoherente.md) |
| BUG-14 | `git show` no propaga truncamiento de blobs (memoria) | [bugs/BUG-14-git-show-truncamiento-blobs-memoria.md](bugs/BUG-14-git-show-truncamiento-blobs-memoria.md) |
| BUG-15 | `useFileTree` callbacks inestables: re-walk del árbol | [bugs/BUG-15-usefiletree-callbacks-inestables.md](bugs/BUG-15-usefiletree-callbacks-inestables.md) |
| BUG-16 | `WindowControls` fuga el listener `onResized` | [bugs/BUG-16-windowcontrols-leak-onresized.md](bugs/BUG-16-windowcontrols-leak-onresized.md) |
| BUG-17 | Búsqueda IPC sin cancelación: traversals redundantes | [bugs/BUG-17-busqueda-ipc-sin-cancelacion.md](bugs/BUG-17-busqueda-ipc-sin-cancelacion.md) |
| BUG-18 | Race de refetch `fs:changed` en el explorer | [bugs/BUG-18-race-refetch-fs-changed-explorer.md](bugs/BUG-18-race-refetch-fs-changed-explorer.md) |
| BUG-19 | Colores de temas custom sin validar (seguridad latente) | [bugs/BUG-19-temas-custom-colores-sin-validar.md](bugs/BUG-19-temas-custom-colores-sin-validar.md) |

## Low

| ID | Título | Fichero |
| --- | --- | --- |
| BUG-20 | `pty_open` autoriza la cwd aunque el spawn falle | [bugs/BUG-20-pty-open-autoriza-cwd-aunque-spawn-falle.md](bugs/BUG-20-pty-open-autoriza-cwd-aunque-spawn-falle.md) |
| BUG-21 | `WorkspaceRegistry` sin cota, `is_authorized` O(n) | [bugs/BUG-21-workspaceregistry-sin-cota-on.md](bugs/BUG-21-workspaceregistry-sin-cota-on.md) |
| BUG-22 | Debug `DEBUG_PANE_SIZE` activo en producción | [bugs/BUG-22-debug-pane-size-en-produccion.md](bugs/BUG-22-debug-pane-size-en-produccion.md) |
| BUG-23 | `console.log` en el hot path de persistencia | [bugs/BUG-23-console-log-persistencia-produccion.md](bugs/BUG-23-console-log-persistencia-produccion.md) |
| BUG-24 | `respawnSession`: bytes del pty viejo en vuelo | [bugs/BUG-24-respawnsession-dormantring-bytes-en-vuelo.md](bugs/BUG-24-respawnsession-dormantring-bytes-en-vuelo.md) |
| BUG-25 | Doble `destroy()` en carrera al cerrar | [bugs/BUG-25-doble-destroy-cierre-ultimo-panel.md](bugs/BUG-25-doble-destroy-cierre-ultimo-panel.md) |
| BUG-26 | Effect del diff depende de `source` inestable | [bugs/BUG-26-diff-effect-source-dep-recreated.md](bugs/BUG-26-diff-effect-source-dep-recreated.md) |
| BUG-27 | `countDiffLines` heurístico en vez de numstat | [bugs/BUG-27-countdifflines-heuristic-not-numstat.md](bugs/BUG-27-countdifflines-heuristic-not-numstat.md) |
| BUG-28 | `parse_renamed`: path vacío en truncamiento | [bugs/BUG-28-parse-renamed-empty-path-truncated.md](bugs/BUG-28-parse-renamed-empty-path-truncated.md) |
| BUG-29 | Split de paths por `"/"` (cross-platform) | [bugs/BUG-29-path-split-forward-slash-only.md](bugs/BUG-29-path-split-forward-slash-only.md) |
| BUG-30 | fs/autosave tragan errores (solo console) | [bugs/BUG-30-fs-mutations-autosave-swallow-errors.md](bugs/BUG-30-fs-mutations-autosave-swallow-errors.md) |
| BUG-31 | Preview de tema obsoleto tras cerrar la paleta | [bugs/BUG-31-theme-preview-stale-after-close.md](bugs/BUG-31-theme-preview-stale-after-close.md) |
| BUG-32 | `tab.selectByIndex` salta el guard de key | [bugs/BUG-32-selectbyindex-matcher-skips-key-guard.md](bugs/BUG-32-selectbyindex-matcher-skips-key-guard.md) |
| BUG-33 | `segmentsFromCwd` case-sensitive en Windows | [bugs/BUG-33-segmentsfromcwd-case-sensitive-home-windows.md](bugs/BUG-33-segmentsfromcwd-case-sensitive-home-windows.md) |
| BUG-34 | Quoting de `cd` roto en cmd.exe | [bugs/BUG-34-cd-quoting-breaks-cmd-fallback.md](bugs/BUG-34-cd-quoting-breaks-cmd-fallback.md) |
| BUG-35 | `usePresence` re-entrancy latente | [bugs/BUG-35-usepresence-mounted-in-deps-reentrancy.md](bugs/BUG-35-usepresence-mounted-in-deps-reentrancy.md) |

---

## Lo que está bien (verificado, no tocar)

- **PTY core:** `da_filter`, `agent_detect`, `ringbuffer`, Job Objects, orden de drop de `Session`, `SPAWN_LOCK`. Sólido y testeado.
- **Git seguridad:** todos los comandos git pasan por `is_authorized` (salvo BUG-12); cwd siempre vía `current_dir`/`--cd`; sin inyección de shell (args como `OsString`); `--` separa pathspecs; `sha_is_safe` restringe SHAs a hex; symlinks rechazados; timeouts y `MAX_OUTPUT_BYTES` acotan recursos; WSL distro validado contra traversal.
- **splitNode.ts:** operaciones puras inmutables, nunca eliminan el último pane, IDs vía `crypto.randomUUID()`. 53 tests.
- **Source control cliente:** lista de ficheros y commit graph virtualizados; cache de diffs LRU con dedup in-flight; refresh con debounce/throttle.
- **shellQuote:** injection-safe para posix y pwsh.
- Sin `dangerouslySetInnerHTML` en todo el frontend.
