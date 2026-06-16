---
id: BUG-37
title: Blocks mode - atajos de teclado incompletos o rotos
area: blocks / shortcuts
severity: medium
---

## Descripcion

Dos problemas de atajos en el modo bloques:

1. **Sin hotkey para abrir un block terminal**: no hay atajo de teclado documentado ni funcional para crear/abrir un nuevo terminal dentro del modo bloques.

2. **Cmd+U (switch de bloque) se muestra pero no funciona**: la UI de bloques muestra `Cmd+U` como atajo para cambiar de bloque activo, pero al pulsarlo no hace nada.

## Impacto

El modo bloques es poco usable sin poder navegar entre bloques con el teclado, y la inconsistencia entre lo mostrado y lo que funciona genera confusion.

## Como reproducir

1. Entrar en blocks mode (panel terminal en modo bloques).
2. Pulsar `Cmd+U` -- no cambia de bloque.
3. Buscar atajo para abrir un nuevo block terminal -- no existe.

## Estado: RESUELTO (2026-06-15)

Ambos items ya estaban implementados:

1. `tab.newBlock` (Cmd+Shift+T) esta definido en `shortcuts.ts` y cableado en `shortcutHandlers` de `App.tsx`. `BlockWatermark` lo muestra correctamente.
2. La referencia a `Cmd+U` era stale. Los atajos de navegacion entre bloques son `blocks.prev` (Cmd+ArrowUp) y `blocks.next` (Cmd+ArrowDown), funcionan cuando el panel activo tiene `blocks: true`.

No se requieren cambios de codigo.
