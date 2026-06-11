# WebGL GPU en terminales — investigación y fix

Documentación completa del bug de WebGL al arrancar. Para contexto general del sistema ver
[WORKSPACES.md](WORKSPACES.md).

---

## El bug

Al arrancar con terminales restaurados, ningún terminal tiene GPU (WebGL). Los terminales
obtienen GPU solo cuando el usuario hace un split, y el terminal nuevo del split nunca lo
consigue.

---

## Causa raíz

La ventana arranca oculta (`visible: false` en `tauri.conf.json`) y se muestra a t=50ms.
Las fuentes están bundled y `document.fonts.ready` resuelve en ~1-5ms, por lo que `bindSlot`
se llama con la ventana todavía oculta. `main.tsx` dice explícitamente:

> "rAF is throttled while the window is hidden and would never fire"

`scheduleUnhide` usa doble rAF. Esos rAFs se encolan mientras la ventana está oculta, pero
cuando la ventana se muestra los rAFs **no disparan** (o se descartan). `attachWebgl` nunca
se llama para los terminales del arranque.

Los terminales existentes sí obtienen GPU cuando hay un split porque `react-resizable-panels`
redimensiona sus contenedores, el `ResizeObserver` detecta el cambio y llama `fitAddon.fit()`
directamente -- sin depender de rAF, y con la ventana ya visible y la GPU surface lista.

---

## Intentos fallidos

| Intento | Razón del fallo |
|---|---|
| `setWindowActive(true)` → `applyWebglToSlots()` | `windowActive` se inicializa como `true` en WKWebView (hasFocus=true aunque la ventana esté oculta). El guard `if (windowActive === active) return` bloquea el retry. |
| `prefsHydrated` en deps de useEffect | `loadPreferences()` puede resolver antes de `showWindow`. `applyWebglPreference` se llama pero la GPU surface no está lista. |
| `setTimeout(retry, 600)` en `configureRendererPool` | Se ejecuta **una vez al importar el módulo**. Para terminales creados después (split, Cmd+T) esos 600ms ya pasaron. |
| Backoff global `[300, 600, 1000, 1500, 2500, 4000]` | Mismo problema: se programa al importar, no cuando se crea cada terminal. |
| Per-slot retry desde `bindSlot` | `attachWebgl` sigue fallando a 200ms, 500ms, 1000ms. La GPU surface de WKWebView no está lista hasta un momento indeterminado post-show. |
| Mover unhide al outer rAF | El problema no es el timing unhide/attach; es que la GPU surface no existe todavía. |
| `ResizeObserver` retry en 0→real dims | Funciona para existentes tras split, no para el terminal nuevo por la razón anterior. |

---

## Fix (RESUELTO)

### rendererPool.ts: `retryMissingWebgl()`

Nueva función exportada que itera todos los slots activos sin WebGL y llama `attachWebgl`:

```typescript
export function retryMissingWebgl(): void {
  if (!usePreferencesStore.getState().terminalWebglEnabled) return;
  for (const slot of slots) {
    if (slot.currentLeafId !== null && !slot.webglAddon) {
      attachWebgl(slot);
      if (slot.webglAddon) {
        try { slot.term.refresh(0, slot.term.rows - 1); } catch {}
      }
    }
  }
}
```

### main.tsx: retry a t=350ms

```typescript
setTimeout(retryMissingWebgl, 350); // 300ms post-show (showWindow a t=50ms)
```

A t=350ms la GPU surface de WKWebView está inicializada. Los slots llevan ~345ms montados.
Es el único punto del código donde se sabe con certeza cuándo se mostró la ventana.

### Por qué funciona el timing de 350ms

Los rAFs de `scheduleUnhide` sí disparan después de que la ventana se muestra (a ~t=83ms,
dos frames tras showWindow). La GPU surface tarda un poco más en estar lista. A t=350ms
(300ms de margen post-show) la superficie es estable y `attachWebgl` tiene éxito.

La diferencia con los intentos anteriores: `retryMissingWebgl` se llama desde el único lugar
donde se conoce el momento exacto del show (`main.tsx`), no desde el pool donde ese momento
ya es historia.

---

## Bug secundario: badge GPU en PaneView no se actualizaba

El badge de debug (`{/* DEBUG — remove before ship */}`) en `PaneView.tsx` usaba
`setInterval(500ms)` para releer `poolSlotStats()`. El `setTick` del interval nunca causaba
re-renders (el state setter quedaba stale tras el primer render cycle). El badge solo
actualizaba cuando un workspace state change (como un split) forzaba un re-render.

**Fix**: sustituir `setInterval` + `setTick` por `useSyncExternalStore`:

```typescript
// PaneView.tsx
const stats = useSyncExternalStore(subscribeToPool, poolSlotStats);
```

```typescript
// rendererPool.ts
const poolSubscribers = new Set<() => void>();
let poolSnapshot: PoolSlotStat[] = [];

export function subscribeToPool(fn: () => void): () => void {
  poolSubscribers.add(fn);
  return () => { poolSubscribers.delete(fn); };
}

function notifyPool(): void {
  poolSnapshot = slots.map((s) => ({ ... }));
  for (const fn of poolSubscribers) fn();
}
// notifyPool() se llama en: attachWebgl (éxito), onContextLoss, bindSlot, detachSlotFromLeaf
```

`poolSlotStats()` devuelve la referencia cacheada `poolSnapshot` -- misma referencia entre
notificaciones, lo que cumple el contrato de `useSyncExternalStore` (getSnapshot debe ser
estable para evitar infinite loops).

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `src/modules/terminal/lib/rendererPool.ts` | `retryMissingWebgl()`, `subscribeToPool()`, `notifyPool()`, `poolSnapshot` cacheado |
| `src/main.tsx` | `setTimeout(retryMissingWebgl, 350)` tras `showWindow` |
| `src/modules/workspaces/PaneView.tsx` | `useSyncExternalStore(subscribeToPool, poolSlotStats)` en badge |
