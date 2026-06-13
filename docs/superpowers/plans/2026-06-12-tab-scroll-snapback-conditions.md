# Tab Scroll Snap-back Conditions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el timer fijo de 800ms de snap-back por condiciones inteligentes: snap inmediato al perder el foco, o tras 5s con el ratón continuamente fuera de la barra de tabs.

**Architecture:** Todos los cambios son en `PaneTabBar.tsx`. Se añaden tres refs para rastrear "el usuario ha scrollado", si el ratón está dentro de la barra, y un timer de 5s para el leave. Dos `useEffect` manejan el snap-back por pérdida de foco (cambio de props + `window.blur`). Los handlers `onMouseEnter`/`onMouseLeave` inician y cancelan el timer de 5s. El snap-back en el timer solo ocurre si el pane sigue con foco en ese momento.

**Tech Stack:** React 19, TypeScript

---

### Task 1: Reemplazar refs de scroll y actualizar el efecto de activePanelId

**Files:**
- Modify: `src/modules/workspaces/PaneTabBar.tsx:132-157`

- [ ] **Step 1: Reemplazar `userScrollTimerRef` con tres nuevos refs**

Encuentra estas líneas (~132-136):
```tsx
const scrollContainerRef = useRef<HTMLDivElement>(null);
const activePanelIdRef = useRef(activePanelId);
const userScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

useEffect(() => { activePanelIdRef.current = activePanelId; });
```

Reemplaza con:
```tsx
const scrollContainerRef = useRef<HTMLDivElement>(null);
const activePanelIdRef = useRef(activePanelId);
const paneFocusedRef = useRef(paneFocused);
const isWorkspaceActiveRef = useRef(isWorkspaceActive);
const userScrolledRef = useRef(false);
const mouseLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const mouseInsideRef = useRef(true);

useEffect(() => { activePanelIdRef.current = activePanelId; });
useEffect(() => { paneFocusedRef.current = paneFocused; });
useEffect(() => { isWorkspaceActiveRef.current = isWorkspaceActive; });
```

- [ ] **Step 2: Actualizar el efecto de cambio de activePanelId**

Encuentra (~153-157):
```tsx
// Scroll active tab into view when it changes (unless user is browsing with wheel)
useEffect(() => {
  if (userScrollTimerRef.current) return;
  scrollActiveIntoView('auto');
}, [activePanelId]);
```

Reemplaza con:
```tsx
// Scroll active tab into view when it changes (unless user is browsing with wheel)
useEffect(() => {
  if (userScrolledRef.current) return;
  scrollActiveIntoView('auto');
}, [activePanelId]);
```

- [ ] **Step 3: Verificar tipos**

```bash
pnpm check-types
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/modules/workspaces/PaneTabBar.tsx
git commit -m "refactor(tabs): replace scroll timer ref with userScrolled + mouseLeave refs"
```

---

### Task 2: Reescribir el wheel handler (eliminar el timer de 800ms)

**Files:**
- Modify: `src/modules/workspaces/PaneTabBar.tsx:159-178`

- [ ] **Step 1: Reemplazar el useEffect de la rueda**

Encuentra (~159-178):
```tsx
// Wheel scroll: translate vertical delta to horizontal, snap back to active tab after idle
useEffect(() => {
  const container = scrollContainerRef.current;
  if (!container) return;
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    container.scrollLeft += delta;
    if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
    userScrollTimerRef.current = setTimeout(() => {
      userScrollTimerRef.current = null;
      scrollActiveIntoView('smooth');
    }, 800);
  };
  container.addEventListener('wheel', handleWheel, { passive: false });
  return () => {
    container.removeEventListener('wheel', handleWheel);
    if (userScrollTimerRef.current) clearTimeout(userScrollTimerRef.current);
  };
}, []);
```

Reemplaza con:
```tsx
// Wheel scroll: translate vertical delta to horizontal; snap-back managed by focus/mouse-leave logic
useEffect(() => {
  const container = scrollContainerRef.current;
  if (!container) return;
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    container.scrollLeft += delta;
    userScrolledRef.current = true;
    // Caso borde: scroll con trackpad mientras el puntero ya estaba fuera
    if (!mouseInsideRef.current && !mouseLeaveTimerRef.current) {
      mouseLeaveTimerRef.current = setTimeout(() => {
        mouseLeaveTimerRef.current = null;
        if (paneFocusedRef.current && isWorkspaceActiveRef.current) {
          userScrolledRef.current = false;
          scrollActiveIntoView('smooth');
        }
      }, 5000);
    }
  };
  container.addEventListener('wheel', handleWheel, { passive: false });
  return () => {
    container.removeEventListener('wheel', handleWheel);
    if (mouseLeaveTimerRef.current) clearTimeout(mouseLeaveTimerRef.current);
  };
}, []);
```

- [ ] **Step 2: Verificar tipos**

