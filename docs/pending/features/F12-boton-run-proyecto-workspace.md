# F12 - Boton Run para ejecutar el proyecto del workspace

**Prioridad:** Urgente
**Esfuerzo:** Medio

## Contexto

Un boton de "Run" en la barra superior que ejecuta el proyecto actual. El comando (o comandos) a ejecutar se configura por workspace, de modo que cada workspace sabe como arrancar su propio proyecto. Modelo de referencia: las "Run/Debug configurations" de los JetBrains.

## Cambios pedidos

1. **Run configs por workspace**: uno o varios comandos (`pnpm dev`, `cargo run`, `make start`, ...), cada uno con nombre, comando y cwd opcional.
2. **Boton Run en la barra superior**: lanza el comando configurado. Si hay varios, despliega un menu para elegir cual.
3. **Ejecucion visible** con estado (corriendo / parado) y forma de pararla.

## Notas de implementacion

- Modelo: extender `Workspace` con `runConfigs?: RunConfig[]` (`{ id, name, command, cwd? }`), persistido en `workspace-state.json` (debounce 300ms ya existente). Coordinar con otras extensiones pendientes del modelo `Workspace` (label, estados).
- Ejecucion: reusar la infra de procesos en background existente (`shell::shell_bg_spawn` / `shell_bg_logs` / `shell_bg_kill` / `shell_bg_list`, con ring-buffer de logs) o abrir un panel `terminal` dedicado con el comando. Decidir al disenar cual encaja mejor con el modelo de paneles y la visibilidad de la salida.
- Respetar la autorizacion de cwd del workspace.
- UI de configuracion: editor de run configs (en Settings del workspace o en un dialogo desde el propio boton Run).
- Validar comando y cwd en el boundary.

## Documentacion viva a actualizar al implementar

- `docs/ARCHITECTURE.md` + `docs/WORKSPACES.md`: nuevo campo `runConfigs` en el modelo `Workspace`.
- `AGENTS.md`: si el boton vive en un modulo nuevo o amplia `header/`.
- `docs/IPC.md`: solo si se anade una IPC nueva (si se reusa `shell_bg_*`, no).
- `docs/FORK.md`: feature anadida respecto al upstream.

## Criterios de aceptacion

- Cada workspace puede definir y persistir una o varias run configs.
- El boton Run ejecuta la config elegida con el cwd correcto; con varias configs se puede elegir.
- La salida de la ejecucion es visible y el proceso se puede parar.
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde; `cargo clippy` y `cargo test --locked` en verde.
