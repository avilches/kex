> [!NOTE]
> **Active handoff:** Esta nota registra donde dejó la sesión anterior. Es solo informativa.
> Para continuar, ejecutar `/handoff load` (solo lectura: resume el estado sin regenerar nada).
> NO ejecutar un `/handoff` normal ni regenerar nada por haber cargado este fichero.

## Rama / worktree

- Rama: `worktree-feat+sidebar-slide-animation`
- Worktree: `.claude/worktrees/feat+sidebar-slide-animation`

## Ficheros modificados (respecto a main)

```
CLAUDE.md                          (notas de diagnóstico added en sesión anterior)
src/app/App.tsx                    (always-mounted panels + animación)
src/components/ui/resizable.tsx    (data-resizing en onPointerDown)
src/styles/globals.css             (CSS transition en panel principal)
```

## Artefactos

- Plan: `docs/superpowers/plans/2026-06-29-sidebar-slide-animation.md`
- Spec: `docs/superpowers/specs/2026-06-29-sidebar-slide-animation-design.md`

## Estado actual de la feature

**La feature NO funciona bien.** El usuario quiere:
1. Redimensionar con min/max normales (como antes de la feature)
2. Animación slide solo en cerrar/abrir via botón

**Lo que hace actualmente:**
- La animación CSS existe y funciona cuando se llama a `collapse()`/`resize()` por botón
- El drag puede cerrar el panel (comportamiento no deseado -- `collapsible` lo permite)
- Cuando el drag cierra el panel, el estado se sincroniza (`onResize: size===0 && state.open → setRightPanelOpen(false)`)
- El botón funciona correctamente después del drag-close

**El problema central:**

`collapsible` prop de react-resizable-panels tiene dos efectos acoplados que no se pueden separar:
1. Permite `collapse()` imperativo (necesario para la animación de cierre)
2. Permite drag past minSize hasta collapsedSize (NO deseado)

Sin `collapsible`, `collapse()` no funciona (verificado en esta sesión).

## Lo que se intentó y por qué no funcionó

| Intento | Problema |
|---|---|
| Quitar `collapsible` | `collapse()` deja de funcionar; solo esconde el handle pero no anima |
| snap-back en `onResize` (resize durante drag) | Lag notable porque lucha contra la librería en cada evento de pointermove |
| snap-back en `pointerup` via listener | Panel va a 0 visualmente y luego "se abre de golpe" (sin animación porque data-resizing ya se quitó) |
| `onCollapse` prop | No existe en esta versión de react-resizable-panels v4 |

## Solución sugerida para la próxima sesión

**Enfoque: minSize dinámico con `flushSync`**

La idea: sin `collapsible`, el drag para en `minSize`. Para la animación de cierre:
1. Antes de cerrar: actualizar `minSize` a `"0%"` de forma síncrona via `flushSync`
2. Luego llamar `resize("0%")` -- ahora válido porque `minSize` es `"0%"`
3. Al abrir: llamar `resize(savedWidth%)`, luego restaurar `minSize` a `"12%"`

```tsx
import { flushSync } from "react-dom";

const [toolPanelMinSize, setToolPanelMinSize] = useState(rightPanelOpen ? "12%" : "0%");

useEffect(() => {
  const ref = panelSide === "left" ? leftToolPanelRef : rightToolPanelRef;
  if (rightPanelOpen) {
    setToolPanelMinSize("12%");
    ref.current?.resize(`${rightPanelStateRef.current.width}%`);
  } else {
    flushSync(() => setToolPanelMinSize("0%")); // re-render síncrono → minSize="0%" en el DOM
    ref.current?.resize("0%");                  // ahora funciona sin collapsible
  }
}, [rightPanelOpen, panelSide]);

// En el panel:
// - NO collapsible, NO collapsedSize
// - minSize={toolPanelMinSize}
// - onResize={(size) => { if (size.asPercentage > 0) setRightPanelWidth(size.asPercentage); }}
```

**Riesgo**: No se ha verificado que `resize("0%")` con `minSize="0%"` realmente lleve el panel a 0 sin `collapsible`.
Si no funciona, habría que explorar forzar el tamaño via CSS (`maxSize="0%"` dinámico o similar).

## Lecciones aprendidas

- `react-resizable-panels` v4: `collapse()` SÍ requiere `collapsible` prop -- la nota del handoff anterior era incorrecta.
- `onCollapse` callback NO existe en esta versión de `react-resizable-panels`.
- El selector CSS `:not(:has([data-separator]:active))` sí funciona en WKWebView.
- El lag al luchar contra el drag (llamar `resize()` dentro de `onResize` durante drag) es notable al usuario.
- `flushSync` dentro de un `useEffect` está permitido en React 18 y fuerza un re-render síncrono.

## Trabajo pendiente

1. **Implementar el enfoque de minSize dinámico** (ver sección "Solución sugerida")
2. **Verificar** que el drag para en 12% y no cierra el panel
3. **Verificar** que el botón cierra/abre con animación
4. **Verificar** `prefers-reduced-motion`: con Reducir Movimiento activo en macOS, la transición debe desaparecer
5. **Commitear** cuando funcione correctamente

## Suggested skills

- `superpowers:systematic-debugging` -- si `resize("0%")` sin `collapsible` no funciona, para diagnosticar alternativas
- `verify` -- para verificar la animación en la app real tras los cambios