```bash
pnpm check-types
```

Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/modules/workspaces/PaneTabBar.tsx
git commit -m "feat(tabs): remove fixed snap-back timer, track userScrolled on wheel"
```

---

### Task 3: Añadir efectos de snap-back por pérdida de foco

**Files:**
- Modify: `src/modules/workspaces/PaneTabBar.tsx` (después del wheel useEffect)

- [ ] **Step 1: Añadir useEffect para pérdida de foco del pane o workspace**

Inmediatamente después del wheel `useEffect` (tras el bloque `}, []);`), añade:

```tsx
// Snap back immediately when this pane or workspace loses focus
useEffect(() => {
  if (!userScrolledRef.current) return;
  if (!paneFocused || !isWorkspaceActive) {
    userScrolledRef.current = false;
    if (mouseLeaveTimerRef.current) {
      clearTimeout(mouseLeaveTimerRef.current);
      mouseLeaveTimerRef.current = null;
    }
    scrollActiveIntoView('smooth');
  }
}, [paneFocused, isWorkspaceActive]);
```

- [ ] **Step 2: Añadir useEffect para blur de ventana del SO**

Inmediatamente después del efecto anterior:

```tsx
// Snap back when the OS window loses focus
useEffect(() => {
  const handleBlur = () => {
    if (!userScrolledRef.current) return;
    userScrolledRef.current = false;
    if (mouseLeaveTimerRef.current) {
      clearTimeout(mouseLeaveTimerRef.current);
      mouseLeaveTimerRef.current = null;
    }
    scrollActiveIntoView('smooth');
  };
  window.addEventListener('blur', handleBlur);
  return () => window.removeEventListener('blur', handleBlur);
}, []);
```

- [ ] **Step 3: Verificar tipos**

```bash
pnpm check-types
```

Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add src/modules/workspaces/PaneTabBar.tsx
git commit -m "feat(tabs): snap back to active tab on pane/workspace/window focus loss"
```

---

### Task 4: Añadir handlers onMouseEnter / onMouseLeave para el timer de 5s

**Files:**
- Modify: `src/modules/workspaces/PaneTabBar.tsx` (el div raíz del return)

- [ ] **Step 1: Añadir handlers al div contenedor**

Encuentra el div raíz del return (~212-237). Tiene `ref={scrollContainerRef}`, `className={cn(...)}`, y `onPointerDown`. Añade `onMouseEnter` y `onMouseLeave` entre `className` y `onPointerDown`:

```tsx
return (
  <div
    ref={scrollContainerRef}
    className={cn(
      "flex h-7 shrink-0 items-center overflow-x-auto bg-card/60 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      tabBarStyle === "connected"
        ? "gap-0 border-t border-border/60"
        : "gap-0.5 border-b border-border/60 px-1",
    )}
    onMouseEnter={() => {
      mouseInsideRef.current = true;
      if (mouseLeaveTimerRef.current) {
        clearTimeout(mouseLeaveTimerRef.current);
        mouseLeaveTimerRef.current = null;
      }
    }}
    onMouseLeave={() => {
      mouseInsideRef.current = false;
      if (!userScrolledRef.current) return;
      if (mouseLeaveTimerRef.current) clearTimeout(mouseLeaveTimerRef.current);
      mouseLeaveTimerRef.current = setTimeout(() => {
        mouseLeaveTimerRef.current = null;
        if (paneFocusedRef.current && isWorkspaceActiveRef.current) {
          userScrolledRef.current = false;
          scrollActiveIntoView('smooth');
        }
      }, 5000);
    }}
    onPointerDown={(e) => {
      // ... resto igual
```

El resto del JSX queda sin cambios.

- [ ] **Step 2: Ejecutar checks completos**

```bash
pnpm lint && pnpm check-types && pnpm test
```

Expected: todo pasa.

- [ ] **Step 3: Test manual — timer de 5s**

Lanza la app (`pnpm tauri dev`). Abre suficientes tabs para que desborden la barra. Haz scroll con la rueda del ratón:

1. Mueve el ratón FUERA de la barra de tabs y espera 5s completos → el tab activo debe hacer snap-back suavemente.
2. Mueve el ratón FUERA → vuelve DENTRO antes de 5s → no ocurre snap-back.
3. Mueve el ratón fuera → en algún momento durante los 5s haz click en un tab de OTRO pane → snap-back inmediato (condición 1 dispara antes que el timer).

- [ ] **Step 4: Test manual — pérdida de foco**

Con tabs scrolladas:

1. Haz click en un tab de un pane diferente → snap-back inmediato.
2. Cambia a un workspace diferente → snap-back inmediato.
3. Alt-Tab a otra ventana del SO → snap-back inmediato (visible al volver).
4. Vuelve a la app, scrollea tabs, sigue en el mismo pane → NO ocurre snap-back por simplemente tener el foco.

- [ ] **Step 5: Commit**

```bash
git add src/modules/workspaces/PaneTabBar.tsx
git commit -m "feat(tabs): start 5s snap-back timer on mouse leave, cancel on re-enter"
```
