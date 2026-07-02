# user-data

Symbolic links to the runtime directories that Kex uses during execution.
This folder is gitignored — nothing here goes to the repository.

Paths are determined by `tauri-plugin-log` and `tauri-plugin-store` using the bundle ID `app.betauer.kex`.

## Links

| Link     | Destino (macOS)                                        | Contenido                                              |
|----------|--------------------------------------------------------|--------------------------------------------------------|
| `config` | `~/Library/Application Support/app.betauer.kex`        | `settings-*.json`, `workspaces.json`, `workspaces/`    |
| `logs`   | `~/Library/Logs/app.betauer.kex`                       | `Kex.log` (log unificado Rust + frontend)              |

### Ficheros de interes en `config/`

| Fichero                  | Descripcion                                        |
|--------------------------|----------------------------------------------------|
| `settings-general.json`  | Preferencias generales (tema, editor, terminal...) |
| `settings-editor.json`   | Configuracion del editor                           |
| `settings-terminal.json` | Configuracion del terminal                         |
| `settings-shortcuts.json`| Atajos de teclado personalizados                   |
| `settings-tools.json`    | Editores externos y herramientas                   |
| `workspaces.json`        | Indice de ventanas y workspaces                    |
| `workspaces/<id>.json`   | Estado de cada workspace (panes, tabs, scripts)    |
| `agent-sessions.json`    | Sesiones de agentes (Claude Code) pendientes       |

## Recrear los links

Si los symlinks desaparecen (p. ej. tras clonar el repo en un equipo nuevo), ejecuta:

```bash
bash user-data/create-links.sh
```
