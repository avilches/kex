# F6 - Snapshot persistente del scrollback del terminal entre sesiones

**Prioridad: media.** Mejora la sensación de "sesión continua" sin agentes ni peso significativo.

## Problema

Hoy el `snapshot` ANSI de cada terminal solo vive en memoria (`useTerminalSession`): se pierde al cerrar la app. Al reabrir se restaura el layout (panes/paneles) pero los terminales arrancan vacíos.

## Objetivo

Restaurar el contenido visible (scrollback acotado) de cada terminal al reabrir la app, no solo el layout. El shell se respawnea como ahora; lo que se restaura es el texto previo como contexto histórico (no interactivo).

## Diseño técnico

- Persistir el último snapshot ANSI por panel, **acotado** (p.ej. últimos N KB o M líneas), comprimido si es necesario.
- Guardarlo junto al estado de workspace pero en un fichero separado para no inflar `workspaces.json` ni interferir con su debounce (`scrollback.json` o por-panel). Importante a la luz de BUG-10: el scrollback es grande y no debe meterse en el árbol que se serializa en cada `cd`/comando.
- Al restaurar, escribir el snapshot en el xterm antes del primer prompt del shell nuevo, con un separador visual sutil ("- sesión anterior -").
- Cap de tamaño total configurable en settings (alineado con el control fino de memoria de la filosofía).

## Plan accionable

1. Definir el formato y el cap (líneas/bytes) del snapshot persistido.
2. Comando Rust `pty_save_snapshot(panelId, data)` / fichero gestionado, o reusar `tauri-plugin-store` en un namespace separado. Escritura debounced e independiente del estado de workspace.
3. En `useTerminalSession`, al persistir: serializar el snapshot acotado por panel.
4. Al restaurar: cargar y escribir en el xterm con separador, marcando como histórico (no re-ejecutar nada).
5. Settings: toggle "Restaurar contenido del terminal" + cap de tamaño.
6. Tests del acotado (truncado correcto por líneas/bytes) y de que no entra en `workspaces.json`.

## Criterios de aceptación

- Reabrir la app muestra el último contenido visible de cada terminal con un separador, y el shell sigue funcionando normalmente.
- El snapshot está acotado y vive fuera de `workspaces.json`.
- Se puede desactivar y ajustar el cap en settings.

## Relacionado

- No debe agravar BUG-10: mantener el scrollback fuera del árbol persistido.
