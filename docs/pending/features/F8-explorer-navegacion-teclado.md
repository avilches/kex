# F8 - Navegacion del explorer por teclado

**Prioridad:** Media
**Esfuerzo:** Medio

## Contexto

El explorer de ficheros se maneja principalmente con raton. Falta una forma de moverse y operar sobre el arbol usando solo el teclado, y una forma clara de "entrar" en el explorer (darle foco) sin tocar el raton.

## Objetivo

- Poder dar foco al explorer mediante un atajo (nuevo `id` en el registry `src/modules/shortcuts/shortcuts.ts`, reasignable desde Settings; no hardcodear teclas).
- Alternativa / complemento: poder saltar al explorer desde la busqueda de ficheros de abajo (que el resultado o el foco "aterrice" en el explorer).
- Una vez con foco, navegar el arbol con flechas (arriba/abajo para moverse, derecha/izquierda para expandir/colapsar), Enter para abrir. Estas teclas de navegacion intrinsecas del widget pueden quedarse en el handler local (no son shortcuts de la app).

## Notas de implementacion

- El foco/activacion del explorer SI es un shortcut de la app: registrar `id` en `SHORTCUTS` y conectar el handler (ver regla "Shortcuts siempre configurables" en CLAUDE.md).
- Coordinar con F9: las operaciones de fichero por teclado (Supr para borrar, copiar/pegar/cortar) dependen de que el explorer tenga foco.
- El rename inline ya existe; al tener foco por teclado debe seguir funcionando (ver M9 para el rebind del atajo de rename).

## Criterios de aceptacion

- Existe un atajo configurable para enfocar el explorer y aparece en Settings.
- Con el explorer enfocado se puede navegar y abrir ficheros sin raton.
- `pnpm lint`, `pnpm check-types`, `pnpm test` en verde.
