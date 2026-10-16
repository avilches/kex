# User data

**`user-data/` tiene symlinks a las seis carpetas donde Kex escribe de verdad**, para no tener
que acordarse de cuál es cuál ni escribir la ruta a mano. Es el mismo patrón que llevan
Yottacast y el software de Hub, y lo recrea `user-data/create-links.sh`, que es idempotente.

| Enlace | A dónde | Qué hay dentro |
|---|---|---|
| `user-data/logs` | `~/Library/Logs/app.betauer.kex` | `Kex.log`, el log de la aplicación |
| `user-data/support` | `~/Library/Application Support/app.betauer.kex` | los `settings-*.json`, los temas, `workspaces.json` y `agent-sessions.json` del restore de sesiones |
| `user-data/config` | `~/.config/kex` | `hooks/`, con los ganchos de sesión que instala el agente |
| `user-data/cache` | `~/.cache/kex` | `shell-integration/`, lo que se inyecta en bash y zsh |
| `user-data/logs-dev` | `~/Library/Logs/app.betauer.kex.dev` | el `Kex.log` del build de desarrollo |
| `user-data/support-dev` | `~/Library/Application Support/app.betauer.kex.dev` | los mismos ficheros que `support`, pero del build de desarrollo |

`logs`, `support` y sus versiones `-dev` las nombra **Tauri** a partir del `identifier` de `src-tauri/tauri.conf.json`,
que hoy es `app.betauer.kex`: si cambia ahí, hay que cambiarlo en el script.

**`pnpm tauri dev` usa un identifier distinto, `app.betauer.kex.dev`** (y `productName: "Kex Dev"`),
para no pisar los datos del `.app` instalado mientras se programa Kex con él abierto a la vez. Lo
inyecta `src-tauri/build.rs` en el build de perfil `debug` vía la variable `TAURI_CONFIG`, que
`tauri::generate_context!()` mezcla sobre `tauri.conf.json` en tiempo de compilación; `pnpm tauri
build` (perfil `release`) no la toca y sigue usando `app.betauer.kex`. `config` y `cache`
(`~/.config/kex`, `~/.cache/kex`) no tienen equivalente `-dev` porque no dependen del identifier:
son la integración con Claude Code y con la shell, no datos de usuario, y se comparten a propósito
entre ambas versiones.

**En la máquina hay además carpetas de `terax`** (`~/.config/terax`, `~/.cache/terax` y
`~/Library/Application Support/app.crynta.terax`), y **no se enlazan porque el código de Kex no
las toca**: son del upstream del que esto es un fork, y solo aparecen en la documentación. Si
algún día se leyeran al arrancar, entrarían como `upstream-config` y `upstream-cache`.

De `user-data/` **solo se versiona el script**: los enlaces son de esta máquina y los ignora el
`.gitignore`, con una excepción para él, porque sin versionarlo un clon nuevo se queda sin la
carpeta y sin forma de rehacerla.
