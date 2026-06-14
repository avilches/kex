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

## Hipotesis

- El handler de `Cmd+U` puede no estar registrado en el mapa de atajos de bloques, o puede estar registrado pero no llegar al componente activo.
- La hotkey para nuevo block terminal puede estar pendiente de definir en `src/modules/shortcuts/shortcuts.ts` y cablear en el bloque de bloques.
