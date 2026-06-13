# BUG-19 [medium · seguridad latente] Los colores de temas custom no se validan como CSS

## Contexto del proyecto
Terax es un emulador de terminal open-source: backend Tauri 2 + Rust (portable-pty), frontend React 19 + TypeScript + xterm.js (webgl). Filosofia: ultraligero, rapido, eficiente en memoria; sin foco en agentes; buen diff de git en doble panel. Repo: /Users/avilches/Work/Proy/Repos/terax-ai. Convenciones: sin em-dash, sin emojis, imports `@/...` en frontend, comentarios solo del 'why'.

## Ubicacion
`src/modules/theme/validateTheme.ts:44` (parseColors), `:54-82` (parseTerminal)
Consumido en `src/modules/theme/applyTheme.ts:90-103`

## Problema
`parseColors` acepta cualquier string no vacio como color, y `applyTheme` lo escribe verbatim con `setProperty`. Hoy las CSS vars solo se consumen como color (`background-color`, `color`, `border-color`), no en `background:`/`mask:`/`content:`, asi que el path `url()` esta cerrado por el contexto de consumo. Pero un valor invalido rompe la UI en silencio, y se convierte en un vector de exfiltracion `url()` en cuanto un consumidor use una de estas vars en una propiedad url-capable.

## Impacto / repro
Un tema custom con un color invalido rompe la UI sin feedback al usuario. Riesgo de regresion futura: si una de estas vars se usa en una propiedad que admite `url()`, un tema malicioso podria exfiltrar via peticion de red.

Repro: importar un tema custom con un valor de color invalido (ej. `"not-a-color"` o `"url(https://evil/x)"`). Observar que se acepta y se escribe en la CSS var sin error.

## Fix
Validar cada color con `CSS.supports("color", v)` en `parseColors` y `parseTerminal`. Rechazar defensivamente valores que contengan `url(`, `image-set(` o `;`. Si algun color no valida, rechazar el tema completo con un error claro en `validateTheme`.

## Criterios de aceptacion
- Un color que no pasa `CSS.supports("color", v)` hace que `validateTheme` rechace el tema con un mensaje claro.
- Valores que contienen `url(`, `image-set(` o `;` se rechazan aunque pudieran parecer colores.
- Los temas built-in validos siguen pasando sin cambios.

## Verificacion
Frontend: `pnpm lint`, `pnpm check-types`, `pnpm test`. Verificar que importar un tema con color invalido produce error visible y no escribe la var.

## Test a anadir
Subsistema relacionado con seguridad (validacion de input de tema). Anadir tests a `validateTheme` que cubran: color valido aceptado, color invalido rechazado, y valores con `url(`/`image-set(`/`;` rechazados.
