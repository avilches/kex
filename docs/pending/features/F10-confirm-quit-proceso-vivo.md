# F10 - Confirmar salida de la app con un proceso de terminal vivo

## Que

Al cerrar la aplicacion entera (boton de cerrar ventana o Cmd+Q) cuando hay un proceso en foreground corriendo en alguna terminal, mostrar una confirmacion antes de salir. Hoy el fork solo avisa al cerrar una pane/tab de terminal concreta (`useTabCloseGuards`), no al salir de la app: el quit global mata los procesos sin preguntar.

Origen: feature del upstream `d782f7d` (`feat(window): confirm quit while a terminal process is running`), evaluado durante el sync 2026-06-22.

## Por que quedo pendiente

El approach del upstream (un hook React `useAppCloseGuard` con su propio `getCurrentWindow().onCloseRequested`) no encaja con la arquitectura de cierre del fork:

- El cierre se gestiona en `src/main.tsx` (imperativo, fuera de React): `onCloseRequested` llama `claimClose()` (guard de un solo uso, sin release), hace `flushEditors()` + `flushWorkspaceState()` y luego `destroy()`. Anadir un segundo `onCloseRequested` competiria con este y la ventana se destruiria ignorando el dialogo.
- Hay un segundo path de salida para Cmd+Q: menu Quit custom en Rust (`src-tauri/src/lib.rs`, `confirm_quit` + emit `kex:before-quit`); el frontend (`main.tsx`) escucha `kex:before-quit`, hace flush y llama `confirm_quit`. La confirmacion tendria que cubrir tambien este path.
- El fork no tiene el plugin `@tauri-apps/plugin-dialog`, asi que no hay un `ask()` nativo disponible sin anadir dependencia + capability.

Integrarlo con seguridad toca el flujo critico de flush-on-close (riesgo de perdida de datos si se rompe) y ambos paths de salida. Es UX, no correctness, y el fork ya cubre el caso por-pane. Se aplaza a una sesion dedicada.

## Approach propuesto (a verificar contra el codigo vivo)

Deteccion de terminal ocupada (reutilizable, ya disenada):

```ts
import { leafHasForegroundProcess } from "@/modules/terminal";
import { allPanes, type Workspace } from "@/modules/workspaces";

async function anyTerminalBusy(workspaces: Workspace[]): Promise<boolean> {
  const ids = workspaces.flatMap((w) =>
    allPanes(w.paneTree).flatMap((pane) =>
      pane.panels.filter((p) => p.kind === "terminal").map((p) => p.id),
    ),
  );
  if (ids.length === 0) return false;
  const checks = await Promise.all(ids.map(leafHasForegroundProcess));
  return checks.some(Boolean);
}
```

Integracion (elegir una):

1. **Dialogo React via puente.** En `main.tsx`, antes de `claimClose()`: `event.preventDefault()`, comprobar `anyTerminalBusy(snapshot)`; si hay proceso vivo, resolver una promesa que un componente React (estilo `CloseDialogs`, titulo "Quit Kex?") confirma o cancela. Solo tras confirmar: `claimClose()` + flush + `destroy()`. Cubrir tambien el handler de `kex:before-quit` para Cmd+Q. Requiere un modulo de coordinacion main.tsx<->React y respetar la semantica de `claimClose` (no consumir el claim si el usuario cancela).
2. **Dialogo nativo.** Anadir `@tauri-apps/plugin-dialog` (+ capability) y usar `ask()` en ambos paths de `main.tsx`. Mas simple, pero suma una dependencia al bundle.

El snapshot de workspaces para `main.tsx` puede venir de `workspaceState` (ya persiste el arbol) o de un getter expuesto desde React.

## Done

- Cerrar la app (ventana o Cmd+Q) con un proceso vivo pide confirmacion.
- Cancelar mantiene la app abierta sin consumir el claim de cierre ni perder el flush posterior.
- Confirmar hace flush de estado y sale.
- Sin regresiones en el flush-on-close ni en el flujo `confirm_quit` de Cmd+Q.
