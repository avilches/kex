# M5 - Cálculo de diff en Web Worker / virtualización para ficheros grandes

**Esfuerzo: alto. Impacto: medio** (necesario solo si se quieren subir los umbrales de tamaño del diff).

## Problema

`unifiedMergeView` (y `MergeView` tras F1) calcula el diff completo de forma síncrona en el hilo principal al montar. Con el umbral actual solo por bytes (BUG-05), un fichero de ~200 KB con miles de líneas cortas bloquea el render. No hay cómputo en worker ni virtualización propia del patch de fallback.

## Objetivo

No congelar nunca la UI al abrir un diff, independientemente del tamaño, manteniendo el listón ultraligero.

## Plan accionable

1. **Guardia inmediata (parte de F1/BUG-05):** umbral por líneas además de bytes; por encima, mostrar fallback en lugar de montar el editor de diff.
2. **Worker de diff:** mover el cómputo del diff (o el parsing de hunks de M3) a un Web Worker; el resultado se aplica al `MergeView`/render cuando llega, con un estado de carga.
3. **Virtualización del fallback_patch:** cuando se muestra el patch de texto plano (binarios/grandes), virtualizarlo (`@tanstack/react-virtual`, ya en deps) en lugar de renderizar miles de líneas.
4. Tests de los umbrales y de que el hilo principal no se bloquea (medible).

## Criterios de aceptación

- Abrir un fichero grande no produce jank perceptible; aparece estado de carga y luego el diff o el fallback virtualizado.
- Los umbrales (líneas/bytes) son configurables o documentados.

## Relacionado

- BUG-05, F1, M3.
