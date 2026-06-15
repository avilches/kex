# F7 - Exponer el estilo de tab bar en Settings

**Prioridad:** Baja
**Esfuerzo:** Bajo

## Contexto

Hay dos estilos de tab bar implementados y persistidos via `tabBarStyle` en `kex-settings.json`:

- `"connected"` (por defecto): pestañas pegadas al panel inferior, líneas divisorias compartidas, la pestaña activa se funde con el área de contenido del panel mediante una línea de acento de foco.
- `"pill"`: estilo flotante original, la pestaña activa se resalta con un fondo distinto.

La preferencia se almacena y reacciona en vivo, pero **no hay opción expuesta en la ventana de Settings**. Para cambiarla manualmente hay que llamar a `setTabBarStyle("pill")` o `setTabBarStyle("connected")` desde `src/modules/settings/store.ts`.

## Problema

El usuario no puede elegir el estilo sin editar código o el JSON de settings a mano.

## Fix

Añadir un control en la sección correspondiente de la ventana de Settings (`src/modules/settings/`) que lea y escriba `tabBarStyle` a través del store existente. Un selector de dos opciones (connected / pill) basta.

## Criterios de aceptación

- La opción aparece en Settings y refleja el valor actual de `tabBarStyle`.
- Cambiarla actualiza el estilo en vivo y persiste en `kex-settings.json`.
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde.
